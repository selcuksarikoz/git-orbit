import * as vscode from "vscode";
import { GitService } from "../services/GitService";

export class CommitDetailView {
  public static readonly viewType = "gitorbit.commitDetail";
  private static panel: vscode.WebviewPanel | undefined;

  public static async show(
    context: vscode.ExtensionContext,
    commitHash: string,
    message: string,
    files: { path: string; status: string }[]
  ) {
    const title = `${commitHash.substring(0, 7)} - ${message} (${
      files.length
    } files)`;

    if (CommitDetailView.panel) {
      CommitDetailView.panel.reveal();
      CommitDetailView.panel.title = title;
      CommitDetailView.panel.webview.postMessage({
        command: "update",
        commitHash,
        message,
        files,
      });
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      CommitDetailView.viewType,
      title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    CommitDetailView.panel = panel;

    panel.webview.html = this.getHtmlContent(files, commitHash, message);

    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "getDiff":
            try {
              const diff = await GitService.getInstance().getDiff(
                commitHash,
                message.path,
                true
              );
              panel.webview.postMessage({
                command: "setDiff",
                path: message.path,
                diff: diff,
              });
            } catch (error: any) {
              vscode.window.showErrorMessage(
                `Failed to load diff: ${error.message}`
              );
            }
            break;
          case "openFile":
            const uri = vscode.Uri.file(
              vscode.workspace.workspaceFolders![0].uri.fsPath +
                "/" +
                message.path
            );
            vscode.commands.executeCommand("vscode.open", uri);
            break;
        }
      },
      null,
      context.subscriptions
    );

    panel.onDidDispose(() => {
      CommitDetailView.panel = undefined;
    });
  }

  private static getHtmlContent(
    files: { path: string; status: string }[],
    commitHash: string,
    message: string
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Commit Details</title>
    <style>
        :root {
            --background: var(--vscode-editor-background);
            --foreground: var(--vscode-editor-foreground);
            --hover: var(--vscode-list-hoverBackground);
            --border: var(--vscode-panel-border);
            --highlight: var(--vscode-list-activeSelectionBackground);
            --text-highlight: var(--vscode-list-activeSelectionForeground);
            --added: var(--vscode-gitDecoration-addedResourceForeground);
            --modified: var(--vscode-gitDecoration-modifiedResourceForeground);
            --deleted: var(--vscode-gitDecoration-deletedResourceForeground);
            --font-family: var(--vscode-font-family);
        }
        body {
            background-color: var(--background);
            color: var(--foreground);
            font-family: var(--font-family);
            padding: 0;
            margin: 0;
        }
        .header {
            padding: 10px 20px;
            border-bottom: 1px solid var(--border);
            background: var(--vscode-editor-group-header-tabsBackground);
        }
        .header h2 {
            margin: 0;
            font-size: 1.1em;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .commit-hash {
            font-family: monospace;
            background: var(--hover);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.9em;
        }
        .file-list {
            display: flex;
            flex-direction: column;
        }
        .file-item {
            border-bottom: 1px solid var(--border);
        }
        .file-header {
            display: flex;
            align-items: center;
            padding: 8px 16px;
            cursor: pointer;
            user-select: none;
            transition: background 0.1s;
        }
        .file-header:hover {
            background-color: var(--hover);
        }
        .file-icon {
            width: 16px;
            display: inline-block;
            text-align: center;
            margin-right: 8px;
            font-weight: bold;
            transition: transform 0.2s;
        }
        .file-item.expanded .file-icon {
            transform: rotate(90deg);
        }
        .file-info {
            flex: 1;
            display: flex;
            align-items: baseline;
            overflow: hidden;
            white-space: nowrap;
        }
        .file-name {
            font-weight: 600;
            margin-right: 8px;
        }
        .file-path {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .file-status {
            margin-left: auto;
            font-size: 0.8em;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .status-M { color: var(--modified); }
        .status-A { color: var(--added); }
        .status-D { color: var(--deleted); }
        
        .diff-container {
            display: none;
            background: var(--vscode-textBlockQuote-background);
            padding: 10px;
            overflow-x: auto;
            border-top: 1px solid var(--border);
        }
        .file-item.expanded .diff-container {
            display: block;
        }
        pre {
            margin: 0;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            white-space: pre-wrap;
        }
        .diff-line {
            display: block;
        }
        .diff-add { color: var(--added); background: rgba(0,255,0,0.05); }
        .diff-del { color: var(--deleted); background: rgba(255,0,0,0.05); }
        .diff-header { color: var(--vscode-textPreformat-foreground); opacity: 0.7; }

        .actions {
            margin-left: 10px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .file-header:hover .actions {
            opacity: 1;
        }
        .btn-icon {
            background: transparent;
            border: none;
            color: var(--foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
        }
        .btn-icon:hover {
            background: var(--hover);
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>
            <span class="commit-hash">${commitHash.substring(0, 7)}</span>
            <span>${message}</span>
        </h2>
    </div>
    <div class="file-list" id="fileList">
        ${files.map((f) => renderFileItem(f)).join("")}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const fileList = document.getElementById('fileList');
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch(message.command) {
                case 'setDiff':
                    const container = document.getElementById('diff-' + message.path.replace(/[^a-zA-Z0-9]/g, '_'));
                    if(container) {
                        container.innerHTML = formatDiff(message.diff);
                    }
                    break;
                case 'update':
                    // Refresh logic if needed, for now we just reload
                    break;
            }
        });

        function formatDiff(diffText) {
            if (!diffText) return '<pre>No changes or binary file.</pre>';
            
            const lines = diffText.split('\\n');
            let html = '<pre>';
            lines.forEach(line => {
                let cls = 'diff-line ';
                if (line.startsWith('+') && !line.startsWith('+++')) cls += 'diff-add';
                else if (line.startsWith('-') && !line.startsWith('---')) cls += 'diff-del';
                else if (line.startsWith('diff') || line.startsWith('index')) cls += 'diff-header';
                
                html += \`<span class="\${cls}">\${escapeHtml(line)}</span>\\n\`;
            });
            html += '</pre>';
            return html;
        }

        function escapeHtml(text) {
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        // Delegate click events
        fileList.addEventListener('click', (e) => {
            const header = e.target.closest('.file-header');
            if (header && !e.target.closest('.actions')) {
                const item = header.parentElement;
                const path = item.dataset.path;
                item.classList.toggle('expanded');
                
                if (item.classList.contains('expanded')) {
                    // Check if diff is already loaded
                    const container = item.querySelector('.diff-container');
                    if (container.innerHTML.trim() === 'Loading...') {
                        vscode.postMessage({ command: 'getDiff', path: path });
                    }
                }
            }
            
            if (e.target.closest('.open-file-btn')) {
                const path = e.target.closest('.file-item').dataset.path;
                 vscode.postMessage({ command: 'openFile', path: path });
                 e.stopPropagation();
            }
        });
    </script>
</body>
</html>`;
  }
}

function renderFileItem(file: { path: string; status: string }) {
  const parts = file.path.split(/[\\/]/);
  const fileName = parts.pop();
  const dirPath = parts.join("/");
  const safeId = file.path.replace(/[^a-zA-Z0-9]/g, "_");

  return `
    <div class="file-item" data-path="${file.path}">
        <div class="file-header">
            <span class="file-icon">▶</span>
            <div class="file-info">
                <span class="file-name">${fileName}</span>
                <span class="file-path">${dirPath}</span>
            </div>
            <div class="actions">
                <button class="btn-icon open-file-btn" title="Open File">➚</button>
            </div>
            <span class="file-status status-${file.status}">${file.status}</span>
        </div>
        <div class="diff-container" id="diff-${safeId}">Loading...</div>
    </div>
    `;
}
