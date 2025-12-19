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
              // Get Diff between Parent and Commit (Hash^..Hash)
              const diff = await GitService.getInstance().getDiff(
                commitHash,
                message.path,
                true // compareWithParent
              );
              panel.webview.postMessage({
                command: "setDiff",
                path: message.path,
                pathId: message.pathId,
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
            --border: var(--vscode-sideBarSectionHeader-border);
            --hover: var(--vscode-list-hoverBackground);
            --header-bg: var(--vscode-editor-group-header-tabsBackground);
            --added-bg: rgba(63, 185, 80, 0.2);
            --deleted-bg: rgba(248, 81, 73, 0.2);
            --line-num-fg: var(--vscode-editorLineNumber-foreground);
        }
        body {
            background-color: var(--background);
            color: var(--foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            padding: 0;
            margin: 0;
        }
        .header {
            padding: 12px 20px;
            background: var(--header-bg);
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 12px;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .commit-hash {
            font-family: 'SF Mono', Monaco, Menlo, Courier, monospace;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.9em;
        }
        .commit-msg {
            font-weight: 500;
            font-size: 1.1em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .file-list {
            padding: 10px;
        }
        .file-item {
            margin-bottom: 8px;
            border: 1px solid var(--border);
            border-radius: 6px;
            background: var(--vscode-sideBar-background);
            overflow: hidden;
        }
        .file-header {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            cursor: pointer;
            background: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid transparent;
            transition: all 0.2s;
        }
        .file-item.expanded .file-header {
            border-bottom-color: var(--border);
        }
        .file-header:hover {
            background: var(--hover);
        }
        .chevron {
            margin-right: 8px;
            transition: transform 0.2s;
            opacity: 0.7;
        }
        .file-item.expanded .chevron {
            transform: rotate(90deg);
        }
        .file-info {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 8px;
            overflow: hidden;
        }
        .file-path {
            opacity: 0.8;
            font-size: 0.9em;
        }
        .file-name {
            font-weight: 600;
        }
        .status-badge {
            font-size: 0.75em;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .status-M { color: #e2c08d; border: 1px solid #e2c08d; }
        .status-A { color: #73c991; border: 1px solid #73c991; }
        .status-D { color: #f14c4c; border: 1px solid #f14c4c; }
        
        .btn-icon {
            background: none;
            border: none;
            color: var(--foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            margin-left: 10px;
            display: none;
        }
        .file-header:hover .btn-icon {
            display: inline-block;
        }
        .btn-icon:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        /* Diff Table Styles */
        .diff-container {
            display: none;
            overflow-x: auto;
            background: var(--background);
            border-top: 1px solid var(--border);
        }
        .file-item.expanded .diff-container {
            display: block;
        }
        .diff-table {
            width: 100%;
            border-collapse: collapse;
            font-family: 'SF Mono', Monaco, Menlo, Courier, monospace;
            font-size: 0.9em;
            table-layout: fixed;
        }
        .diff-table td {
            padding: 0 4px;
            vertical-align: top;
            white-space: pre-wrap;
            word-break: break-all;
            height: 1.5em; /* Ensure empty lines have height */
        }
        .line-num {
            width: 40px;
            text-align: right;
            padding-right: 8px;
            color: var(--line-num-fg);
            user-select: none;
            border-right: 1px solid var(--border);
            opacity: 0.6;
        }
        .diff-content {
            padding-left: 8px;
            width: 100%;
        }
        .line-add { background-color: var(--added-bg); }
        .line-del { background-color: var(--deleted-bg); }
        .empty-diff {
            padding: 20px;
            text-align: center;
            opacity: 0.7;
        }
        
        /* Syntax Colors (Basic) */
        .kwd { color: #569cd6; } 
        .str { color: #ce9178; } 
        .com { color: #6a9955; } 
        .num { color: #b5cea8; } 
    </style>
</head>
<body>
    <div class="header">
        <span class="commit-hash">${commitHash.substring(0, 7)}</span>
        <span class="commit-msg" title="${message}">${message}</span>
        <span style="margin-left: auto; opacity: 0.7;">${
          files.length
        } files changed</span>
    </div>
    
    <div class="file-list" id="fileList">
        ${files.map((f) => renderFileItem(f)).join("")}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const fileList = document.getElementById('fileList');

        window.addEventListener('message', event => {
            const msg = event.data;
            switch(msg.command) {
                case 'setDiff':
                    const container = document.getElementById('diff-' + msg.pathId);
                    if(container) {
                        try {
                            container.innerHTML = renderDiffTable(msg.diff);
                        } catch(e) {
                            container.innerHTML = '<div class="empty-diff">Error rendering diff</div>';
                        }
                    }
                    break;
            }
        });

        fileList.addEventListener('click', (e) => {
            // Open File Button
            const openBtn = e.target.closest('.btn-icon');
            if (openBtn) {
                const path = openBtn.dataset.path;
                vscode.postMessage({ command: 'openFile', path });
                e.stopPropagation();
                return;
            }

            // Expand/Collapse header
            const header = e.target.closest('.file-header');
            if (header) {
                const item = header.parentElement;
                const path = item.dataset.path;
                const pathId = item.dataset.pathId;
                
                item.classList.toggle('expanded');
                
                if (item.classList.contains('expanded')) {
                    const container = item.querySelector('.diff-container');
                    if (container.innerHTML.trim() === 'Loading...') {
                        vscode.postMessage({ command: 'getDiff', path, pathId });
                    }
                }
            }
        });

        // Simple Diff Parser & Renderer
        function renderDiffTable(diffText) {
            if (!diffText || diffText.trim().length === 0) {
                return '<div class="empty-diff">Binary file or no text changes found.</div>';
            }

            const lines = diffText.split('\\n');
            let html = '<table class="diff-table">';
            
            let oldLine = 0; 
            let newLine = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // Skip git headers
                if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
                    continue;
                }

                // Hunk header
                if (line.startsWith('@@')) {
                    const match = line.match(/@@ -(\\d+),?\\d* \\+(\\d+),?\\d* @@/);
                    if (match) {
                        oldLine = parseInt(match[1]) - 1;
                        newLine = parseInt(match[2]) - 1;
                    }
                    html += \`<tr><td class="line-num">...</td><td class="line-num">...</td><td class="diff-content" style="opacity:0.5; background:var(--vscode-peekViewEditor-background)">\${escapeHtml(line)}</td></tr>\`;
                    continue;
                }

                let type = ' ';
                if (line.startsWith('+')) type = '+';
                else if (line.startsWith('-')) type = '-';
                
                let contentClass = '';
                let oNum = '';
                let nNum = '';
                
                if (type === '+') {
                    newLine++;
                    nNum = newLine;
                    contentClass = 'line-add';
                } else if (type === '-') {
                    oldLine++;
                    oNum = oldLine;
                    contentClass = 'line-del';
                } else {
                    oldLine++;
                    newLine++;
                    oNum = oldLine;
                    nNum = newLine;
                }

                // Basic syntax highlighting
                const content = escapeHtml(line.substring(1))
                    .replace(/(\\b(import|export|const|let|var|function|class|return|if|else|for|while|switch)\\b)/g, '<span class="kwd">$1</span>')
                    .replace(/('.*?'|".*?")/g, '<span class="str">$1</span>')
                    .replace(/(\\b\\d+\\b)/g, '<span class="num">$1</span>')
                    .replace(/(\\/\\/.*$)/g, '<span class="com">$1</span>');

                html += \`<tr class="\${contentClass}">
                    <td class="line-num">\${oNum}</td>
                    <td class="line-num">\${nNum}</td>
                    <td class="diff-content">\${content || ' '}</td>
                </tr>\`;
            }
            html += '</table>';
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
    <div class="file-item" data-path="${file.path}" data-path-id="${safeId}">
        <div class="file-header">
            <span class="chevron">▶</span>
            <div class="file-info">
                <span class="file-name">${fileName}</span>
                <span class="file-path">${dirPath}</span>
            </div>
            <span class="status-badge status-${file.status}">${file.status}</span>
            <button class="btn-icon" data-path="${file.path}" title="Open File">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1H6l.7.7h6.8l.5.5v11.6l-.5.5H1.5l-.5-.5V1.5l.5-.5zM2 2v11h11V3H7.5l-.7-.7H2z"/></svg>
            </button>
        </div>
        <div class="diff-container" id="diff-${safeId}">Loading...</div>
    </div>
    `;
}
