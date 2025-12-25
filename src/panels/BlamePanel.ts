import * as vscode from 'vscode';
import { GitService } from '../services/GitService';
import { formatRelativeTime } from '../utils/BlameUtils';

interface BlameLineInfo {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  authorTime: number;
  summary: string;
  lineNumber: number;
  lineContent: string;
}

export class BlamePanel {
  public static currentPanel: BlamePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, blameInfo: BlameLineInfo) {
    const column = vscode.ViewColumn.Beside;

    // If we already have a panel, show it
    if (BlamePanel.currentPanel) {
      BlamePanel.currentPanel._panel.reveal(column);
      BlamePanel.currentPanel._update(blameInfo);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel('gitOrbitBlame', 'Git Blame Details', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    BlamePanel.currentPanel = new BlamePanel(panel, extensionUri, blameInfo);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    blameInfo: BlameLineInfo
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update(blameInfo);

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'viewDiff':
            await vscode.commands.executeCommand('gitorbit.openCommitDiffs', {
              hash: message.hash,
            });
            break;
          case 'copyHash':
            await vscode.commands.executeCommand('gitorbit.copyCommitHash', message.hash);
            break;
          case 'openOnWeb':
            await vscode.commands.executeCommand('gitorbit.openCommitOnWeb', message.hash);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _update(blameInfo: BlameLineInfo) {
    this._panel.title = `Blame: Line ${blameInfo.lineNumber}`;

    // Get the active editor to fetch file path
    const editor = vscode.window.activeTextEditor;
    let fileBlameData: any[] = [];

    if (editor) {
      try {
        const gitService = GitService.getInstance();
        const blameOutput = await gitService.getBlame(editor.document.uri.fsPath);
        fileBlameData = this._parseFileBlame(blameOutput);
      } catch (error) {
        console.error('Failed to get file blame:', error);
      }
    }

    this._panel.webview.html = this._getHtmlForWebview(blameInfo, fileBlameData);
  }

  public dispose() {
    BlamePanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _getHtmlForWebview(blameInfo: BlameLineInfo, fileBlameData: any[]): string {
    const gravatarUrl = this._getGravatarUrl(blameInfo.authorEmail);
    const relativeTime = formatRelativeTime(blameInfo.authorTime);
    const fullDate = new Date(blameInfo.authorTime * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Generate file history HTML
    const fileHistoryHtml = fileBlameData
      .map((commit, index) => {
        const commitRelativeTime = formatRelativeTime(commit.authorTime);
        const lineRanges = this._formatLineRanges(commit.lines);
        const commitGravatarUrl = this._getGravatarUrl(commit.authorEmail);

        return `
        <div class="commit-item">
          <div class="commit-header" onclick="toggleCommit(${index})">
            <img class="commit-avatar" src="${commitGravatarUrl}" alt="${commit.author}">
            <div class="commit-info">
              <div class="commit-author">${this._escapeHtml(commit.author)}</div>
              <div class="commit-meta">
                <span class="commit-hash-small">${commit.shortHash}</span>
                <span class="commit-time">${commitRelativeTime}</span>
                <span class="commit-lines">${commit.lines.length} line${commit.lines.length > 1 ? 's' : ''}</span>
              </div>
            </div>
            <button class="detail-btn" onclick="event.stopPropagation(); toggleCommit(${index})" title="View Details">
              <span class="icon">ℹ️</span>
            </button>
            <span class="toggle-icon" id="toggle-${index}">▶</span>
          </div>
          <div class="commit-details" id="details-${index}" style="display: none;">
            <div class="commit-message-small">${this._escapeHtml(commit.summary)}</div>
            <div class="commit-line-ranges">Lines: ${lineRanges}</div>
            <button class="commit-action-btn" onclick="viewCommitDiff('${commit.hash}')">
              <span class="icon">📊</span> View Diff
            </button>
          </div>
        </div>
      `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Blame Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
            margin: 0;
        }
        .header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: 2px solid var(--vscode-focusBorder);
        }
        .author-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .author-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .commit-time {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        .section {
            margin-bottom: 20px;
        }
        .section-title {
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        .commit-hash {
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-textCodeBlock-background);
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 13px;
        }
        .commit-message {
            font-size: 14px;
            padding: 10px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-focusBorder);
            margin: 10px 0;
        }
        .line-info {
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 3px;
            font-size: 13px;
            margin-top: 10px;
        }
        .line-number {
            color: var(--vscode-editorLineNumber-foreground);
            margin-right: 10px;
        }
        .actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .icon {
            font-size: 16px;
        }

        /* File History Styles */
        .file-history {
            margin-top: 30px;
        }
        .file-history-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            color: var(--vscode-foreground);
        }
        .commit-item {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
            margin-bottom: 10px;
            overflow: hidden;
        }
        .commit-header {
            display: flex;
            align-items: center;
            padding: 12px;
            cursor: pointer;
            gap: 10px;
            position: relative;
        }
        .commit-header:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .commit-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
        }
        .commit-info {
            flex: 1;
        }
        .commit-author {
            font-weight: bold;
            font-size: 13px;
        }
        .commit-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
        .detail-btn {
            background: transparent;
            border: 1px solid var(--vscode-button-border);
            padding: 4px 8px;
            margin-right: 5px;
            font-size: 14px;
        }
        .detail-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .commit-hash-small {
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            margin-right: 8px;
        }
        .commit-lines {
            margin-left: 8px;
        }
        .toggle-icon {
            font-size: 12px;
            transition: transform 0.2s;
        }
        .toggle-icon.open {
            transform: rotate(90deg);
        }
        .commit-details {
            padding: 0 12px 12px 54px;
        }
        .commit-message-small {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        .commit-line-ranges {
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
        }
        .commit-action-btn {
            font-size: 12px;
            padding: 6px 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <img class="avatar" src="${gravatarUrl}" alt="${blameInfo.author}">
        <div class="author-info">
            <div class="author-name">${blameInfo.author}</div>
            <div class="commit-time">${relativeTime} • ${fullDate}</div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Commit</div>
        <div class="commit-hash">${blameInfo.shortHash} (${blameInfo.hash})</div>
    </div>

    <div class="section">
        <div class="section-title">Message</div>
        <div class="commit-message">${this._escapeHtml(blameInfo.summary)}</div>
    </div>

    <div class="section">
        <div class="section-title">Line ${blameInfo.lineNumber}</div>
        <div class="line-info">
            <span class="line-number">${blameInfo.lineNumber}</span>
            <span>${this._escapeHtml(blameInfo.lineContent)}</span>
        </div>
    </div>

    <div class="actions">
        <button onclick="viewDiff()">
            <span class="icon">📊</span>
            View Diff
        </button>
        <button class="secondary" onclick="copyHash()">
            <span class="icon">📋</span>
            Copy Hash
        </button>
        <button class="secondary" onclick="openOnWeb()">
            <span class="icon">🌐</span>
            Open on Web
        </button>
    </div>

    <div class="file-history">
        <div class="file-history-title">📜 File Blame History (${fileBlameData.length} commits)</div>
        ${fileHistoryHtml}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function viewDiff() {
            vscode.postMessage({
                command: 'viewDiff',
                hash: '${blameInfo.hash}'
            });
        }

        function copyHash() {
            vscode.postMessage({
                command: 'copyHash',
                hash: '${blameInfo.hash}'
            });
        }

        function openOnWeb() {
            vscode.postMessage({
                command: 'openOnWeb',
                hash: '${blameInfo.hash}'
            });
        }

        function viewCommitDiff(hash) {
            vscode.postMessage({
                command: 'viewDiff',
                hash: hash
            });
        }

        function toggleCommit(index) {
            const details = document.getElementById('details-' + index);
            const toggle = document.getElementById('toggle-' + index);

            if (details.style.display === 'none') {
                details.style.display = 'block';
                toggle.classList.add('open');
            } else {
                details.style.display = 'none';
                toggle.classList.remove('open');
            }
        }
    </script>
</body>
</html>`;
  }

  private _getGravatarUrl(email: string): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
    return `https://www.gravatar.com/avatar/${hash}?s=60&d=identicon`;
  }

  private _parseFileBlame(blameOutput: string): any[] {
    const lines = blameOutput.split('\n');
    const commitMap = new Map<string, any>();

    let currentLine = 0;
    let currentInfo: any = {};

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const hashMatch = text.match(/^([0-9a-f]{40})/);

      if (hashMatch) {
        currentInfo = {
          hash: hashMatch[1],
          shortHash: hashMatch[1].substring(0, 7),
          lines: [],
        };
      } else if (text.startsWith('author ')) {
        currentInfo.author = text.substring(7);
      } else if (text.startsWith('author-mail ')) {
        currentInfo.authorEmail = text.substring(12).replace(/[<>]/g, '');
      } else if (text.startsWith('author-time ')) {
        currentInfo.authorTime = parseInt(text.substring(12));
      } else if (text.startsWith('summary ')) {
        currentInfo.summary = text.substring(8);
      } else if (text.startsWith('\t')) {
        currentLine++;

        if (currentInfo.hash) {
          if (!commitMap.has(currentInfo.hash)) {
            commitMap.set(currentInfo.hash, {
              hash: currentInfo.hash,
              shortHash: currentInfo.shortHash,
              author: currentInfo.author,
              authorEmail: currentInfo.authorEmail,
              authorTime: currentInfo.authorTime,
              summary: currentInfo.summary,
              lines: [],
            });
          }
          commitMap.get(currentInfo.hash)!.lines.push(currentLine);
        }
      }
    }

    // Convert map to array and sort by time (newest first)
    return Array.from(commitMap.values()).sort((a, b) => b.authorTime - a.authorTime);
  }

  private _formatLineRanges(lines: number[]): string {
    if (lines.length === 0) return '';

    const sorted = [...lines].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    return ranges.join(', ');
  }

  private _formatClickableLineRanges(lines: number[]): string {
    if (lines.length === 0) return '';

    const sorted = [...lines].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        if (start === end) {
          ranges.push(`<a class="line-link" onclick="goToLine(${start})">${start}</a>`);
        } else {
          ranges.push(`<a class="line-link" onclick="goToLine(${start})">${start}-${end}</a>`);
        }
        start = sorted[i];
        end = sorted[i];
      }
    }
    if (start === end) {
      ranges.push(`<a class="line-link" onclick="goToLine(${start})">${start}</a>`);
    } else {
      ranges.push(`<a class="line-link" onclick="goToLine(${start})">${start}-${end}</a>`);
    }

    return ranges.join(', ');
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
