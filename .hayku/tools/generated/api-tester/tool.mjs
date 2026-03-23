#!/usr/bin/env node

/**
 * Hayku API Tester
 *
 * 依序執行 HTTP 請求測試腳本，支援變數捕獲與斷言檢查。
 *
 * 用法：
 *   node tool.mjs <test-script.json> [--output <report-path>] [--verbose]
 *
 * 零外部依賴 — 只使用 Node.js 內建模組
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// ─── 變數系統 ────────────────────────────────────────

class VariableStore {
  constructor() {
    this.vars = {};
  }

  set(key, value) {
    this.vars[key] = value;
  }

  /** 替換字串中的 {{varName}} */
  resolve(input) {
    if (typeof input === 'string') {
      return input.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
        const val = this.get(key);
        return val !== undefined ? String(val) : `{{${key}}}`;
      });
    }
    if (typeof input === 'object' && input !== null) {
      if (Array.isArray(input)) {
        return input.map(item => this.resolve(item));
      }
      const resolved = {};
      for (const [k, v] of Object.entries(input)) {
        resolved[k] = this.resolve(v);
      }
      return resolved;
    }
    return input;
  }

  get(path) {
    const parts = path.split('.');
    let current = this.vars;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }
}

// ─── JSON Path 取值（簡易版）───────────────────────────

function getByPath(obj, path) {
  // 支援 $.foo.bar 或 foo.bar 格式
  const cleanPath = path.startsWith('$.') ? path.slice(2) : path;
  const parts = cleanPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    // 支援陣列索引 foo[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      current = current[arrayMatch[1]];
      if (Array.isArray(current)) {
        current = current[parseInt(arrayMatch[2])];
      } else {
        return undefined;
      }
    } else {
      current = current[part];
    }
  }
  return current;
}

// ─── HTTP 請求 ───────────────────────────────────────

async function httpRequest(method, url, headers = {}, body = null) {
  const startTime = Date.now();

  const options = {
    method: method.toUpperCase(),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const elapsed = Date.now() - startTime;

    let responseBody;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
      elapsed,
      error: null,
    };
  } catch (err) {
    return {
      status: 0,
      headers: {},
      body: null,
      elapsed: Date.now() - startTime,
      error: err.message,
    };
  }
}

// ─── 斷言引擎 ────────────────────────────────────────

function runAssertions(assertions, response) {
  const results = [];

  for (const [key, expected] of Object.entries(assertions)) {
    let actual;
    let label;

    if (key === 'status') {
      actual = response.status;
      label = 'HTTP Status';
    } else if (key.startsWith('header.')) {
      const headerName = key.slice(7).toLowerCase();
      actual = response.headers[headerName];
      label = `Header: ${headerName}`;
    } else if (key.startsWith('body.')) {
      actual = getByPath(response.body, key.slice(5));
      label = `Body: ${key.slice(5)}`;
    } else if (key === 'body') {
      actual = response.body;
      label = 'Body';
    } else {
      actual = getByPath(response.body, key);
      label = key;
    }

    // 支援特殊斷言
    if (typeof expected === 'string' && expected.startsWith('$exists')) {
      const passed = actual !== undefined && actual !== null;
      results.push({ label, expected: '存在', actual: passed ? '存在' : '不存在', passed });
    } else if (typeof expected === 'string' && expected.startsWith('$type:')) {
      const expectedType = expected.slice(6);
      const actualType = typeof actual;
      results.push({ label, expected: `type=${expectedType}`, actual: `type=${actualType}`, passed: actualType === expectedType });
    } else {
      // 直接比較
      const passed = JSON.stringify(actual) === JSON.stringify(expected);
      results.push({ label, expected, actual, passed });
    }
  }

  return results;
}

// ─── 變數捕獲 ────────────────────────────────────────

function captureVariables(captures, response, store) {
  if (!captures) return;

  for (const [varName, path] of Object.entries(captures)) {
    const value = getByPath(response.body, path);
    if (value !== undefined) {
      store.set(varName, value);
    }
  }
}

// ─── 執行測試腳本 ────────────────────────────────────

