#!/bin/bash
# ============================================================
# Hayku — Staging PostgreSQL 初始化腳本
# ============================================================

set -e
echo "🔧 Hayku Staging: 初始化 staging databases..."

# hayku_identity_staging 由 POSTGRES_DB 環境變數預設建立
# 這裡補建 hayku_audit_staging
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE hayku_audit_staging OWNER $POSTGRES_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hayku_audit_staging')\gexec
EOSQL
echo "  ✅ hayku_audit_staging"

echo "✅ Hayku Staging: database 初始化完成"
