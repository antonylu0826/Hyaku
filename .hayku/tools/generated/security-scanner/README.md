# Security Scanner

Hayku 資安檢查閘門的執行工具。

## 功能

- **靜態分析** — 掃描程式碼中的安全禁止項目（eval、SQL injection、硬編碼密鑰等）
- **依賴審查** — 執行 npm audit 掃描已知 CVE 漏洞
- **報告產生** — 產生 Markdown 格式的審查報告

## 用法

```bash
# 基本掃描
node tool.mjs <target-dir>

# 含依賴審查
node tool.mjs <target-dir> --audit-deps

# 輸出報告到檔案
node tool.mjs <target-dir> --audit-deps --output ./report.md

# JSON 格式輸出（供程式使用）
node tool.mjs <target-dir> --json
```

## 排除規則

在目標目錄建立 `.securityignore` 檔案，每行一個 pattern：

```
test-fixtures
test.mjs
```

## 零依賴

此工具只使用 Node.js 內建模組，不需要安裝任何第三方套件。
