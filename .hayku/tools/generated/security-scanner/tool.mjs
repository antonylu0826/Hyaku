#!/usr/bin/env node

/**
 * Hayku Security Scanner
 *
 * 資安檢查閘門的執行層。掃描程式碼和依賴，產生審查報告。
 *
 * 用法：
 *   node tool.mjs <target-dir> [--output <report-path>] [--audit-deps]
 *
 * 範例：
 *   node tool.mjs ../../workspace/hayku-identity
 *   node tool.mjs ../../workspace/hayku-identity --audit-deps --output ./report.md
 *
 * 零外部依賴 — 只使用 Node.js 內建模組
 */

import { readdir, readFile, stat, access } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

// ─── 禁止規則定義 ───────────────────────────────────────

const RULES = [
  {
    id: 'NO_EVAL',
    severity: 'critical',
    description: '\u7981\u6b62\u4f7f\u7528 eval - \u7a0b\u5f0f\u78bc\u6ce8\u5165\u98a8\u96aa',
    pattern: /(?<!')(?<!")(?<!`)\beval\s*\(/g,
    fileTypes: ['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx'],
  },
  {
    id: 'NO_NEW_FUNCTION',
    severity: 'critical',
    description: '\u7981\u6b62\u4f7f\u7528 new Function - \u7a0b\u5f0f\u78bc\u6ce8\u5165\u98a8\u96aa',
    pattern: /(?<!')(?<!")(?<!`)new\s+Function\s*\(/g,
    fileTypes: ['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx'],
  },
  {
    id: 'NO_SQL_CONCAT',
    severity: 'critical',
    description: '禁止 SQL 字串拼接 — SQL injection 風險',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*[`'"]\s*\+|\$\{.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/gi,
    fileTypes: ['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx', '.py'],
  },
  {
    id: 'NO_HARDCODED_SECRETS',
    severity: 'critical',
    description: '禁止硬編碼密鑰/密碼/Token',
    pattern: /(?:password|secret|api_key|apikey|token|private_key)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    fileTypes: ['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx', '.py', '.env'],
    exclude: ['.env.example', '.env.sample', 'schema.ts', 'test'],
  },
  {
    id: 'NO_EXEC_INJECTION',
    severity: 'critical',
    description: '禁止 child_process.exec 拼接使用者輸入 — 命令注入風險',
    pattern: /exec(?:Sync)?\s*\(\s*(?:`[^`]*\$\{|['"][^'"]*['"]\s*\+)/g,
    fileTypes: ['.ts', '.js', '.mjs', '.cjs'],
  },
  {
    id: 'NO_DANGEROUS_FS',
    severity: 'critical',
    description: '禁止危險的檔案系統操作',
    pattern: /(?:rmSync|rmdirSync|unlinkSync)\s*\(\s*['"`]\/(?!tmp)/g,
    fileTypes: ['.ts', '.js', '.mjs', '.cjs'],
  },
  {
    id: 'NO_HAYKU_ACCESS',
    severity: 'high',
    description: '工具不應直接存取 .hayku/ 核心目錄（非自身目錄）',
    pattern: /['"`](?:\.\.\/)*\.hayku\/(?!tools\/generated\/)/g,
    fileTypes: ['.ts', '.js', '.mjs', '.cjs'],
    exclude: ['security-scanner'],
  },
  {
    id: 'WARN_HTTP_NO_TLS',
    severity: 'warning',
    description: '偵測到 HTTP（非 HTTPS）連線',
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/g,
    fileTypes: ['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx'],
  },
  {
    id: 'WARN_CORS_WILDCARD',
    severity: 'warning',
    description: 'CORS 使用萬用字元可能有安全風險',
    pattern: /['"]Access-Control-Allow-Origin['"]\s*[:,]\s*['"\*]/g,
    fileTypes: ['.ts', '.js', '.mjs', '.cjs'],
  },
];

// ─── 掃描的檔案類型 ─────────────────────────────────────

const SCAN_EXTENSIONS = new Set([
  '.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx',
  '.py', '.sh', '.env', '.json', '.yml', '.yaml',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '__pycache__', '.venv', 'venv',
  'test-fixtures',  // 測試用的漏洞樣本目錄
]);

// ─── 排除清單 ────────────────────────────────────────

async function loadIgnoreList(baseDir) {
  const ignorePatterns = [];
  try {
    const content = await readFile(join(baseDir, '.securityignore'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        ignorePatterns.push(trimmed);
      }
    }
  } catch {
    // 沒有 .securityignore 就不排除
  }
  return ignorePatterns;
}

function shouldIgnore(relativePath, ignorePatterns) {
  return ignorePatterns.some(pattern => relativePath.includes(pattern));
}

// ─── 檔案收集 ────────────────────────────────────────

async function collectFiles(dir, baseDir = dir) {
  const files = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...await collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (SCAN_EXTENSIONS.has(ext)) {
        files.push({
          path: fullPath,
          relativePath: relative(baseDir, fullPath),
          ext,
        });
      }
    }
  }

  return files;
}

// ─── 靜態分析 ────────────────────────────────────────

async function staticAnalysis(targetDir) {
  const findings = [];
  const files = await collectFiles(targetDir);
  const ignorePatterns = await loadIgnoreList(targetDir);

  for (const file of files) {
    if (shouldIgnore(file.relativePath, ignorePatterns)) continue;
    let content;
    try {
      content = await readFile(file.path, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (const rule of RULES) {
      // 檢查檔案類型是否適用
      if (!rule.fileTypes.includes(file.ext)) continue;

      // 檢查排除規則
      if (rule.exclude?.some(ex => file.relativePath.includes(ex))) continue;

      // 重設 regex
      rule.pattern.lastIndex = 0;

      let match;
      while ((match = rule.pattern.exec(content)) !== null) {
        // 計算行號
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        const lineText = lines[lineNumber - 1]?.trim() || '';

        // 跳過註解行和字串描述行（減少誤報）
        if (lineText.startsWith('//') || lineText.startsWith('*') || lineText.startsWith('/*')) continue;
        if (/^\s*description\s*[:=]/.test(lineText)) continue;

        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          description: rule.description,
          file: file.relativePath,
          line: lineNumber,
          snippet: lineText.substring(0, 120),
        });
      }
    }
  }

  return { files: files.length, findings };
}

// ─── 依賴審查 ────────────────────────────────────────

async function auditDependencies(targetDir) {
  const result = {
    hasPackageJson: false,
    totalDeps: 0,
    vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0 },
    auditOutput: '',
    passed: true,
  };

  // 檢查 package.json 是否存在
  try {
    await access(join(targetDir, 'package.json'));
    result.hasPackageJson = true;
  } catch {
    return result;
  }

  // 讀取 package.json 計算依賴數量
  try {
    const pkg = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});
    result.totalDeps = deps.length + devDeps.length;
  } catch {
    // ignore
  }

  // 檢查 node_modules 是否存在
  try {
    await access(join(targetDir, 'node_modules'));
  } catch {
    result.auditOutput = 'node_modules 不存在，跳過 npm audit（請先執行 npm install）';
    return result;
  }

  // 執行 npm audit
  try {
    const output = execSync('npm audit --json 2>/dev/null', {
      cwd: targetDir,
      encoding: 'utf-8',
      timeout: 30000,
    });

    const audit = JSON.parse(output);
    if (audit.metadata?.vulnerabilities) {
      result.vulnerabilities = {
        critical: audit.metadata.vulnerabilities.critical || 0,
        high: audit.metadata.vulnerabilities.high || 0,
        moderate: audit.metadata.vulnerabilities.moderate || 0,
        low: audit.metadata.vulnerabilities.low || 0,
      };
    }

    result.passed = result.vulnerabilities.critical === 0 && result.vulnerabilities.high === 0;
    result.auditOutput = `critical: ${result.vulnerabilities.critical}, high: ${result.vulnerabilities.high}, moderate: ${result.vulnerabilities.moderate}, low: ${result.vulnerabilities.low}`;
  } catch (err) {
    // npm audit 在有漏洞時會回傳非 0 exit code
    try {
      const output = err.stdout || '';
      const audit = JSON.parse(output);
      if (audit.metadata?.vulnerabilities) {
        result.vulnerabilities = {
          critical: audit.metadata.vulnerabilities.critical || 0,
          high: audit.metadata.vulnerabilities.high || 0,
          moderate: audit.metadata.vulnerabilities.moderate || 0,
          low: audit.metadata.vulnerabilities.low || 0,
        };
      }
      result.passed = result.vulnerabilities.critical === 0 && result.vulnerabilities.high === 0;
      result.auditOutput = `critical: ${result.vulnerabilities.critical}, high: ${result.vulnerabilities.high}, moderate: ${result.vulnerabilities.moderate}, low: ${result.vulnerabilities.low}`;
    } catch {
      result.auditOutput = '無法解析 npm audit 結果';
    }
  }

  return result;
}

