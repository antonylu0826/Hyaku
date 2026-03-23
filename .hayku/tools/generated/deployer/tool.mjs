#!/usr/bin/env node
/**
 * Hayku Deployer — 讀取 registry 自動產生部署配置並執行
 *
 * 用法：
 *   node .hayku/tools/generated/deployer/tool.mjs generate   # 產生 docker-compose.yml + init-db.sh
 *   node .hayku/tools/generated/deployer/tool.mjs build       # 建構所有服務的 Docker image
 *   node .hayku/tools/generated/deployer/tool.mjs up          # 啟動所有服務
 *   node .hayku/tools/generated/deployer/tool.mjs down        # 停止所有服務
 *   node .hayku/tools/generated/deployer/tool.mjs status      # 查看所有服務狀態
 *   node .hayku/tools/generated/deployer/tool.mjs deploy      # generate + build + up 一鍵完成
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..', '..');
const REGISTRY_PATH = resolve(ROOT, 'workspace', 'registry.json');
const COMPOSE_PATH = resolve(ROOT, 'docker-compose.yml');
const DOCKERFILE_PATH = resolve(ROOT, 'docker', 'Dockerfile');
const INITDB_PATH = resolve(ROOT, 'docker', 'init-db.sh');

// ── Registry 讀取 ──────────────────────────────────────

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    console.error('❌ workspace/registry.json 不存在');
    process.exit(1);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

// ── docker-compose.yml 產生 ─────────────────────────────

function generateCompose(registry) {
  const services = registry.services;
  const infraServices = services.filter(s => s.type === 'infrastructure');
  const businessServices = services.filter(s => s.type === 'business');

  // 收集所有 database 名稱
  const allDbNames = services.map(s => {
    const cleanName = s.name.replace(/^hayku-/, '');
    return `hayku_${cleanName.replace(/-/g, '_')}`;
  });

  // 產生 init-db.sh
  const initDbScript = `#!/bin/bash
# ============================================================
# Hayku — PostgreSQL 初始化腳本（自動產生，勿手動修改）
# 產生時間：${new Date().toISOString()}
# ============================================================

set -e
echo "🔧 Hayku: 初始化所有服務的 database..."

${allDbNames.map(db => `psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE ${db} OWNER $POSTGRES_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db}')\\gexec
EOSQL
echo "  ✅ ${db}"`).join('\n\n')}

echo "✅ Hayku: 所有 database 初始化完成"
`;

  writeFileSync(INITDB_PATH, initDbScript, { mode: 0o755 });
  console.log(`  📄 ${INITDB_PATH}`);

  // 產生 docker-compose.yml
  let compose = `# ============================================================
# Hayku — 全服務部署配置（自動產生，勿手動修改）
# 產生時間：${new Date().toISOString()}
# 重新產生：node .hayku/tools/generated/deployer/tool.mjs generate
# ============================================================

x-service-defaults: &service-defaults
  build:
    context: .
    dockerfile: docker/Dockerfile
  restart: unless-stopped
  env_file:
    - .env
  depends_on:
    db:
      condition: service_healthy

services:
  # ── Database ──────────────────────────────────────────
  db:
    image: postgres:17-alpine
    container_name: hayku-db
    environment:
      POSTGRES_USER: \${DB_USER:-hayku}
      POSTGRES_PASSWORD: \${DB_PASSWORD:-hayku123}
      POSTGRES_DB: hayku_identity
    ports:
      - "\${DB_PORT:-5432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-db.sh:/docker-entrypoint-initdb.d/init-db.sh
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USER:-hayku}"]
      interval: 5s
      timeout: 5s
      retries: 10
`;

  // Infrastructure services
  if (infraServices.length > 0) {
    compose += `\n  # ── Infrastructure Services ───────────────────────────\n`;
  }
  for (const svc of infraServices) {
    compose += generateServiceBlock(svc, services);
  }

  // Business services
  if (businessServices.length > 0) {
    compose += `\n  # ── Business Services ─────────────────────────────────\n`;
  }
  for (const svc of businessServices) {
    compose += generateServiceBlock(svc, services);
  }

  compose += `\nvolumes:\n  pgdata:\n`;

  writeFileSync(COMPOSE_PATH, compose);
  console.log(`  📄 ${COMPOSE_PATH}`);
}

function generateServiceBlock(svc, allServices) {
  // 避免重複 hayku- 前綴
  const containerName = svc.name.startsWith('hayku-') ? svc.name : `hayku-${svc.name}`;
  const cleanName = svc.name.replace(/^hayku-/, '');
  const dbName = `hayku_${cleanName.replace(/-/g, '_')}`;
  const svcKey = svc.name;

  // 計算 depends_on
  const deps = ['db'];
  for (const dep of svc.dependencies || []) {
    const depSvc = allServices.find(s => s.name === dep);
    if (depSvc) deps.push(dep);
  }

  // 計算環境變數
  const envVars = {
    PORT: svc.port,
    DATABASE_URL: `postgres://\${DB_USER:-hayku}:\${DB_PASSWORD:-hayku123}@db:5432/${dbName}`,
  };

  // 根據 capabilities 和 dependencies 推斷需要的環境變數
  if (svc.capabilities.some(c => c.startsWith('auth.') || c.startsWith('user.'))) {
    envVars.JWT_SECRET = '${JWT_SECRET:-hayku-dev-secret-change-in-production}';
    envVars.JWT_EXPIRES_IN = '${JWT_EXPIRES_IN:-15m}';
    envVars.BCRYPT_ROUNDS = '${BCRYPT_ROUNDS:-12}';
  } else if (svc.dependencies.includes('hayku-identity')) {
    envVars.JWT_SECRET = '${JWT_SECRET:-hayku-dev-secret-change-in-production}';
  }

  if (svc.dependencies.includes('hayku-audit')) {
    envVars.AUDIT_SERVICE_URL = 'http://hayku-audit:3200';
  }

  // 服務間依賴的 URL
  for (const dep of svc.dependencies) {
    if (dep === 'hayku-identity') {
      envVars.IDENTITY_SERVICE_URL = 'http://hayku-identity:3100';
    } else if (dep === 'hayku-audit') {
      // already handled above
    } else {
      const depSvc = allServices.find(s => s.name === dep);
      if (depSvc) {
        const envKey = `${dep.replace(/-/g, '_').toUpperCase()}_URL`;
        envVars[envKey] = `http://${dep}:${depSvc.port}`;
      }
    }
  }

  // 產生 YAML
  let block = `
  ${svcKey}:
    <<: *service-defaults
    container_name: ${containerName}
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SERVICE: ${svc.name}
    ports:
      - "${svc.port}:${svc.port}"
    environment:\n`;

  for (const [key, value] of Object.entries(envVars)) {
    block += `      ${key}: ${value}\n`;
  }

  // depends_on
  block += `    depends_on:\n`;
  block += `      db:\n        condition: service_healthy\n`;
  for (const dep of svc.dependencies) {
    const depSvc = allServices.find(s => s.name === dep);
    if (depSvc) {
      block += `      ${dep}:\n        condition: service_started\n`;
    }
  }

  return block;
}

// ── Dockerfile 確認 ─────────────────────────────────────

function ensureDockerfile() {
  if (!existsSync(DOCKERFILE_PATH)) {
    console.error('❌ docker/Dockerfile 不存在，請先建立');
    process.exit(1);
  }
}

// ── 指令執行 ────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
  } catch (e) {
    if (!opts.ignoreError) {
      console.error(`❌ 指令失敗: ${cmd}`);
      process.exit(1);
    }
  }
}

// ── 主程式 ──────────────────────────────────────────────

const command = process.argv[2];

if (!command || command === '--help') {
  console.log(`
Hayku Deployer — 自動化部署工具

用法：
  generate   讀取 registry，產生 docker-compose.yml + init-db.sh
  build      建構所有服務的 Docker image
  up         啟動所有服務
  down       停止並移除所有容器
  status     查看服務狀態
  deploy     一鍵完成（generate → build → up）
  logs [svc] 查看服務日誌
`);
  process.exit(0);
}

switch (command) {
  case 'generate': {
    console.log('📋 讀取 registry 並產生部署配置...');
    ensureDockerfile();
    const registry = loadRegistry();
    generateCompose(registry);
    console.log(`\n✅ 部署配置已產生（${registry.services.length} 個服務）`);
    break;
  }

  case 'build': {
    console.log('🔨 建構所有服務的 Docker image...');
    run('docker-compose build');
    console.log('\n✅ 所有 image 建構完成');
    break;
  }

  case 'up': {
    console.log('🚀 啟動所有服務...');
    run('docker-compose up -d');
    console.log('\n✅ 所有服務已啟動');
    console.log('\n服務列表：');
    run('docker-compose ps', { ignoreError: true });
    break;
  }

  case 'down': {
    console.log('🛑 停止所有服務...');
    run('docker-compose down');
    console.log('\n✅ 所有服務已停止');
    break;
  }

  case 'status': {
    console.log('📊 服務狀態：\n');
    run('docker-compose ps', { ignoreError: true });

    // 健康檢查（使用 Node.js 原生 fetch）
    const registry = loadRegistry();
    console.log('\n🏥 Health Check：');
    const checks = registry.services.map(async (svc) => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(`http://localhost:${svc.port}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        console.log(`  ${res.ok ? '✅' : '❌'} ${svc.name} (port ${svc.port}): HTTP ${res.status}`);
      } catch {
        console.log(`  ⬛ ${svc.name} (port ${svc.port}): 無回應`);
      }
    });
    await Promise.all(checks);
    break;
  }

  case 'deploy': {
    console.log('🚀 Hayku 一鍵部署\n');

    console.log('Step 1/3: 產生部署配置...');
    ensureDockerfile();
    const registry = loadRegistry();
    generateCompose(registry);
    console.log('');

    console.log('Step 2/3: 建構 Docker images...');
    run('docker-compose build');
    console.log('');

    console.log('Step 3/3: 啟動服務...');
    run('docker-compose up -d');
    console.log('');

    console.log(`✅ 部署完成！${registry.services.length} 個服務已啟動\n`);
    run('docker-compose ps', { ignoreError: true });
    break;
  }

  case 'logs': {
    const svcName = process.argv[3] || '';
    run(`docker-compose logs ${svcName} --tail=50`, { ignoreError: true });
    break;
  }

  default:
    console.error(`❌ 未知指令: ${command}`);
    process.exit(1);
}
