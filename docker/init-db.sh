#!/bin/bash
# ============================================================
# Hayku — PostgreSQL 初始化腳本（自動產生，勿手動修改）
# 產生時間：2026-03-23T06:38:48.349Z
# ============================================================

set -e
echo "🔧 Hayku: 初始化所有服務的 database..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE hayku_identity OWNER $POSTGRES_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hayku_identity')\gexec
EOSQL
echo "  ✅ hayku_identity"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE hayku_audit OWNER $POSTGRES_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hayku_audit')\gexec
EOSQL
echo "  ✅ hayku_audit"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE hayku_product_catalog OWNER $POSTGRES_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hayku_product_catalog')\gexec
EOSQL
echo "  ✅ hayku_product_catalog"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE hayku_supplier OWNER $POSTGRES_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hayku_supplier')\gexec
EOSQL
echo "  ✅ hayku_supplier"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE hayku_procurement OWNER $POSTGRES_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hayku_procurement')\gexec
EOSQL
echo "  ✅ hayku_procurement"

echo "✅ Hayku: 所有 database 初始化完成"