// ─── 報告產生 ────────────────────────────────────────

function generateReport(targetDir, staticResult, depsResult, options) {
  const now = new Date().toISOString();
  const projectName = targetDir.split('/').pop() || targetDir.split('\\').pop();

  const criticalFindings = staticResult.findings.filter(f => f.severity === 'critical');
  const highFindings = staticResult.findings.filter(f => f.severity === 'high');
  const warningFindings = staticResult.findings.filter(f => f.severity === 'warning');

  const staticPassed = criticalFindings.length === 0 && highFindings.length === 0;
  const depsPassed = depsResult ? depsResult.passed : true;
  const overallPassed = staticPassed && depsPassed;

  let report = `---
scan_time: ${now}
target: ${projectName}
result: ${overallPassed ? 'PASSED' : 'FAILED'}
---

# 資安掃描報告 — ${projectName}

- 掃描時間：${now}
- 掃描檔案數：${staticResult.files}
- 總體結果：**${overallPassed ? '✅ 通過' : '❌ 未通過'}**

## 靜態分析

| 嚴重度 | 數量 |
|--------|------|
| Critical | ${criticalFindings.length} |
| High | ${highFindings.length} |
| Warning | ${warningFindings.length} |

`;

  if (staticResult.findings.length > 0) {
    report += `### 發現項目\n\n`;
    for (const f of staticResult.findings) {
      const icon = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : '🟡';
      report += `${icon} **[${f.ruleId}]** ${f.description}\n`;
      report += `   檔案：\`${f.file}:${f.line}\`\n`;
      report += `   程式碼：\`${f.snippet}\`\n\n`;
    }
  } else {
    report += `靜態分析未發現問題。\n\n`;
  }

  if (depsResult) {
    report += `## 依賴審查\n\n`;
    report += `- 套件總數：${depsResult.totalDeps}\n`;
    report += `- 漏洞掃描：${depsResult.auditOutput}\n`;
    report += `- 結果：**${depsResult.passed ? '✅ 通過' : '❌ 有高風險漏洞'}**\n\n`;
  }

  report += `## 結論\n\n`;
  if (overallPassed) {
    report += `此專案通過資安掃描，未發現 critical 或 high 等級問題。\n`;
  } else {
    report += `此專案**未通過**資安掃描，需修正以上問題後重新掃描。\n`;
  }

  return { report, passed: overallPassed };
}

