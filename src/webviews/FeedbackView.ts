import * as vscode from 'vscode';
import { getBaseStyles } from './WebviewLayout';

export class FeedbackView {
  private static readonly viewType = 'gitorbit.feedback';
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static show(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (FeedbackView.currentPanel) {
      FeedbackView.currentPanel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      FeedbackView.viewType,
      'GitOrbit - Support & Feedback',
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    FeedbackView.currentPanel = panel;
    panel.webview.html = FeedbackView.getHtmlContent();

    panel.onDidDispose(() => {
      FeedbackView.currentPanel = undefined;
    }, null, []);
  }

  private static getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support & Feedback</title>
    <style>
        ${getBaseStyles()}

        body {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
            background-image:
                radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(129, 140, 248, 0.08) 0%, transparent 40%);
        }

        .feedback-card {
            max-width: 480px;
            width: 100%;
            text-align: center;
            animation: fadeInUp 0.6s ease-out;
        }

        .icon-box {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(129, 140, 248, 0.15));
            border-radius: var(--radius-xl);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 2.5rem;
            border: 1px solid var(--border);
        }

        .title {
            font-size: 2rem;
            font-weight: 800;
            margin-bottom: 16px;
            background: linear-gradient(135deg, var(--primary), var(--secondary), var(--accent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .message {
            color: var(--text-muted);
            font-size: 1.05rem;
            line-height: 1.7;
            margin-bottom: 32px;
        }

        .email-link-box {
            display: inline-block;
            background: var(--bg-alt);
            border: 1px solid var(--border);
            padding: 16px 28px;
            border-radius: var(--radius-lg);
            transition: all 0.3s ease;
        }

        .email-link-box:hover {
            border-color: var(--primary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg);
        }

        .email-link-box a {
            color: var(--primary);
            text-decoration: none;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 1.05rem;
            font-weight: 600;
        }

        .footer-note {
            margin-top: 32px;
            font-size: 0.875rem;
            color: var(--text-muted);
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="feedback-card section">
        <div class="icon-box">✉️</div>
        <div class="title">Get in Touch</div>
        <p class="message">
            Questions, bug reports, feature requests, or just feedback —<br>
            we'd love to hear from you!
        </p>

        <div class="email-link-box">
            <a href="mailto:benimpostahesabim@gmail.com">benimpostahesabim@gmail.com</a>
        </div>

        <p class="footer-note">We usually respond within 24-48 hours.</p>
    </div>
</body>
</html>`;
  }
}
