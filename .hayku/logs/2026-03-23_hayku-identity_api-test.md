---
test_time: 2026-03-23T02:06:26.217Z
name: Hayku Identity — 完整流程測試
result: PASSED
---

# API 測試報告 — Hayku Identity — 完整流程測試

- 測試時間：2026-03-23T02:06:26.217Z
- 總步驟數：16
- 已執行：16
- 通過：16
- 失敗：0
- 總耗時：1537ms
- 結果：**✅ 全部通過**

## 測試步驟

### ✅ Health Check

- `GET /health` → Status 200 (60ms)
- 斷言：
  - ✅ HTTP Status = `200`
  - ✅ Body: status = `"ok"`
  - ✅ Body: service = `"hayku-identity"`

### ✅ 註冊使用者 A

- `POST /auth/register` → Status 201 (353ms)
- 斷言：
  - ✅ HTTP Status = `201`
  - ✅ Body: user.email = `"alice@hayku.dev"`
  - ✅ Body: token = `"存在"`

### ✅ 重複註冊應失敗

- `POST /auth/register` → Status 409 (7ms)
- 斷言：
  - ✅ HTTP Status = `409`

### ✅ 登入使用者 A

- `POST /auth/login` → Status 200 (253ms)
- 斷言：
  - ✅ HTTP Status = `200`
  - ✅ Body: token = `"存在"`

### ✅ 錯誤密碼應失敗

- `POST /auth/login` → Status 401 (252ms)
- 斷言：
  - ✅ HTTP Status = `401`

### ✅ 取得個人資訊

- `GET /auth/me` → Status 200 (4ms)
- 斷言：
  - ✅ HTTP Status = `200`
  - ✅ Body: email = `"alice@hayku.dev"`
  - ✅ Body: displayName = `"Alice"`

### ✅ 無 Token 存取應失敗

- `GET /auth/me` → Status 401 (1ms)
- 斷言：
  - ✅ HTTP Status = `401`

### ✅ 建立組織

- `POST /orgs` → Status 201 (162ms)
- 斷言：
  - ✅ HTTP Status = `201`
  - ✅ Body: org.slug = `"hayku-corp"`

### ✅ 列出我的組織

- `GET /orgs` → Status 200 (5ms)
- 斷言：
  - ✅ HTTP Status = `200`

### ✅ 建立部門

- `POST /orgs/aac36b7a-0047-475e-a0a9-47636ce00112/departments` → Status 201 (42ms)
- 斷言：
  - ✅ HTTP Status = `201`
  - ✅ Body: name = `"工程部"`

### ✅ 列出部門

- `GET /orgs/aac36b7a-0047-475e-a0a9-47636ce00112/departments` → Status 200 (4ms)
- 斷言：
  - ✅ HTTP Status = `200`

### ✅ 註冊使用者 B

- `POST /auth/register` → Status 201 (304ms)
- 斷言：
  - ✅ HTTP Status = `201`

### ✅ 新增成員 B 到組織

- `POST /orgs/aac36b7a-0047-475e-a0a9-47636ce00112/members` → Status 201 (33ms)
- 斷言：
  - ✅ HTTP Status = `201`

### ✅ 列出組織成員

- `GET /orgs/aac36b7a-0047-475e-a0a9-47636ce00112/members` → Status 200 (4ms)
- 斷言：
  - ✅ HTTP Status = `200`

### ✅ 建立角色

- `POST /orgs/aac36b7a-0047-475e-a0a9-47636ce00112/roles` → Status 201 (38ms)
- 斷言：
  - ✅ HTTP Status = `201`
  - ✅ Body: name = `"viewer"`

### ✅ 列出角色

- `GET /orgs/aac36b7a-0047-475e-a0a9-47636ce00112/roles` → Status 200 (3ms)
- 斷言：
  - ✅ HTTP Status = `200`

