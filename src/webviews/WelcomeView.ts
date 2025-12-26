import * as vscode from 'vscode';

export class WelcomeView {
  private static readonly viewType = 'gitorbit.welcome';
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static show(context: vscode.ExtensionContext, force: boolean = false) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    const extension = vscode.extensions.getExtension('selcuksarikoz.gitorbit');
    const version = extension ? extension.packageJSON.version : '1.0.0';
    const lastVersionShown = context.globalState.get<string>('welcomeVersion');

    if (!force && lastVersionShown === version) {
      return;
    }

    if (WelcomeView.currentPanel) {
      WelcomeView.currentPanel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      WelcomeView.viewType,
      'GitOrbit - Welcome',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    WelcomeView.currentPanel = panel;
    panel.webview.html = WelcomeView.getHtmlContent(panel.webview, context.extensionUri);

    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'openSettings':
            vscode.commands.executeCommand('gitorbit.openSettings');
          case 'openSettings':
            vscode.commands.executeCommand('gitorbit.openSettings');
            return;
          case 'login':
            vscode.commands.executeCommand('gitorbit.login');
            return;
          case 'donate':
            vscode.commands.executeCommand('gitorbit.donate');
            return;
          case 'feedback':
            vscode.commands.executeCommand('gitorbit.feedback');
            return;
        }
      },
      null,
      context.subscriptions
    );

    panel.onDidDispose(
      () => {
        WelcomeView.currentPanel = undefined;
      },
      null,
      context.subscriptions
    );

    context.globalState.update('welcomeVersion', version);
  }

  private static getHtmlContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'assets', 'icons', 'kuulto.png')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to GitOrbit</title>
    <style>
        :root {
            --primary: #38bdf8;
            --secondary: #818cf8;
            --accent: #c084fc;
            --background: #0f172a;
            --surface: rgba(30, 41, 59, 0.7);
            --surface-hover: rgba(30, 41, 59, 0.9);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --border: rgba(255, 255, 255, 0.1);
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 40px;
            background: var(--background);
            background-image:
                radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.1) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(129, 140, 248, 0.1) 0%, transparent 40%);
            color: var(--text-main);
            line-height: 1.6;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            position: relative;
        }

        /* Header & Hero */
        header {
            text-align: center;
            margin-bottom: 60px;
            animation: fadeInDown 0.8s ease-out;
        }

        h1 {
            font-size: 3.5rem;
            margin: 0 0 16px 0;
            background: linear-gradient(135deg, var(--primary), var(--secondary), var(--accent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 800;
            letter-spacing: -0.02em;
        }

        .subtitle {
            font-size: 1.25rem;
            color: var(--text-muted);
            max-width: 600px;
            margin: 0 auto;
        }

        /* Bento Grid Layout */
        .grid {
            display: grid;
            grid-template-columns: repeat(12, 1fr);
            gap: 24px;
            margin-bottom: 40px;
        }

        .card {
            background: var(--surface);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
        }

        .card:hover {
            transform: translateY(-4px);
            background: var(--surface-hover);
            border-color: rgba(56, 189, 248, 0.3);
            box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.3);
        }

        .card-full { grid-column: span 12; }
        .card-half { grid-column: span 6; }
        .card-third { grid-column: span 4; }

        @media (max-width: 768px) {
            .card-half, .card-third { grid-column: span 12; }
        }

        .card h2 {
            margin: 0 0 12px 0;
            font-size: 1.25rem;
            color: var(--primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .card p {
            margin: 0;
            color: var(--text-muted);
            font-size: 0.95rem;
        }

        .tag {
            background: rgba(56, 189, 248, 0.15);
            color: var(--primary);
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-left: auto;
        }

        /* UI Elements */
        .icon { font-size: 1.5rem; }

        .feature-list {
            list-style: none;
            padding: 0;
            margin: 16px 0 0 0;
            display: grid;
            gap: 12px;
        }

        .feature-list li {
            position: relative;
            padding-left: 24px;
            color: var(--text-muted);
        }

        .feature-list li::before {
            content: "→";
            position: absolute;
            left: 0;
            color: var(--secondary);
        }

        /* Buttons */
        .actions {
            text-align: center;
            margin-top: 40px;
            display: flex;
            gap: 16px;
            justify-content: center;
        }

        .btn {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: #fff;
            padding: 14px 32px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            border: none;
            cursor: pointer;
            font-size: 1rem;
            transition: opacity 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .btn:hover { opacity: 0.9; }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border);
        }

        .btn-secondary:hover { background: rgba(255, 255, 255, 0.1); }

        .donation-banner {
            position: absolute;
            top: 0;
            right: 0;
            background: rgba(0, 48, 135, 0.4);
            backdrop-filter: blur(4px);
            border: 1px solid rgba(0, 48, 135, 0.5);
            color: #fff;
            padding: 8px 16px;
            border-radius: 20px;
            text-decoration: none;
            font-weight: 500;
            font-size: 0.85rem;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        }

        .donation-banner:hover {
            background: rgba(0, 48, 135, 0.6);
            transform: translateY(-1px);
        }

        @keyframes fadeInDown {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>
    <div class="container">
    <div class="container">
        <!-- Banner removed -->

        <header>
            <h1>GitOrbit</h1>
            <p class="subtitle">Your ultimate Git companion. Now faster, smarter, and sleeker.</p>

            <div class="actions" style="margin-top: 24px;">
                <button class="btn btn-secondary" onclick="donate()">
                    <span>💙 Support Development</span>
                </button>
                <button class="btn btn-secondary" onclick="feedback()">
                    <span>💬 Feedback</span>
                </button>
                <button class="btn btn-secondary" onclick="openSettings()">
                    <span>⚙️ Configure</span>
                </button>
                <button class="btn" onclick="login()">
                    <img src="${logoUri}" style="width: 20px; height: 20px; border-radius: 4px; vertical-align: middle;"> Login with Kuulto
                </button>
            </div>
        </header>

        <div class="grid">
            <!-- Hero Feature -->
            <div class="card card-full">
                <h2><img src="${logoUri}" style="width: 32px; height: 32px; border-radius: 8px; vertical-align: middle; margin-right: 8px;"> The AI Advantage <span class="tag">Beta</span></h2>
                <p>Experience the future of version control with <strong>Smart Commit Generation</strong>, <strong>Commit Improvements</strong>, and <strong>Code Smell Detection</strong>. Accelerate your workflow with <strong>Kuulto Terminal</strong> (coming soon). Powered by <a href="https://kuulto.app" style="color: var(--primary); text-decoration: none;">kuulto.app</a>.</p>
            </div>

            <!-- New Features -->
            <div class="card card-half">
                <h2><span class="icon">🚀</span> Power Features</h2>
                <ul class="feature-list">
                    <li><strong>Interactive Rebase (Beta):</strong> Visually manage history rewrites.</li>
                    <li><strong>Git Flow Support:</strong> Built-in workflows for serious teams.</li>
                    <li><strong>High-Performance Diff:</strong> View 100+ file diffs instantly.</li>
                </ul>
            </div>

            <div class="card card-half">
                <h2><span class="icon">❤️</span> Developer Experience</h2>
                <ul class="feature-list">
                    <li><strong>Enhanced Blame:</strong> Our best-in-class inline & file blame.</li>
                    <li><strong>Cleaner Git Graph:</strong> Beautiful, clutter-free history visualization.</li>
                    <li><strong>Contributors & Tags:</strong> Dedicated views for project stats.</li>
                </ul>
            </div>

            <!-- Quick Actions -->
            <div class="card card-third">
                <h2>💬 Chat</h2>
                <p>Discuss diffs and history deeply with context-aware AI.</p>
            </div>
            <div class="card card-third">
                <h2>💡 Analyze</h2>
                <p>Get instant feedback on code smells and potential bugs.</p>
            </div>
             <div class="card card-third">
                <h2>⚡️ Speed</h2>
                <p>Optimized for large repositories with thousands of files.</p>
            </div>
        </div>

        <!-- Actions removed, moved to header -->
        <!--
        <div class="actions">
            <button class="btn" onclick="openSettings()">
                <span>⚙️ Configure GitOrbit</span>
            </button>
            <a href="https://github.com/selcuksarikoz/git-orbit" class="btn btn-secondary">
                <span>⭐ Star on GitHub</span>
            </a>
        </div>
        -->
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }
        function login() {
            vscode.postMessage({ command: 'login' });
        }
        function donate() {
            vscode.postMessage({ command: 'donate' });
        }
        function feedback() {
            vscode.postMessage({ command: 'feedback' });
        }
    </script>
</body>
</html>`;
  }
}
