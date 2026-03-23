import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * 階層式 .env 載入器
 *
 * 載入順序（後者覆蓋前者）：
 * 1. Hayku 根目錄 .env（全域共用）
 * 2. 服務目錄 .env（服務專屬）
 * 3. 服務目錄 .env.local（本機覆蓋，不進 git）
 *
 * @param serviceDir - 服務的根目錄路徑（通常傳 import.meta.dirname 或 __dirname）
 */
export function loadEnv(serviceDir: string): void {
  // 找到 Hayku 根目錄（往上找直到有 .hayku/ 目錄或 CLAUDE.md）
  const rootDir = findRootDir(serviceDir);

  const files = [
    rootDir ? resolve(rootDir, '.env') : null,
    resolve(serviceDir, '.env'),
    resolve(serviceDir, '.env.local'),
  ];

  for (const file of files) {
    if (file && existsSync(file)) {
      dotenvConfig({ path: file, override: true });
    }
  }
}

/**
 * 生產環境必須設定的變數，未設定則拋出錯誤。
 * 開發環境允許 fallback。
 */
export function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value) return value;

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    throw new Error(`環境變數 ${name} 在生產環境中必須設定`);
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`環境變數 ${name} 未設定且無預設值`);
}

/**
 * 從指定目錄往上搜尋 Hayku 根目錄
 */
function findRootDir(startDir: string): string | null {
  let dir = resolve(startDir);
  const root = resolve('/');

  while (dir !== root) {
    if (existsSync(resolve(dir, '.hayku')) || existsSync(resolve(dir, 'CLAUDE.md'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