// ─── 主程式 ──────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Hayku Security Scanner — 資安檢查閘門

用法：
  node tool.mjs <target-dir> [options]

選項：
  --audit-deps    同時執行 npm audit 依賴審查
  --output <path> 將報告寫入指定檔案
  --json          以 JSON 格式輸出結果
  --help          顯示此說明
`);
    process.exit(0);
  }

  const targetDir = args[0];
  const auditDeps = args.includes('--audit-deps');
  const jsonOutput = args.includes('--json');
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;

  // 驗證目標目錄
  try {
    const s = await stat(targetDir);
    if (!s.isDirectory()) {
      console.error(`錯誤：${targetDir} 不是目錄`);
      process.exit(1);
    }
  } catch {
    console.error(`錯誤：目錄 ${targetDir} 不存在`);
    process.exit(1);
  }

  // JSON 模式時進度訊息輸出到 stderr，避免污染 stdout
  const log = jsonOutput ? (...args) => console.error(...args) : console.log;

  log(`🔍 掃描目標：${targetDir}`);

  // 靜態分析
  log('📋 執行靜態分析...');
  const staticResult = await staticAnalysis(targetDir);
  log(`   掃描 ${staticResult.files} 個檔案，發現 ${staticResult.findings.length} 個問題`);

  // 依賴審查
  let depsResult = null;
  if (auditDeps) {
    log('📦 執行依賴審查...');
    depsResult = await auditDependencies(targetDir);
    log(`   ${depsResult.auditOutput}`);
  }

  // 產生報告
  const { report, passed } = generateReport(targetDir, staticResult, depsResult);

  if (jsonOutput) {
    // JSON 模式：只有 JSON 輸出到 stdout
    process.stdout.write(JSON.stringify({
      passed,
      static: staticResult,
      deps: depsResult,
    }, null, 2) + '\n');
  } else {
    console.log('\n' + report);
  }

  // 寫入報告檔案
  if (outputPath) {
    const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
    if (dir) await mkdir(dir, { recursive: true });
    await writeFile(outputPath, report, 'utf-8');
    log(`📄 報告已寫入：${outputPath}`);
  }

  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('掃描過程發生錯誤：', err.message);
  process.exit(2);
});
