import * as vscode from 'vscode';

export interface WebviewLayoutOptions {
  title: string;
  scripts?: string;
  bodyClass?: string;
}

export function getWebviewLayout(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  options: WebviewLayoutOptions,
  content: string
): string {
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;">
    <title>${options.title}</title>
    <style>
        ${getBaseStyles()}
    </style>
</head>
<body class="${options.bodyClass || ''}">
    ${content}
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        ${options.scripts || ''}
    </script>
</body>
</html>`;
}

export function getLoadingHtml(message: string = 'Loading...'): string {
  return `<!DOCTYPE html>
<html><head><style>
${getBaseStyles()}
.loader { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
.spinner { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
@keyframes spin { to { transform: rotate(360deg); } }
</style></head>
<body><div class="loader"><div class="spinner"></div><p>${message}</p></div></body></html>`;
}

export function getErrorHtml(error: any): string {
  return `<!DOCTYPE html>
<html><head><style>
${getBaseStyles()}
.error-container { padding: 40px; text-align: center; }
.error-container h2 { color: var(--danger); }
</style></head>
<body><div class="error-container"><h2>Error</h2><p>${error?.message || error}</p></div></body></html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getBaseStyles(): string {
  return `
    :root {
      --bg: #0f172a;
      --bg-alt: #0c1322;
      --surface: #1e293b;
      --surface-hover: #334155;
      --border: #334155;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #0ea5e9;
      --secondary: #818cf8;
      --accent: #c084fc;
      --success: #22c55e;
      --success-bg: rgba(34, 197, 94, 0.15);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.15);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.15);
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --radius-xl: 16px;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 24px;
    }

    body.center { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 0; }

    /* Typography */
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 8px; }
    h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; color: var(--primary); }
    h3 { font-size: 1rem; font-weight: 600; margin-bottom: 4px; }
    p { color: var(--text-muted); }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: 'SF Mono', Monaco, Consolas, monospace; background: var(--surface); padding: 2px 6px; border-radius: var(--radius-sm); font-size: 0.875rem; }

    /* Layout */
    .container { max-width: 1000px; margin: 0 auto; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-xs { gap: 4px; }
    .gap-sm { gap: 8px; }
    .gap-md { gap: 16px; }
    .gap-lg { gap: 24px; }
    .flex-1 { flex: 1; }
    .flex-wrap { flex-wrap: wrap; }

    /* Spacing */
    .mt-sm { margin-top: 8px; }
    .mt-md { margin-top: 16px; }
    .mt-lg { margin-top: 24px; }
    .mb-sm { margin-bottom: 8px; }
    .mb-md { margin-bottom: 16px; }
    .mb-lg { margin-bottom: 24px; }

    /* Cards & Sections */
    .card, .section {
      background: var(--surface);
      border-radius: var(--radius-lg);
      padding: 20px;
      margin-bottom: 16px;
    }
    .card:hover { background: var(--surface-hover); }
    .section-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }

    /* Buttons - Unified Design System */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 40px;
      padding: 0 20px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.875rem;
      font-family: inherit;
      transition: all 0.15s ease;
      text-decoration: none;
      white-space: nowrap;
    }
    .btn:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
    .btn:active { transform: translateY(0); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    /* Button Colors - Only bg/text changes */
    .btn-primary { background: var(--primary); color: #0f172a; border-color: var(--primary); }
    .btn-primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
    .btn-secondary { background: var(--surface); color: var(--text); border-color: var(--border); }
    .btn-secondary:hover { background: var(--surface-hover); }
    .btn-success { background: var(--success); color: #fff; border-color: var(--success); }
    .btn-success:hover { background: #16a34a; border-color: #16a34a; }
    .btn-danger { background: var(--danger); color: #fff; border-color: var(--danger); }
    .btn-danger:hover { background: #dc2626; border-color: #dc2626; }
    .btn-warning { background: var(--warning); color: #0f172a; border-color: var(--warning); }
    .btn-warning:hover { background: #d97706; border-color: #d97706; }
    .btn-ghost { background: transparent; color: var(--text-muted); border-color: transparent; }
    .btn-ghost:hover { color: var(--text); background: var(--surface); }

    /* Button Sizes - Same proportions */
    .btn-sm { height: 32px; padding: 0 14px; font-size: 0.8rem; }
    .btn-lg { height: 48px; padding: 0 28px; font-size: 1rem; }

    /* Icon Button - Square */
    .btn-icon {
      width: 36px;
      height: 36px;
      padding: 0;
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .btn-icon:hover { color: var(--text); background: var(--surface); }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-success { background: var(--success-bg); color: var(--success); }
    .badge-warning { background: var(--warning-bg); color: var(--warning); }
    .badge-danger { background: var(--danger-bg); color: var(--danger); }
    .badge-primary { background: rgba(56, 189, 248, 0.15); color: var(--primary); }
    .badge-muted { background: rgba(148, 163, 184, 0.15); color: var(--text-muted); }

    /* Forms */
    input, textarea, select {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 14px;
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      transition: border-color 0.2s;
    }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--primary);
    }
    input::placeholder, textarea::placeholder { color: var(--text-muted); }
    textarea { resize: vertical; min-height: 80px; }
    label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px; }

    /* Lists */
    .list { list-style: none; }
    .list-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-bottom: 1px solid var(--border);
    }
    .list-item:last-child { border-bottom: none; }
    .list-item:hover { background: var(--bg); }

    /* Avatar */
    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
    }
    .avatar-sm { width: 24px; height: 24px; }
    .avatar-lg { width: 48px; height: 48px; }

    /* Stats */
    .stat {
      background: var(--surface);
      padding: 16px 20px;
      border-radius: var(--radius-md);
      text-align: center;
    }
    .stat-value { font-size: 1.5rem; font-weight: 700; }
    .stat-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; }
    .stat-success .stat-value { color: var(--success); }
    .stat-danger .stat-value { color: var(--danger); }

    /* Header */
    .header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
    }
    .header-content { flex: 1; }
    .header-actions { display: flex; gap: 8px; }

    /* Meta info */
    .meta { color: var(--text-muted); font-size: 0.875rem; }
    .meta a { color: var(--primary); }

    /* Scrollable areas */
    .scrollable {
      max-height: 300px;
      overflow-y: auto;
    }
    .scrollable::-webkit-scrollbar { width: 6px; }
    .scrollable::-webkit-scrollbar-track { background: var(--bg); }
    .scrollable::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .scrollable::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

    /* Animations */
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
    .animate-fadeInUp { animation: fadeInUp 0.4s ease-out; }

    /* Grid */
    .grid { display: grid; gap: 16px; }
    .grid-2 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }
    .grid-4 { grid-template-columns: repeat(4, 1fr); }
    @media (max-width: 768px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    }

    /* Divider */
    .divider { height: 1px; background: var(--border); margin: 16px 0; }

    /* Empty state */
    .empty { text-align: center; padding: 40px 20px; color: var(--text-muted); }
    .empty-icon { font-size: 3rem; margin-bottom: 16px; opacity: 0.5; }

    /* Tag */
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: var(--bg);
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-family: monospace;
    }
  `;
}

export { getBaseStyles };
