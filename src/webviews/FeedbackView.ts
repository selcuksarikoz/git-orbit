import * as vscode from 'vscode';

export class FeedbackView {
  private static readonly viewType = 'gitorbit.feedback';
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static show(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (FeedbackView.currentPanel) {
      FeedbackView.currentPanel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      FeedbackView.viewType,
      'GitOrbit - Support & Feedback',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    FeedbackView.currentPanel = panel;
    panel.webview.html = FeedbackView.getHtmlContent(panel.webview, extensionUri);

    panel.onDidDispose(
      () => {
        FeedbackView.currentPanel = undefined;
      },
      null,
      []
    );
  }

  private static getHtmlContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support & Feedback</title>
    <style>
        :root {
            --primary: #38bdf8;
            --secondary: #818cf8;
            --accent: #c084fc;
            --background: #0f172a;
            --surface: rgba(30, 41, 59, 0.7);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --border: rgba(255, 255, 255, 0.1);
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background: var(--background);
            background-image:
                radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.1) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(129, 140, 248, 0.1) 0%, transparent 40%);
            color: var(--text-main);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            overflow: hidden;
        }

        .container {
            width: 100%;
            max-width: 500px;
            padding: 40px;
            text-align: center;
            animation: fadeIn 0.8s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .card {
            background: var(--surface);
            backdrop-filter: blur(20px);
            border: 1px solid var(--border);
            border-radius: 32px;
            padding: 48px 32px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
        }

        .icon-wrapper {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(129, 140, 248, 0.2));
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 2.5rem;
            border: 1px solid var(--border);
        }

        h1 {
            font-size: 2.2rem;
            margin: 0 0 16px 0;
            background: linear-gradient(135deg, var(--primary), var(--secondary), var(--accent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 800;
            letter-spacing: -0.02em;
        }

        .message {
            color: var(--text-muted);
            font-size: 1.1rem;
            line-height: 1.6;
            margin-bottom: 32px;
        }

        .email-box {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border);
            padding: 16px 24px;
            border-radius: 16px;
            display: inline-block;
            transition: all 0.3s;
        }

        .email-box:hover {
            border-color: var(--primary);
            background: rgba(15, 23, 42, 0.8);
            transform: translateY(-2px);
        }

        .email-link {
            color: var(--primary);
            text-decoration: none;
            font-family: monospace;
            font-size: 1.1rem;
            font-weight: 600;
        }

        .footer {
            margin-top: 40px;
            font-size: 0.85rem;
            color: var(--text-muted);
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="icon-wrapper">✉️</div>
            <h1>Get in Touch</h1>
            <p class="message">
                For any issues, bug reports, feature suggestions, or general feedback,
                please feel free to reach out to us via email.
            </p>

            <div class="email-box">
                <a href="mailto:benimpostahesabim@gmail.com" class="email-link">
                    benimpostahesabim@gmail.com
                </a>
            </div>

            <div class="footer">
                We usually respond within 24-48 hours.
            </div>
        </div>
    </div>
</body>
</html>`;
  }
}
