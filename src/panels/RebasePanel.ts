import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

export class RebasePanel {
  public static currentPanel: RebasePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _commits: any[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, commits: any[]) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._commits = commits;

    this._update();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'rebase':
            this._handleRebase(message.commits);
            return;
          case 'abort':
            try {
              await GitService.getInstance().abortRebase();
              vscode.window.showInformationMessage('Rebase aborted.');
            } catch (e) {
              // Rebase might not be in progress, but we still want to close the panel
              vscode.window.showInformationMessage('Rebase control closed.');
            } finally {
              this.dispose();
            }
            return;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private async _handleRebase(commits: any[]) {
    const confirmation = await vscode.window.showWarningMessage(
      'Are you sure you want to perform this rebase? This will rewrite history.',
      { modal: true },
      'Yes, Start Rebase'
    );

    if (confirmation !== 'Yes, Start Rebase') return;

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Performing Interactive Rebase...',
        cancellable: false,
      },
      async (progress) => {
        // In a real implementation, we would generate a script and use GIT_SEQUENCE_EDITOR
        // For this design task, we demonstrate the intent.
        await new Promise((resolve) => setTimeout(resolve, 2000));
        vscode.window.showInformationMessage(
          'Rebase simulation complete. (Logic to be hooked to git rebase -i)'
        );
        this.dispose();
      }
    );
  }

  public static async createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    let commits: any[] = [];
    try {
      const log = await GitService.getInstance().getLog(15);
      commits = log.all.map((c) => ({
        ...c,
        action: 'pick',
      }));
    } catch (e) {
      vscode.window.showErrorMessage('Could not fetch commits for rebase.');
      return;
    }

    if (RebasePanel.currentPanel) {
      RebasePanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'interactiveRebase',
      'Interactive Rebase - GitOrbit',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'assets')],
      }
    );

    RebasePanel.currentPanel = new RebasePanel(panel, extensionUri, commits);
  }

  public dispose() {
    RebasePanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview() {
    const commitsJson = JSON.stringify(this._commits);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interactive Rebase</title>
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-panel-border);
            --item-bg: var(--vscode-list-inactiveSelectionBackground);
            --hover-bg: var(--vscode-list-hoverBackground);
            --accent: #007acc;
            --danger: #e51400;
            --success: #4ec9b0;
            --font-mono: var(--vscode-editor-font-family, 'SF Mono', Monaco, Consolas, monospace);
        }

        body {
            background-color: var(--bg);
            color: var(--fg);
            font-family: var(--vscode-font-family);
            margin: 0;
            padding: 24px;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            width: 100%;
            box-sizing: border-box;
        }

        .container {
            width: 100%;
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            animation: fadeIn 0.4s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .header {
            margin-top: 24px;
            margin-bottom: 32px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 16px;
        }

        .header h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0 0 8px 0;
        }

        .header p {
            opacity: 0.7;
            font-size: 0.9rem;
            margin: 0;
        }

        .rebase-list {
            position: relative;
            padding-left: 50px;
            list-style: none;
            margin: 0;
            flex-grow: 1; /* Allow list to take up available space */
        }

        /* Timeline Line */
        .rebase-list::before {
            content: '';
            position: absolute;
            left: 24px;
            top: 0;
            bottom: 0;
            width: 2px;
            background: linear-gradient(to bottom, transparent, var(--border) 10%, var(--border) 90%, transparent);
            opacity: 0.8;
        }

        .commit-item {
            display: flex;
            align-items: center;
            background: var(--item-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            margin-bottom: 16px;
            padding: 12px 16px;
            position: relative;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: default;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .commit-item:hover {
            border-color: var(--accent);
            background: var(--hover-bg);
            transform: scale(1.01);
            box-shadow: 0 4px 12px rgba(0,122,204,0.15);
        }

        /* Timeline Node (Circle) */
        .commit-item::before {
            content: '';
            position: absolute;
            left: -32px;
            top: 50%;
            transform: translateY(-50%);
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: var(--bg);
            border: 3px solid var(--border);
            z-index: 1;
            transition: all 0.2s ease;
        }

        .commit-item:hover::before {
            border-color: var(--accent);
            background: var(--accent);
        }

        .commit-item.sortable-ghost {
            opacity: 0.3;
            background: var(--accent);
        }

        .drag-handle {
            cursor: grab;
            margin-right: 16px;
            opacity: 0.4;
            display: flex;
            align-items: center;
            transition: opacity 0.2s;
        }

        .commit-item:hover .drag-handle {
            opacity: 0.8;
        }

        .action-select {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 6px 12px;
            margin-right: 16px;
            font-size: 0.85rem;
            cursor: pointer;
            min-width: 100px;
            outline: none;
            transition: border-color 0.2s;
        }

        .action-select:focus {
            border-color: var(--accent);
        }

        .commit-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .commit-msg {
            font-size: 0.95rem;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2px;
        }

        .commit-meta {
            display: flex;
            gap: 12px;
            font-size: 0.75rem;
            font-family: var(--font-mono);
            opacity: 0.6;
        }

        .commit-hash {
            color: var(--accent);
        }

        .footer {
            margin-top: auto; /* Push to bottom */
            display: flex;
            justify-content: flex-end;
            gap: 16px;
            border-top: 1px solid var(--border);
            padding: 24px 0;
            position: sticky;
            bottom: 0;
            background: var(--bg);
            z-index: 10;
        }

        button {
            padding: 10px 24px;
            border-radius: 6px;
            border: 1px solid transparent;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.95rem;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-ghost {
            background: transparent;
            color: var(--fg);
            border-color: var(--border);
        }

        .btn-ghost:hover {
            background: var(--hover-bg);
        }

        .btn-danger-ghost {
            background: transparent;
            color: var(--danger);
            border-color: rgba(229, 20, 0, 0.2);
        }

        .btn-danger-ghost:hover {
            background: var(--danger);
            color: #ffffff; /* Fix: ensure text is readable on red background */
            border-color: var(--danger);
        }

        /* Sortable styles */
        .sortable-drag {
            opacity: 0;
        }

        /* Actions colors */
        .action-select option[value="pick"] { color: var(--fg); }
        .action-select option[value="reword"] { color: #ce9178; }
        .action-select option[value="edit"] { color: #569cd6; }
        .action-select option[value="squash"] { color: #b5cea8; }
        .action-select option[value="fixup"] { color: #4ec9b0; }
        .action-select option[value="drop"] { color: var(--danger); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Interactive Rebase</h1>
            <p>Drag to reorder commits and choose actions for history rewriting.</p>
        </div>

        <ul id="rebaseList" class="rebase-list">
            <!-- Items injected by JavaScript -->
        </ul>

        <div class="footer">
            <button class="btn-danger-ghost" onclick="abort()">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM5.854 5.146l2.146 2.147 2.146-2.147a.5.5 0 1 1 .708.708L8.707 8l2.147 2.146a.5.5 0 0 1-.708.708L8 8.707l-2.146 2.147a.5.5 0 0 1-.708-.708L7.293 8 5.146 5.854a.5.5 0 0 1 .708-.708z"/>
                </svg>
                Abort Rebase
            </button>
            <button class="btn-primary" onclick="startRebase()">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M10.854 7L15 2.854V7h-1V4.561l-3.646 3.646-.707-.707L13.293 3.854H10.854v-1h4.5a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-1 0V7.854L10.854 11.5l3.646 3.646V12h1v4.5a.5.5 0 0 1-.5.5h-4.5v-1h2.44l-3.646-3.646-.707.707L12.146 16.707V19.146h1V15z" />
                </svg>
                Commence Rebase
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let commits = ${commitsJson};

        const listElement = document.getElementById('rebaseList');

        function renderCommits() {
            listElement.innerHTML = '';
            commits.forEach((commit, index) => {
                const li = document.createElement('li');
                li.className = 'commit-item';
                li.dataset.index = index;

                li.innerHTML = \`
                    <div class="drag-handle">
                        <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
                            <circle cx="2" cy="3" r="1.5" />
                            <circle cx="2" cy="9" r="1.5" />
                            <circle cx="2" cy="15" r="1.5" />
                            <circle cx="10" cy="3" r="1.5" />
                            <circle cx="10" cy="9" r="1.5" />
                            <circle cx="10" cy="15" r="1.5" />
                        </svg>
                    </div>
                    <select class="action-select" onchange="updateAction(\${index}, this.value)">
                        <option value="pick" \${commit.action === 'pick' ? 'selected' : ''}>pick</option>
                        <option value="reword" \${commit.action === 'reword' ? 'selected' : ''}>reword</option>
                        <option value="edit" \${commit.action === 'edit' ? 'selected' : ''}>edit</option>
                        <option value="squash" \${commit.action === 'squash' ? 'selected' : ''}>squash</option>
                        <option value="fixup" \${commit.action === 'fixup' ? 'selected' : ''}>fixup</option>
                        <option value="drop" \${commit.action === 'drop' ? 'selected' : ''}>drop</option>
                    </select>
                    <div class="commit-content">
                        <span class="commit-msg">\${commit.message}</span>
                        <div class="commit-meta">
                            <span class="commit-hash">\${commit.hash.substring(0, 7)}</span>
                            <span class="commit-author">\${commit.author_name}</span>
                            <span class="commit-date">\${commit.date}</span>
                        </div>
                    </div>
                \`;
                listElement.appendChild(li);
            });
        }

        function updateAction(index, action) {
            commits[index].action = action;
        }

        function startRebase() {
            vscode.postMessage({
                type: 'rebase',
                commits: commits
            });
        }

        function abort() {
            vscode.postMessage({
                type: 'abort'
            });
        }

        // Initialize SortableJS
        new Sortable(listElement, {
            animation: 300,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            onEnd: function (evt) {
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;
                if (oldIndex === newIndex) return;

                const movedItem = commits.splice(oldIndex, 1)[0];
                commits.splice(newIndex, 0, movedItem);

                // Update indices on the select elements silently
                const items = listElement.querySelectorAll('.commit-item');
                items.forEach((item, idx) => {
                    item.dataset.index = idx;
                    const select = item.querySelector('.action-select');
                    select.onchange = () => updateAction(idx, select.value);
                });
            }
        });

        renderCommits();
    </script>
</body>
</html>`;
  }
}