async function runTestScript(script, verbose = false) {
  const store = new VariableStore();
  const results = [];
  const startTime = Date.now();

  const log = verbose ? console.log : () => {};

  log(`\n🧪 ${script.name || '未命名測試'}`);
  log(`   Base URL: ${script.base_url}\n`);

  // 載入初始變數
  if (script.variables) {
    for (const [k, v] of Object.entries(script.variables)) {
      store.set(k, v);
    }
  }

  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    const stepName = step.name || `Step ${i + 1}`;

    log(`  ── ${stepName} ──`);

    // 解析變數
    const method = store.resolve(step.method || 'GET');
    const path = store.resolve(step.path);
    const url = `${store.resolve(script.base_url)}${path}`;
    const headers = step.headers ? store.resolve(step.headers) : {};
    const body = step.body ? store.resolve(step.body) : null;

    log(`     ${method} ${url}`);

    // 發送請求
    const response = await httpRequest(method, url, headers, body);

    if (response.error) {
      log(`     ❌ 連線錯誤：${response.error}`);
      results.push({
        step: stepName,
        method,
        path,
        status: 0,
        elapsed: response.elapsed,
        error: response.error,
        assertions: [],
        passed: false,
      });

      // 如果設定了 stopOnError，中斷執行
      if (script.stop_on_error !== false) {
        log(`     ⚠️ 中斷後續步驟`);
        break;
      }
      continue;
    }

    log(`     Status: ${response.status} (${response.elapsed}ms)`);

    // 捕獲變數
    if (step.capture) {
      captureVariables(step.capture, response, store);
      for (const [k, v] of Object.entries(step.capture)) {
        log(`     📌 ${k} = ${JSON.stringify(store.get(k)).substring(0, 80)}`);
      }
    }

    // 執行斷言
    let assertionResults = [];
    let allPassed = true;

    if (step.assert) {
      assertionResults = runAssertions(step.assert, response);
      for (const r of assertionResults) {
        if (r.passed) {
          log(`     ✅ ${r.label}: ${JSON.stringify(r.actual)}`);
        } else {
          log(`     ❌ ${r.label}: 預期 ${JSON.stringify(r.expected)}, 實際 ${JSON.stringify(r.actual)}`);
          allPassed = false;
        }
      }
    }

    results.push({
      step: stepName,
      method,
      path,
      status: response.status,
      elapsed: response.elapsed,
      error: null,
      assertions: assertionResults,
      passed: allPassed,
    });

    if (!allPassed && script.stop_on_error !== false) {
      log(`     ⚠️ 斷言失敗，中斷後續步驟`);
      break;
    }

    // 步驟間延遲
    if (step.delay) {
      await new Promise(r => setTimeout(r, step.delay));
    }
  }

  const totalElapsed = Date.now() - startTime;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  return {
    name: script.name || '未命名測試',
    totalSteps: script.steps.length,
    executedSteps: results.length,
    passed: passedCount,
    failed: failedCount,
    elapsed: totalElapsed,
    allPassed: failedCount === 0,
    results,
  };
}

// ─── 報告產生 ────────────────────────────────────────

function generateReport(testResult) {
  const now = new Date().toISOString();

  let report = `---
test_time: ${now}
name: ${testResult.name}
result: ${testResult.allPassed ? 'PASSED' : 'FAILED'}
---

# API 測試報告 — ${testResult.name}

- 測試時間：${now}
- 總步驟數：${testResult.totalSteps}
- 已執行：${testResult.executedSteps}
- 通過：${testResult.passed}
- 失敗：${testResult.failed}
- 總耗時：${testResult.elapsed}ms
- 結果：**${testResult.allPassed ? '✅ 全部通過' : '❌ 有失敗'}**

## 測試步驟

`;

  for (const r of testResult.results) {
    const icon = r.passed ? '✅' : '❌';
    report += `### ${icon} ${r.step}\n\n`;
    report += `- \`${r.method} ${r.path}\` → Status ${r.status} (${r.elapsed}ms)\n`;

    if (r.error) {
      report += `- 錯誤：${r.error}\n`;
    }

    if (r.assertions.length > 0) {
      report += `- 斷言：\n`;
      for (const a of r.assertions) {
        const aIcon = a.passed ? '✅' : '❌';
        if (a.passed) {
          report += `  - ${aIcon} ${a.label} = \`${JSON.stringify(a.actual)}\`\n`;
        } else {
          report += `  - ${aIcon} ${a.label}: 預期 \`${JSON.stringify(a.expected)}\`, 實際 \`${JSON.stringify(a.actual)}\`\n`;
        }
      }
    }

    report += '\n';
  }

  return report;
}

// ─── 主程式 ──────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Hayku API Tester — API 測試工具

用法：
  node tool.mjs <test-script.json> [options]

選項：
  --output <path>  將報告寫入指定檔案
  --verbose        顯示詳細執行過程
  --json           以 JSON 格式輸出結果
  --help           顯示此說明

測試腳本格式（JSON）：
  {
    "name": "測試名稱",
    "base_url": "http://localhost:3100",
    "stop_on_error": true,
    "steps": [
      {
        "name": "步驟名稱",
        "method": "POST",
        "path": "/auth/register",
        "headers": { "Authorization": "Bearer {{token}}" },
        "body": { "email": "test@example.com" },
        "assert": { "status": 201, "body.id": "$exists" },
        "capture": { "token": "$.token", "userId": "$.user.id" },
        "delay": 100
      }
    ]
  }
`);
    process.exit(0);
  }

  const scriptPath = resolve(args[0]);
  const verbose = args.includes('--verbose');
  const jsonOutput = args.includes('--json');
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;

  // 讀取測試腳本
  let script;
  try {
    const content = await readFile(scriptPath, 'utf-8');
    script = JSON.parse(content);
  } catch (err) {
    console.error(`錯誤：無法讀取測試腳本 ${scriptPath}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  // 驗證腳本格式
  if (!script.base_url || !Array.isArray(script.steps)) {
    console.error('錯誤：測試腳本必須包含 base_url 和 steps');
    process.exit(1);
  }

  // 執行測試
  const result = await runTestScript(script, verbose || !jsonOutput);

  // 輸出結果
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n📊 結果：${result.passed} 通過, ${result.failed} 失敗, ${result.elapsed}ms`);
    console.log(result.allPassed ? '✅ 全部通過' : '❌ 有失敗的步驟');
  }

  // 寫入報告
  if (outputPath) {
    const report = generateReport(result);
    const dir = dirname(outputPath);
    await mkdir(dir, { recursive: true });
    await writeFile(outputPath, report, 'utf-8');
    if (!jsonOutput) console.log(`📄 報告已寫入：${outputPath}`);
  }

  process.exitCode = result.allPassed ? 0 : 1;
}

main().catch(err => {
  console.error('執行過程發生錯誤：', err.message);
  process.exitCode = 2;
});
