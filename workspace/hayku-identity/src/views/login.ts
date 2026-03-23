interface LoginPageOptions {
  clientName: string;
  params: Record<string, string>;
  error?: string;
  providers: Array<{ id: string; displayName: string }>;
}

/** 產生登入頁 HTML */
export function renderLoginPage(opts: LoginPageOptions): string {
  const hiddenFields = Object.entries(opts.params)
    .map(([k, v]) => `<input type="hidden" name="${escHtml(k)}" value="${escHtml(v)}">`)
    .join('\n');

  const errorHtml = opts.error
    ? `<div class="error">${escHtml(opts.error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登入 — ${escHtml(opts.clientName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      display: flex;
      min-height: 100vh;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
      padding: 40px;
      width: 100%;
      max-width: 400px;
    }
    .logo {
      text-align: center;
      margin-bottom: 8px;
      font-size: 28px;
      font-weight: 700;
      color: #1a1a2e;
      letter-spacing: -0.5px;
    }
    .subtitle {
      text-align: center;
      color: #666;
      font-size: 14px;
      margin-bottom: 32px;
    }
    .subtitle strong { color: #333; }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #444;
      margin-bottom: 6px;
    }
    input[type=email], input[type=password] {
      display: block;
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      font-size: 15px;
      outline: none;
      transition: border-color .2s;
      margin-bottom: 18px;
    }
    input[type=email]:focus, input[type=password]:focus {
      border-color: #4f46e5;
    }
    button[type=submit] {
      display: block;
      width: 100%;
      padding: 12px;
      background: #4f46e5;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background .2s;
    }
    button[type=submit]:hover { background: #4338ca; }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      margin-bottom: 18px;
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Hayku</div>
    <div class="subtitle">登入以存取 <strong>${escHtml(opts.clientName)}</strong></div>
    ${errorHtml}
    <form method="POST" action="/oauth/authorize">
      ${hiddenFields}
      <input type="hidden" name="provider" value="local">
      <label for="email">電子信箱</label>
      <input type="email" id="email" name="email" autocomplete="email" required autofocus>
      <label for="password">密碼</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
      <button type="submit">登入</button>
    </form>
    <div class="footer">Powered by Hayku Identity</div>
  </div>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
