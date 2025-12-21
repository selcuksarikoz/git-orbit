import * as vscode from "vscode";

export class WelcomeView {
  private static readonly viewType = "gitorbit.welcome";
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static show(context: vscode.ExtensionContext, force: boolean = false) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    const extension = vscode.extensions.getExtension("selcuksarikoz.gitorbit");
    const version = extension ? extension.packageJSON.version : "1.0.0";
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

    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "openSettings":
            vscode.commands.executeCommand("gitorbit.openSettings");
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
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .card h2 {
            margin-top: 0;
            color: #38bdf8;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        ul {
            padding-left: 20px;
        }
        li {
            margin-bottom: 8px;
            color: #cbd5e1;
        }
        .btn {
            display: inline-block;
            background: #38bdf8;
            color: #0f172a;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
        }
        .btn:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>GitOrbit</h1>
        <p class="subtitle">Simplify your Git management with helpful AI assistance. Designed to make your daily workflow easier and more organized.</p>
        
        <div class="card">
            <h2>✨ AI Assistance</h2>
            <div class="features-grid">
                <div>
                    <h3>💬 Conversational AI</h3>
                    <p>Ask about your changes or specific commits. Get helpful explanations for complex logic or diffs.</p>
                </div>
                <div>
                    <h3>🔍 Simple Code Smell Detection</h3>
                    <p>Scan your changes for potential improvements and technical debt before you commit.</p>
                </div>
                <div>
                    <h3>✍️ Smart Commit Messages</h3>
                    <p>Generate clean, professional commit messages based on your staged changes with a single click.</p>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>🛠️ Easy Git Management</h2>
            <div class="features-grid">
                <div>
                    <h3>🌳 Simplified Workflow</h3>
                    <p>Manage branches, history, and staging through a clean, intuitive interface that removes the clutter.</p>
                </div>
                <div>
                    <h3>⚡️ Multi-Provider Support</h3>
                    <p>Works with your favorite AI: OpenRouter, Gemini, OpenAI, Anthropic, or xGrok.</p>
                </div>
                <div>
                    <h3>🎯 Focused Tools</h3>
                    <p>From inline blame to detailed commit graphs, get the tools you need without the complexity.</p>
                </div>
            </div>
        </div>

        <div class="features-grid">
            <div class="card">
                <h2>⚡️ Core Features</h2>
                <ul>
                    <li><strong>Commit Graph:</strong> Interactive, filterable history visualization.</li>
                    <li><strong>Branch Manager:</strong> Organize and interact with local/remote branches.</li>
                    <li><strong>Stash Explorer:</strong> View and apply stashes with diff previews.</li>
                    <li><strong>Inline Blame:</strong> Unobtrusive ghost text for authorship.</li>
                    <li><strong>CodeLens:</strong> Quick insights at the top of functions.</li>
                </ul>
            </div>
            
            <div class="card">
                <h2>⚙️ Get Started</h2>
                <p>Tailor GitOrbit to your needs. Toggle inline blame, set commit limits, or configure auto-sync intervals.</p>
                <br>
                <button class="btn" onclick="openSettings()">Open Settings</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function openSettings() {
            vscode.postMessage({ command: 'openSettings' }); // Handled in WelcomeView.ts or extension.ts
        }
    </script>
</body>
</html>`;
  }
}
