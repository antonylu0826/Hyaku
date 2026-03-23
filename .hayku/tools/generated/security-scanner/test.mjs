#!/usr/bin/env node

/**
 * Security Scanner 測試
 * 驗證掃描器能正確偵測漏洞，也不會誤報乾淨的程式碼
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolPath = join(__dirname, 'tool.mjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('🧪 Security Scanner 測試\n');

// ─── 測試 1：掃描有漏洞的檔案 ──────────────────────

console.log('【測試組 1】掃描有漏洞的程式碼');

test('應偵測到漏洞並回傳非 0 exit code', () => {
  try {
    execSync(`node "${toolPath}" "${join(__dirname, 'test-fixtures')}" --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    throw new Error('應該回傳非 0 exit code 但沒有');
  } catch (err) {
    assert(err.status === 1, `預期 exit code 1，得到 ${err.status}`);
  }
});

test('應偵測到 eval()', () => {
  let output;
  try {
    output = execSync(`node "${toolPath}" "${join(__dirname, 'test-fixtures')}" --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    output = err.stdout;
  }
  const result = JSON.parse(output);
  const evalFindings = result.static.findings.filter(f => f.ruleId === 'NO_EVAL');
  assert(evalFindings.length > 0, '未偵測到 eval()');
});

test('應偵測到 new Function()', () => {
  let output;
  try {
    output = execSync(`node "${toolPath}" "${join(__dirname, 'test-fixtures')}" --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    output = err.stdout;
  }
  const result = JSON.parse(output);
  const findings = result.static.findings.filter(f => f.ruleId === 'NO_NEW_FUNCTION');
  assert(findings.length > 0, '未偵測到 new Function()');
});

test('應偵測到 SQL 拼接', () => {
  let output;
  try {
    output = execSync(`node "${toolPath}" "${join(__dirname, 'test-fixtures')}" --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    output = err.stdout;
  }
  const result = JSON.parse(output);
  const findings = result.static.findings.filter(f => f.ruleId === 'NO_SQL_CONCAT');
  assert(findings.length > 0, '未偵測到 SQL 拼接');
});

test('應偵測到硬編碼密碼', () => {
  let output;
  try {
    output = execSync(`node "${toolPath}" "${join(__dirname, 'test-fixtures')}" --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    output = err.stdout;
  }
  const result = JSON.parse(output);
  const findings = result.static.findings.filter(f => f.ruleId === 'NO_HARDCODED_SECRETS');
  assert(findings.length > 0, '未偵測到硬編碼密碼');
});

test('應偵測到 HTTP 非 TLS 連線', () => {
  let output;
  try {
    output = execSync(`node "${toolPath}" "${join(__dirname, 'test-fixtures')}" --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    output = err.stdout;
  }
  const result = JSON.parse(output);
  const findings = result.static.findings.filter(f => f.ruleId === 'WARN_HTTP_NO_TLS');
  assert(findings.length > 0, '未偵測到 HTTP 非 TLS 連線');
});

// ─── 測試 2：掃描乾淨的檔案 ──────────────────────────

console.log('\n【測試組 2】掃描乾淨的程式碼');

test('乾淨檔案不應有 critical/high 發現', () => {
  let output;
  try {
    output = execSync(`node "${toolPath}" "${join(__dirname, 'test-fixtures')}" --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    output = err.stdout;
  }
  const result = JSON.parse(output);
  // clean.js 本身不應被偵測，但 vulnerable.js 在同目錄會有
  const cleanFileFindings = result.static.findings.filter(
    f => f.file.includes('clean.js') && (f.severity === 'critical' || f.severity === 'high')
  );
  assert(cleanFileFindings.length === 0, `乾淨檔案有 ${cleanFileFindings.length} 個誤報`);
});

// ─── 結果 ────────────────────────────────────────────

console.log(`\n📊 測試結果：${passed} 通過, ${failed} 失敗`);
process.exit(failed > 0 ? 1 : 0);
