import * as vscode from "vscode";

export class WelcomeView {
  private static readonly viewType = "gitorbit.welcome";
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static show(context: vscode.ExtensionContext, force: boolean = false) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    const version = context.extension.packageJSON.version;
    const lastVersionShown = context.globalState.get<string>("welcomeVersion");

    if (!force && lastVersionShown === version) {
      return;
    }

    if (WelcomeView.currentPanel) {
      WelcomeView.currentPanel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      WelcomeView.viewType,
      "GitOrbit - Welcome",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    WelcomeView.currentPanel = panel;
    panel.webview.html = WelcomeView.getHtmlContent(
      panel.webview,
      context.extensionUri
    );

    panel.onDidDispose(
      () => {
        WelcomeView.currentPanel = undefined;
      },
      null,
      context.subscriptions
    );

    context.globalState.update("welcomeVersion", version);
  }

  private static getHtmlContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to GitOrbit</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            padding: 40px;
            background: #0f172a;
            color: #f8fafc;
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            font-size: 3rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(90deg, #38bdf8, #818cf8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            font-size: 1.25rem;
            color: #94a3b8;
            margin-bottom: 2rem;
        }
        .card {
            background: #1e293b;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
            border: 1px solid #334155;
        }
        .card h2 {
            margin-top: 0;
            color: #38bdf8;
        }
        .btn {
            display: inline-block;
            background: #38bdf8;
            color: #0f172a;
            padding: 10px 20px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: opacity 0.2s;
        }
        .btn:hover {
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>GitOrbit</h1>
        <p class="subtitle">A Professional, Modular, and High-Performance Git Extension.</p>
        
        <div class="card">
            <h2>🚀 Feature Rich</h2>
            <ul>
                <li><strong>Tree Views:</strong> Manage branches, commits, and stashes with ease.</li>
                <li><strong>Graph & Exploration:</strong> Interactive commit graph with file-level drilling.</li>
                <li><strong>Editor Integration:</strong> Inline blame and CodeLens information.</li>
                <li><strong>Gitflow:</strong> Kickstart features and hotfixes directly from the sidebar.</li>
                <li><strong>Performance:</strong> Lightweight and powered by direct Git execution.</li>
            </ul>
        </div>

        <div class="card">
            <h2>⚙️ Get Started</h2>
            <p>Configure GitOrbit to match your workflow. You can toggle inline blame, set your Gitflow prefixes, and more.</p>
            <button class="btn" onclick="openSettings()">Configure Settings</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }
    </script>
</body>
</html>`;
  }
}
