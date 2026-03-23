#!/usr/bin/env node
/**
 * Hayku Staging Deployer — 靜態測試
 * 驗證工具邏輯（不實際執行 docker 操作）
 */

import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../../../../');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('\n🧪 Staging Deployer — 靜態驗證\n');

// ── 必要檔案存在 ───────────────────────────────────────────

test('tool.mjs 存在', () => {
  assert(existsSync(join(__dir, 'tool.mjs')), '找不到 tool.mjs');
});

test('security.json 存在', () => {
  assert(existsSync(join(__dir, 'security.json')), '找不到 security.json');
});

test('docker-compose.staging.yml 存在', () => {
  assert(existsSync(join(ROOT, 'docker/docker-compose.staging.yml')), '找不到 docker-compose.staging.yml');
});

test('init-db.staging.sh 存在', () => {
  assert(existsSync(join(ROOT, 'docker/init-db.staging.sh')), '找不到 init-db.staging.sh');
});

// ── security.json 內容驗證 ────────────────────────────────

const secJson = JSON.parse(
  (await import('node:fs')).readFileSync(join(__dir, 'security.json'), 'utf8'),
);

test('security.json level 為 3', () => {
  assert(secJson.level === 3, `level 應為 3，實際為 ${secJson.level}`);
});

test('security.json status 為 approved', () => {
  assert(secJson.status === 'approved', `status 應為 approved`);
});

// ── docker-compose.staging.yml 內容驗證 ──────────────────

const composeContent = (await import('node:fs')).readFileSync(
  join(ROOT, 'docker/docker-compose.staging.yml'), 'utf8',
);

test('staging compose 包含 staging-db 服務', () => {
  assert(composeContent.includes('staging-db:'), 'missing staging-db');
});

test('staging compose 包含 staging-identity 服務', () => {
  assert(composeContent.includes('staging-identity:'), 'missing staging-identity');
});

test('staging compose 包含 staging-audit 服務', () => {
  assert(composeContent.includes('staging-audit:'), 'missing staging-audit');
});

test('staging compose 使用獨立 port 4100（identity）', () => {
  assert(composeContent.includes('4100'), 'missing port 4100');
});

test('staging compose 使用獨立 port 4200（audit）', () => {
  assert(composeContent.includes('4200'), 'missing port 4200');
});

test('staging compose 使用獨立 port 5433（DB）', () => {
  assert(composeContent.includes('5433'), 'missing port 5433');
});

test('staging compose 使用獨立 volume pgdata_staging', () => {
  assert(composeContent.includes('pgdata_staging'), 'missing pgdata_staging volume');
});

test('staging compose 使用獨立 network hayku-staging', () => {
  assert(composeContent.includes('hayku-staging'), 'missing hayku-staging network');
});

// ── tool.mjs 靜態安全檢查 ─────────────────────────────────

const toolContent = (await import('node:fs')).readFileSync(join(__dir, 'tool.mjs'), 'utf8');

test('tool.mjs 無 eval()', () => {
  assert(!toolContent.match(/(?<!['"a-z])eval\s*\(/), '發現 eval()');
});

test('tool.mjs 無硬編碼密鑰', () => {
  assert(
    !toolContent.match(/(?:secret|password|token)\s*=\s*['"][^'"]{16,}['"]/i),
    '疑似硬編碼密鑰',
  );
});

test('tool.mjs 服務名稱使用白名單驗證', () => {
  assert(toolContent.includes('VALID_SERVICES'), 'missing whitelist validation');
});

test('tool.mjs reset 需要 --confirm 旗標', () => {
  assert(toolContent.includes('--confirm'), 'reset 缺少 --confirm 確認機制');
});

// ── 結果 ─────────────────────────────────────────────────

console.log(`\n📊 結果：${passed} 通過, ${failed} 失敗\n`);
if (failed > 0) process.exit(1);
