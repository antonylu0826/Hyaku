#!/usr/bin/env node
/**
 * Hayku Staging Deployer — 測試區一鍵部署工具
 *
 * 指令：
 *   node tool.mjs deploy [service]      部署 staging（全部或指定服務）
 *   node tool.mjs status                查看所有 staging 容器狀態
 *   node tool.mjs stop [service]        停止 staging 服務
 *   node tool.mjs logs <service> [-n N] 查看服務日誌（預設最後 50 行）
 *   node tool.mjs migrate               對 staging DB 執行 drizzle 遷移
 *   node tool.mjs reset --confirm       ⚠ 清除所有 staging 資料並重新部署
 *
 * 安全等級：Level 3（系統操作、可刪除資料）
 * 必須由使用者明確執行，不可由 Agent 自動觸發。
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 路徑 ──────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../../../../');               // monorepo 根目錄
const COMPOSE_FILE = join(ROOT, 'docker/docker-compose.staging.yml');
const ENV_STAGING = join(ROOT, '.env.staging');
const ENV_TEMPLATE = join(ROOT, '.env');

// ── 合法的服務名稱白名單 ──────────────────────────────────────

const VALID_SERVICES = new Set(['staging-db', 'staging-identity', 'staging-audit']);
const DB_CONTAINER = 'hayku-staging-db';

// ── 工具函式 ──────────────────────────────────────────────────

function c(color, text) {
  const codes = { reset: 0, bold: 1, red: 31, green: 32, yellow: 33, blue: 34, cyan: 36, gray: 90 };
  return `\x1b[${codes[color]}m${text}\x1b[0m`;
}

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: opts.silent ? 'pipe' : 'inherit', encoding: 'utf8', ...opts });
}

function runSafe(cmd) {
  const result = spawnSync('sh', ['-c', cmd], { cwd: ROOT, encoding: 'utf8' });
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function compose(args) {
  return `docker-compose -f docker/docker-compose.staging.yml ${args}`;
}

// ── .env.staging 產生 ────────────────────────────────────────

function ensureEnvStaging() {
  if (existsSync(ENV_STAGING)) return;

  if (!existsSync(ENV_TEMPLATE)) {
    console.error(c('red', '✗ 找不到根目錄 .env，請先從 .env.example 建立'));
    process.exit(1);
  }

  const template = readFileSync(ENV_TEMPLATE, 'utf8');

  // 套用 staging 覆蓋值
  const staging = template
    .replace(/^NODE_ENV=.*/m, 'NODE_ENV=staging')
    .replace(/^OIDC_ISSUER=.*/m, 'OIDC_ISSUER=http://localhost:4100')
    .replace(/^JWT_SECRET=.*/m, `JWT_SECRET=hayku-staging-${Date.now().toString(36)}`)
    + '\n# Staging 專屬設定\n'
    + 'STAGING_DB_PORT=5433\n'
    + 'STAGING_IDENTITY_PORT=4100\n'
    + 'STAGING_AUDIT_PORT=4200\n';

  writeFileSync(ENV_STAGING, staging, 'utf8');
  console.log(c('green', '✓ 已產生 .env.staging（請依需求調整後重新部署）'));
}

// ── 健康等待 ─────────────────────────────────────────────────

