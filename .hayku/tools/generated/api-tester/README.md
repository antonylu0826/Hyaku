# API Tester

Hayku API 測試工具，依序執行 HTTP 請求測試腳本。

## 功能

- **依序執行** — 按步驟順序發送 HTTP 請求
- **變數捕獲** — 從回應中提取值（如 token、id），帶入後續步驟
- **斷言檢查** — 驗證 status code、回應 body 欄位
- **報告產生** — 產生 Markdown 格式的測試報告

## 用法

```bash
# 執行測試腳本
node tool.mjs tests/api-test.json --verbose

# JSON 格式輸出（供程式使用）
node tool.mjs tests/api-test.json --json

# 輸出報告到檔案
node tool.mjs tests/api-test.json --output report.md
```

## 測試腳本格式

```json
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
      "capture": { "token": "$.token" },
      "delay": 100
    }
  ]
}
```

### 斷言語法

- `"status": 201` — HTTP status code
- `"body.field": "value"` — 回應 body 欄位值
- `"body.field": "$exists"` — 欄位存在
- `"body.field": "$type:string"` — 欄位型別

### 變數語法

- `capture` 中用 `$.path` 從回應 body 提取
- 後續步驟用 `{{varName}}` 引用

## 零依賴

此工具只使用 Node.js 內建模組（fetch API）。
