import * as vscode from 'vscode';
import { getBaseStyles } from './WebviewLayout';

export class WelcomeView {
  private static readonly viewType = 'gitorbit.welcome';
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static show(context: vscode.ExtensionContext, force: boolean = false) {
    const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

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
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    WelcomeView.currentPanel = panel;
    panel.webview.html = WelcomeView.getHtmlContent(panel.webview, context.extensionUri);

    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'openSettings':
            vscode.commands.executeCommand('gitorbit.openSettings');
            break;
          case 'login':
            vscode.commands.executeCommand('gitorbit.login');
            break;
          case 'donate':
            vscode.commands.executeCommand('gitorbit.donate');
            break;
          case 'feedback':
            vscode.commands.executeCommand('gitorbit.feedback');
            break;
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
        ${getBaseStyles()}

        body {
            padding: 40px 24px;
            background-image:
                radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(129, 140, 248, 0.08) 0%, transparent 40%);
        }

        .welcome-container {
            max-width: 900px;
            margin: 0 auto;
        }

        .hero {
            text-align: center;
            margin-bottom: 48px;
            animation: fadeInUp 0.6s ease-out;
        }

        .hero-title {
            font-size: 3rem;
            font-weight: 800;
            margin-bottom: 12px;
            background: linear-gradient(135deg, var(--primary), var(--secondary), var(--accent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.02em;
        }

        .hero-subtitle {
            font-size: 1.15rem;
            color: var(--text-muted);
            max-width: 500px;
            margin: 0 auto 24px;
        }

        .hero-actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }

        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 32px;
        }

        .feature-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-xl);
            padding: 24px;
            transition: all 0.3s ease;
            animation: fadeInUp 0.6s ease-out backwards;
        }

        .feature-card:nth-child(1) { animation-delay: 0.1s; }
        .feature-card:nth-child(2) { animation-delay: 0.2s; }
        .feature-card:nth-child(3) { animation-delay: 0.3s; }
        .feature-card:nth-child(4) { animation-delay: 0.4s; }

        .feature-card:hover {
            transform: translateY(-4px);
            border-color: rgba(56, 189, 248, 0.3);
            box-shadow: var(--shadow-lg);
        }

        .feature-icon {
            font-size: 1.75rem;
            margin-bottom: 12px;
        }

        .feature-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--primary);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .feature-desc {
            color: var(--text-muted);
            font-size: 0.9rem;
            line-height: 1.6;
        }

        .ai-banner {
            background: linear-gradient(135deg, rgba(56, 189, 248, 0.1), rgba(129, 140, 248, 0.1));
            border: 1px solid var(--border);
            border-radius: var(--radius-xl);
            padding: 28px;
            display: flex;
            align-items: center;
            gap: 20px;
            margin-bottom: 32px;
            animation: fadeInUp 0.6s ease-out 0.5s backwards;
        }

        .ai-logo {
            width: 56px;
            height: 56px;
            border-radius: var(--radius-lg);
        }

        .ai-content {
            flex: 1;
        }

        .ai-title {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .ai-desc {
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        .quick-links {
            display: flex;
            gap: 16px;
            justify-content: center;
            flex-wrap: wrap;
            animation: fadeInUp 0.6s ease-out 0.6s backwards;
        }

        .quick-link {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            color: var(--text);
            text-decoration: none;
            font-weight: 500;
            transition: all 0.2s;
            cursor: pointer;
        }

        .quick-link:hover {
            background: var(--surface-hover);
            border-color: var(--primary);
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="welcome-container">
        <div class="hero">
            <h1 class="hero-title">GitOrbit</h1>
            <p class="hero-subtitle">The complete Git toolkit for VS Code — fast, powerful, and beautifully designed.</p>
            <div class="hero-actions">
                <button class="btn btn-primary" onclick="openSettings()">⚙️ Configure</button>
                <button class="btn btn-secondary" onclick="feedback()">💬 Feedback</button>
                <button class="btn btn-secondary" onclick="donate()">💙 Support</button>
            </div>
        </div>

        <div class="feature-grid">
            <div class="feature-card">
                <div class="feature-icon">🔍</div>
                <div class="feature-title">Git Bisect Wizard</div>
                <div class="feature-desc">Find bugs with a guided visual interface. Select from branches or enter custom refs.</div>
            </div>

            <div class="feature-card">
                <div class="feature-icon">🌳</div>
                <div class="feature-title">Visual Git Graph</div>
                <div class="feature-desc">Beautiful commit history with branch visualization, filtering, and context actions.</div>
            </div>

            <div class="feature-card">
                <div class="feature-icon">📝</div>
                <div class="feature-title">Smart Blame</div>
                <div class="feature-desc">Inline blame, gutter heatmaps, and full file annotations at your fingertips.</div>
            </div>

            <div class="feature-card">
                <div class="feature-icon">🔗</div>
                <div class="feature-title">Pull Requests</div>
                <div class="feature-desc">View, review, comment, and merge PRs directly in VS Code. Add reviewers with ease.</div>
            </div>
        </div>

        <div class="ai-banner">
            <img src="${logoUri}" alt="Kuulto" class="ai-logo" />
            <div class="ai-content">
                <div class="ai-title">Optional AI Features</div>
                <div class="ai-desc">Smart commit messages, code smell detection, and AI chat. Powered by <a href="https://kuulto.app" style="color: var(--primary);">Kuulto</a>, OpenAI, Gemini, or Anthropic.</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="login()">Login</button>
        </div>

        <div class="quick-links">
            <a href="https://github.com/selcuksarikoz/git-orbit" class="quick-link" target="_blank">⭐ Star on GitHub</a>
            <a href="https://marketplace.visualstudio.com/items?itemName=selcuksarikoz.gitorbit" class="quick-link" target="_blank">📦 Marketplace</a>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function openSettings() { vscode.postMessage({ command: 'openSettings' }); }
        function login() { vscode.postMessage({ command: 'login' }); }
        function donate() { vscode.postMessage({ command: 'donate' }); }
        function feedback() { vscode.postMessage({ command: 'feedback' }); }
    </script>
</body>
</html>`;
  }
}