async function waitHealthy(container, maxWait = 60) {
  process.stdout.write(`  等待 ${container} 就緒`);
  for (let i = 0; i < maxWait; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { stdout } = runSafe(`docker inspect --format='{{.State.Health.Status}}' ${container} 2>/dev/null`);
    const status = stdout.trim().replace(/'/g, '');
    if (status === 'healthy') { process.stdout.write(` ${c('green', '✓')}\n`); return true; }
    if (status === 'unhealthy') { process.stdout.write(` ${c('red', '✗')}\n`); return false; }
    process.stdout.write('.');
  }
  process.stdout.write(` ${c('yellow', '逾時')}\n`);
  return false;
}

// ── 遷移追蹤（本地 JSON 檔案，避免 SQL 操作）────────────────

const MIGRATION_TRACK_DIR = join(ROOT, '.staging/migrations');
const migrationTrackFile = (svcName) => join(MIGRATION_TRACK_DIR, `${svcName}.json`);

function loadApplied(svcName) {
  const file = migrationTrackFile(svcName);
  if (!existsSync(file)) return new Set();
  try { return new Set(JSON.parse(readFileSync(file, 'utf8'))); } catch { return new Set(); }
}

function markApplied(svcName, tag) {
  mkdirSync(MIGRATION_TRACK_DIR, { recursive: true });
  const file = migrationTrackFile(svcName);
  const applied = loadApplied(svcName);
  applied.add(tag);
  writeFileSync(file, JSON.stringify([...applied], null, 2), 'utf8');
}

// ── 遷移執行 ─────────────────────────────────────────────────

async function runMigrations() {
  console.log(c('cyan', '\n📦 執行 Drizzle 遷移...'));
  const services = [
    {
      name: 'hayku-identity',
      db: 'hayku_identity_staging',
      migrationsDir: join(ROOT, 'workspace/hayku-identity/drizzle'),
    },
    {
      name: 'hayku-audit',
      db: 'hayku_audit_staging',
      migrationsDir: join(ROOT, 'workspace/hayku-audit/drizzle'),
    },
  ];

  for (const svc of services) {
    if (!existsSync(svc.migrationsDir)) {
      console.log(c('gray', `  ${svc.name}: 無遷移目錄，跳過`));
      continue;
    }

    // 讀取 journal 取得有序遷移清單
    const journalPath = join(svc.migrationsDir, 'meta/_journal.json');
    if (!existsSync(journalPath)) { console.log(c('gray', `  ${svc.name}: 無 journal，跳過`)); continue; }

    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const entries = journal.entries ?? [];

    const applied = loadApplied(svc.name);

    for (const entry of entries) {
      // 驗證 tag 格式（drizzle 產生的 tag 只含數字、字母、底線）
      if (!/^[a-z0-9_]+$/i.test(entry.tag)) {
        console.warn(c('yellow', `    [skip] 非法 tag 格式：${entry.tag}`));
        continue;
      }

      // 已套用（本地追蹤）
      if (applied.has(entry.tag)) {
        process.stdout.write(c('gray', `    [skip] ${entry.tag}\n`));
        continue;
      }

      const sqlFile = join(svc.migrationsDir, `${entry.tag}.sql`);
      if (!existsSync(sqlFile)) continue;

      const sql = readFileSync(sqlFile, 'utf8')
        .split('--> statement-breakpoint').join('');

      const escapedSql = sql.replace(/'/g, "'\\''");
      const { ok, stderr } = runSafe(
        `docker exec ${DB_CONTAINER} psql -U hayku -d ${svc.db} -c '${escapedSql}' 2>&1`,
      );

      if (!ok) {
        if (stderr.includes('already exists')) {
          process.stdout.write(c('yellow', `    [warn] ${entry.tag} — 部分物件已存在，視為已套用\n`));
        } else {
          console.error(c('red', `    [fail] ${entry.tag}: ${stderr.trim()}`));
          continue;
        }
      } else {
        process.stdout.write(c('green', `    [done] ${entry.tag}\n`));
      }

      // 記錄已套用（本地 JSON 追蹤）
      markApplied(svc.name, entry.tag);
    }
    console.log(c('green', `  ✓ ${svc.name} 遷移完成`));
  }
}

// ── 指令：deploy ─────────────────────────────────────────────

async function cmdDeploy(service) {
  ensureEnvStaging();

  if (service && !VALID_SERVICES.has(service)) {
    console.error(c('red', `✗ 未知服務：${service}（可用：${[...VALID_SERVICES].join(', ')}）`));
    process.exit(1);
  }

  console.log(c('bold', `\n🚀 部署 Hayku Staging${service ? ` — ${service}` : ' (全部)'}`));
  console.log(c('gray', `   compose: ${COMPOSE_FILE}`));
  console.log(c('gray', `   root:    ${ROOT}\n`));

  const target = service ?? '';
  run(compose(`up -d --build ${target}`));

  // 等待 DB 就緒後執行遷移
  if (!service || service === 'staging-db') {
    const healthy = await waitHealthy(DB_CONTAINER);
    if (healthy) await runMigrations();
  }

  console.log(c('bold', '\n✅ Staging 部署完成\n'));
  cmdStatus();
}

// ── 指令：status ─────────────────────────────────────────────

function cmdStatus() {
  console.log(c('bold', '\n📊 Staging 服務狀態\n'));

  const containers = ['hayku-staging-db', 'hayku-staging-identity', 'hayku-staging-audit'];
  const portMap = { 'hayku-staging-db': 5433, 'hayku-staging-identity': 4100, 'hayku-staging-audit': 4200 };

  for (const ctr of containers) {
    const { stdout, ok } = runSafe(`docker inspect --format='{{.State.Status}}|{{.State.Health.Status}}' ${ctr} 2>/dev/null`);
    if (!ok || !stdout.trim()) {
      console.log(`  ${c('gray', ctr.padEnd(28))} ${c('gray', '— 未運行')}`);
      continue;
    }
    const [state, health] = stdout.trim().replace(/'/g, '').split('|');
    const stateColor = state === 'running' ? 'green' : 'red';
    const healthStr = health && health !== '<no value>' ? ` [${health}]` : '';
    const port = portMap[ctr];
    console.log(`  ${c('cyan', ctr.padEnd(28))} ${c(stateColor, state)}${c('gray', healthStr)}  ${c('gray', `→ :${port}`)}`);
  }

  console.log(`\n  ${c('gray', 'identity:')} http://localhost:4100`);
  console.log(`  ${c('gray', 'audit:   ')} http://localhost:4200`);
  console.log(`  ${c('gray', 'DB port: ')} 5433\n`);
}

// ── 指令：stop ───────────────────────────────────────────────

function cmdStop(service) {
  if (service && !VALID_SERVICES.has(service)) {
    console.error(c('red', `✗ 未知服務：${service}`));
    process.exit(1);
  }

  console.log(c('bold', `\n🛑 停止 Staging${service ? ` — ${service}` : ' (全部)'}`));
  run(compose(`stop ${service ?? ''}`));
  console.log(c('green', '✓ 已停止\n'));
}

// ── 指令：logs ───────────────────────────────────────────────

function cmdLogs(service, lines = 50) {
  if (!service) { console.error(c('red', '✗ 請指定服務名稱')); process.exit(1); }
  if (!VALID_SERVICES.has(service)) {
    console.error(c('red', `✗ 未知服務：${service}`));
    process.exit(1);
  }
  run(compose(`logs --tail=${lines} ${service}`));
}

// ── 指令：migrate ────────────────────────────────────────────

async function cmdMigrate() {
  const { ok } = runSafe(`docker inspect ${DB_CONTAINER} 2>/dev/null`);
  if (!ok) {
    console.error(c('red', `✗ staging-db 未運行，請先執行 deploy`));
    process.exit(1);
  }
  await runMigrations();
}

// ── 指令：reset ──────────────────────────────────────────────

async function cmdReset(args) {
  if (!args.includes('--confirm')) {
    console.log(c('yellow', '⚠  reset 會清除所有 staging 資料（volumes 完全刪除）'));
    console.log(c('yellow', '   確認請加上 --confirm 旗標：'));
    console.log(c('gray', '   node tool.mjs reset --confirm\n'));
    process.exit(0);
  }

  console.log(c('bold', c('red', '\n⚠  清除 Staging 所有資料...\n')));

  // 停止並刪除所有容器 + volume
  run(compose('down -v --remove-orphans'));
  console.log(c('green', '✓ 容器與 volume 已清除'));

  // 重新部署
  await cmdDeploy();
}

// ── 入口 ─────────────────────────────────────────────────────

const [,, cmd, ...rest] = process.argv;

switch (cmd) {
  case 'deploy':   await cmdDeploy(rest[0]); break;
  case 'status':   cmdStatus(); break;
  case 'stop':     cmdStop(rest[0]); break;
  case 'logs':     cmdLogs(rest[0], Number(rest[rest.indexOf('-n') + 1]) || 50); break;
  case 'migrate':  await cmdMigrate(); break;
  case 'reset':    await cmdReset(rest); break;
  default:
    console.log(`
${c('bold', 'Hayku Staging Deployer')}

用法：
  node tool.mjs ${c('cyan', 'deploy')} [service]       部署 staging（全部或指定服務）
  node tool.mjs ${c('cyan', 'status')}                 查看容器狀態
  node tool.mjs ${c('cyan', 'stop')} [service]         停止服務
  node tool.mjs ${c('cyan', 'logs')} <service> [-n N]  查看日誌（預設 50 行）
  node tool.mjs ${c('cyan', 'migrate')}                執行 Drizzle 遷移
  node tool.mjs ${c('cyan', 'reset')} --confirm        ${c('yellow', '⚠ 清除所有資料並重新部署')}

可用服務：${[...VALID_SERVICES].join(', ')}

Staging Ports：
  staging-db:       5433
  staging-identity: 4100  →  http://localhost:4100
  staging-audit:    4200  →  http://localhost:4200
`);
}
