#!/usr/bin/env node

/**
 * API Tester 工具測試
 *
 * 啟動一個簡單的 HTTP 伺服器來驗證工具的核心功能
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolPath = join(__dirname, 'tool.mjs');

let passed = 0;
let failed = 0;

function test(name, actual) {
  if (actual) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

/** 以子進程非同步執行工具，回傳 { stdout, exitCode } */
function run(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn('node', [toolPath, scriptPath, '--json'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', () => {});
    child.on('close', (exitCode) => {
      resolve({ stdout, exitCode });
    });
  });
}

// ─── 啟動測試用 HTTP 伺服器 ──────────────────────────

const testToken = 'test-jwt-token-12345';

const server = createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200);
      return res.end(JSON.stringify({ status: 'ok', service: 'test' }));
    }

    if (req.url === '/auth/register' && req.method === 'POST') {
      const data = JSON.parse(body);
      if (data.email === 'duplicate@test.com') {
        res.writeHead(409);
        return res.end(JSON.stringify({ error: '已存在' }));
      }
      res.writeHead(201);
      return res.end(JSON.stringify({
        user: { id: 'user-001', email: data.email },
        token: testToken,
      }));
    }

    if (req.url === '/auth/me' && req.method === 'GET') {
      const auth = req.headers['authorization'];
      if (!auth || !auth.startsWith('Bearer ')) {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: '未認證' }));
      }
      res.writeHead(200);
      return res.end(JSON.stringify({ email: 'test@test.com', name: 'Test User' }));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;

console.log('🧪 API Tester 工具測試\n');
console.log(`   測試伺服器：port ${port}\n`);

// ─── 測試組 1：完整流程 ──────────────────────────────

const script1 = {
  name: '完整流程',
  base_url: `http://localhost:${port}`,
  stop_on_error: true,
  steps: [
    {
      name: 'Health Check',
      method: 'GET',
      path: '/health',
      assert: { status: 200, 'body.status': 'ok' },
    },
    {
      name: '註冊',
      method: 'POST',
      path: '/auth/register',
      body: { email: 'test@test.com', password: 'pass12345', displayName: 'Test' },
      assert: { status: 201, 'body.token': '$exists' },
      capture: { token: '$.token', userId: '$.user.id' },
    },
    {
      name: '用 token 存取',
      method: 'GET',
      path: '/auth/me',
      headers: { Authorization: 'Bearer {{token}}' },
      assert: { status: 200, 'body.email': 'test@test.com' },
    },
    {
      name: '無 token 應 401',
      method: 'GET',
      path: '/auth/me',
      assert: { status: 401 },
    },
  ],
};

const path1 = join(__dirname, '_t1.json');
await writeFile(path1, JSON.stringify(script1));

console.log('【測試組 1】完整流程');

const r1 = await run(path1);
let result1;
try { result1 = JSON.parse(r1.stdout); } catch { result1 = null; }

test('JSON 解析成功', result1 !== null);
if (result1) {
  test('所有步驟通過', result1.allPassed === true);
  test('執行 4 步', result1.executedSteps === 4);
  test('變數捕獲生效（第 3 步通過）', result1.results[2]?.passed === true);
  test('exit code = 0', r1.exitCode === 0);
}

// ─── 測試組 2：斷言失敗 ──────────────────────────────

const script2 = {
  name: '斷言失敗',
  base_url: `http://localhost:${port}`,
  steps: [
    { name: '錯誤 status', method: 'GET', path: '/health', assert: { status: 500 } },
  ],
};

const path2 = join(__dirname, '_t2.json');
await writeFile(path2, JSON.stringify(script2));

console.log('\n【測試組 2】斷言失敗');

const r2 = await run(path2);
let result2;
try { result2 = JSON.parse(r2.stdout); } catch { result2 = null; }

test('JSON 解析成功', result2 !== null);
if (result2) {
  test('allPassed = false', result2.allPassed === false);
  test('failed = 1', result2.failed === 1);
  test('exit code = 1', r2.exitCode === 1);
}

// ─── 測試組 3：連線錯誤 ──────────────────────────────

const script3 = {
  name: '連線錯誤',
  base_url: 'http://localhost:1',
  steps: [
    { name: '無法連線', method: 'GET', path: '/health', assert: { status: 200 } },
  ],
};

const path3 = join(__dirname, '_t3.json');
await writeFile(path3, JSON.stringify(script3));

console.log('\n【測試組 3】連線錯誤');

const r3 = await run(path3);
let result3;
try { result3 = JSON.parse(r3.stdout); } catch { result3 = null; }

test('JSON 解析成功', result3 !== null);
if (result3) {
  test('有 error 訊息', result3.results[0]?.error !== null);
  test('allPassed = false', result3.allPassed === false);
}

// ─── 清理 ────────────────────────────────────────────

server.close();
await Promise.all([unlink(path1), unlink(path2), unlink(path3)].map(p => p.catch(() => {})));
await unlink(join(__dirname, '_debug.json')).catch(() => {});

console.log(`\n📊 測試結果：${passed} 通過, ${failed} 失敗`);
process.exit(failed > 0 ? 1 : 0);
