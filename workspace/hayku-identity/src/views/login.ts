interface LoginPageOptions {
  clientName: string;
  params: Record<string, string>;
  error?: string;
  providers: Array<{ id: string; displayName: string }>;
  externalProviders: Array<{ id: string; displayName: string }>;
}

interface MfaPageOptions {
  clientName: string;
  pendingToken: string;
  error?: string;
}

const STYLES = `
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
    .logo { text-align: center; margin-bottom: 8px; font-size: 28px; font-weight: 700; color: #1a1a2e; letter-spacing: -0.5px; }
    .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 32px; }
    .subtitle strong { color: #333; }
    label { display: block; font-size: 13px; font-weight: 600; color: #444; margin-bottom: 6px; }
    input[type=email], input[type=password], input[type=text] {
      display: block; width: 100%; padding: 10px 14px;
      border: 1.5px solid #ddd; border-radius: 8px; font-size: 15px;
      outline: none; transition: border-color .2s; margin-bottom: 18px;
    }
    input:focus { border-color: #4f46e5; }
    .btn {
      display: block; width: 100%; padding: 12px;
      border: none; border-radius: 8px; font-size: 15px; font-weight: 600;
      cursor: pointer; transition: background .2s; text-decoration: none;
      text-align: center;
    }
    .btn-primary { background: #4f46e5; color: #fff; }
    .btn-primary:hover { background: #4338ca; }
    .btn-external { background: #fff; color: #333; border: 1.5px solid #ddd; margin-top: 10px; }
    .btn-external:hover { background: #f9f9f9; }
    .divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: #aaa; font-size: 13px; }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #eee; }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 18px; }
    .hint { font-size: 12px; color: #888; margin-top: -12px; margin-bottom: 18px; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #999; }
`;

/** 產生登入頁 HTML */
export function renderLoginPage(opts: LoginPageOptions): string {
  const hiddenFields = Object.entries(opts.params)
    .map(([k, v]) => `<input type="hidden" name="${escHtml(k)}" value="${escHtml(v)}">`)
    .join('\n');

  const errorHtml = opts.error ? `<div class="error">${escHtml(opts.error)}</div>` : '';

  const externalButtons = opts.externalProviders.map((p) => {
    const startUrl = `/oauth/external-start/${escHtml(p.id)}?${new URLSearchParams(opts.params).toString()}`;
    return `<a href="${startUrl}" class="btn btn-external">${escHtml(p.displayName)} 登入</a>`;
  }).join('\n');

  const divider = externalButtons ? `<div class="divider">或</div>` : '';

  const ldapProviders = opts.providers.filter((p) => p.id !== 'local');
  const providerPickerHtml = ldapProviders.length > 0
    ? `<label for="provider">登入方式</label>
       <select id="provider" name="provider" style="display:block;width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:18px;">
         <option value="local">帳號密碼</option>
         ${ldapProviders.map((p) => `<option value="${escHtml(p.id)}">${escHtml(p.displayName)}</option>`).join('')}
       </select>`
    : `<input type="hidden" name="provider" value="local">`;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登入 — ${escHtml(opts.clientName)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="logo">Hayku</div>
    <div class="subtitle">登入以存取 <strong>${escHtml(opts.clientName)}</strong></div>
    ${errorHtml}
    ${externalButtons}
    ${divider}
    <form method="POST" action="/oauth/authorize">
      ${hiddenFields}
      ${providerPickerHtml}
      <label for="email">電子信箱</label>
      <input type="email" id="email" name="email" autocomplete="email" required autofocus>
      <label for="password">密碼</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
      <button type="submit" class="btn btn-primary">登入</button>
    </form>
    <div class="footer">Powered by Hayku Identity</div>
  </div>
</body>
</html>`;
}

/** 產生 MFA 驗證頁 HTML */
export function renderMfaPage(opts: MfaPageOptions): string {
  const errorHtml = opts.error ? `<div class="error">${escHtml(opts.error)}</div>` : '';
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>雙重驗證 — ${escHtml(opts.clientName)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="logo">Hayku</div>
    <div class="subtitle">請開啟 Authenticator App 取得驗證碼</div>
    ${errorHtml}
    <form method="POST" action="/oauth/mfa-verify">
      <input type="hidden" name="pending_token" value="${escHtml(opts.pendingToken)}">
      <label for="code">6 位驗證碼</label>
      <input type="text" id="code" name="code" inputmode="numeric" pattern="\\d{6}"
             maxlength="6" autocomplete="one-time-code" required autofocus
             placeholder="000000">
      <div class="hint">每 30 秒更新一次</div>
      <button type="submit" class="btn btn-primary">驗證</button>
    </form>
    <div class="footer">Powered by Hayku Identity</div>
  </div>
</body>
</html>`;
}

export function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
