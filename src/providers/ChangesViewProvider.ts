import * as vscode from "vscode";
import { GitService } from "../services/GitService";
import { GitContentProvider } from "./GitContentProvider";

export class ChangesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gitorbit.views.changes";
  private _view?: vscode.WebviewView;
  private _lastData?: any;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Watch for git status changes
    let refreshTimer: NodeJS.Timeout | undefined;
    const debouncedRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        GitService.getInstance().clearCache();
        this.refresh();
      }, 300);
    };

    const watcher = vscode.workspace.createFileSystemWatcher("**/.git/index");
    watcher.onDidChange(debouncedRefresh);
    watcher.onDidCreate(debouncedRefresh);
    watcher.onDidDelete(debouncedRefresh);

    const fileWatcher =
      vscode.workspace.onDidSaveTextDocument(debouncedRefresh);
    const configWatcher =
      vscode.workspace.onDidChangeConfiguration(debouncedRefresh);

    webviewView.onDidDispose(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      watcher.dispose();
      fileWatcher.dispose();
      configWatcher.dispose();
    });

    webviewView.webview.onDidReceiveMessage(async (data) => {
      const gitService = GitService.getInstance();

      switch (data.type) {
        case "ready":
          if (this._lastData) {
            this._view?.webview.postMessage(this._lastData);
          }
          this.refresh();
          break;
        case "commit":
          await this._handleCommit(data.message, data.amend);
          break;
        case "push":
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Pushing...",
            },
            async () => {
              await this._handlePush();
            }
          );
          break;
        case "sync":
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Syncing...",
            },
            async () => {
              await this._handleSync();
            }
          );
          break;
        case "stage":
          await gitService.stage(data.path);
          this.refresh();
          break;
        case "unstage":
          await gitService.unstage(data.path);
          this.refresh();
          break;
        case "stageAll":
          await gitService.stageAll();
          this.refresh();
          break;
        case "unstageAll":
          await gitService.unstageAll();
          this.refresh();
          break;
        case "openDiff":
          this._handleOpenDiff(data.path, data.isStaged);
          break;
      }
    });
  }

  private async _handleOpenDiff(relativePath: string, isStaged: boolean) {
    const gitService = GitService.getInstance();
    const rootPath = gitService.rootDir;
    const uri = vscode.Uri.file(
      vscode.Uri.joinPath(vscode.Uri.file(rootPath), relativePath).fsPath
    );

    try {
      if (isStaged) {
        // HEAD vs INDEX
        const headUri = GitContentProvider.getUri("HEAD", relativePath);
        const indexUri = GitContentProvider.getUri("INDEX", relativePath);
        await vscode.commands.executeCommand(
          "vscode.diff",
          headUri,
          indexUri,
          `${relativePath} (Staged)`
        );
      } else {
        // INDEX vs Working Tree
        const indexUri = GitContentProvider.getUri("INDEX", relativePath);
        await vscode.commands.executeCommand(
          "vscode.diff",
          indexUri,
          uri,
          `${relativePath} (Changes)`
        );
      }
    } catch (e) {
      vscode.window.showErrorMessage("Could not open diff: " + e);
    }
  }

  public async refresh() {
    if (!this._view) return;

    const gitService = GitService.getInstance();
    const branches = await gitService.getBranches();
    const status = await gitService.getStatus();

    const staged = status.filter(
      (s) => s.stagedStatus !== " " && s.stagedStatus !== "?"
    );
    const unstaged = status.filter(
      (s) => s.workingTreeStatus !== " " || s.stagedStatus === "?"
    );

    this._lastData = {
      type: "update",
      branch: branches.current,
      staged,
      unstaged,
    };

    this._view.webview.postMessage(this._lastData);
  }

  private async _handleCommit(message: string, amend: boolean) {
    const gitService = GitService.getInstance();
    const status = await gitService.getStatus();
    const staged = status.filter(
      (s) => s.stagedStatus !== " " && s.stagedStatus !== "?"
    );

    // If no staged changes, stage all automatically if there are unstaged changes
    if (staged.length === 0 && !amend) {
      const unstaged = status.filter(
        (s) => s.workingTreeStatus !== " " || s.stagedStatus === "?"
      );
      if (unstaged.length > 0) {
        await gitService.stageAll();
        // After staging everything, we proceed to commit and push
        try {
          const options = message ? ["-m", message] : [];
          await gitService.commit(options);
          await gitService.push(); // Direct push as requested
          vscode.window.showInformationMessage(
            "Auto-staged, committed and pushed!"
          );
          this.refresh();
          vscode.commands.executeCommand("gitorbit.refreshViews");
          return;
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Auto-commit/push failed: ${error.message}`
          );
          return;
        }
      }
    }

    if (!message && !amend) {
      vscode.window.showErrorMessage("Please enter a commit message.");
      return;
    }

    try {
      const options = message ? ["-m", message] : [];
      if (amend) options.push("--amend");

      await gitService.commit(options);
      vscode.window.showInformationMessage("Commit successful!");
      this.refresh();
      vscode.commands.executeCommand("gitorbit.refreshViews");
    } catch (error: any) {
      vscode.window.showErrorMessage(error.message);
    }
  }

  private async _handlePush() {
    try {
      await GitService.getInstance().push();
      vscode.window.showInformationMessage("Push successful!");
      this.refresh();
    } catch (error: any) {
      vscode.window.showErrorMessage(`Push failed: ${error.message}`);
    }
  }

  private async _handleSync() {
    try {
      await GitService.getInstance().pull();
      await GitService.getInstance().push();
      vscode.window.showInformationMessage("Sync successful!");
      this.refresh();
    } catch (error: any) {
      vscode.window.showErrorMessage(`Sync failed: ${error.message}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --vscode-button-background: #007acc;
            --vscode-button-hoverBackground: #0062a3;
            --vscode-input-background: #2D2D2D;
            --vscode-input-foreground: #CCCCCC;
            --vscode-foreground: #CCCCCC;
            --blue-accent: #38bdf8;
            --border-color: #334155;
            --staged-color: #73c991;
            --modified-color: #e2c08d;
            --deleted-color: #f14c4c;
        }
        body {
            padding: 12px;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background: transparent;
            user-select: none;
            margin: 0;
        }
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        .branch-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--blue-accent);
            font-weight: 600;
            font-size: 13px;
        }
        textarea {
            width: 100%;
            background: var(--vscode-input-background);
            border: 1px solid var(--border-color);
            color: var(--vscode-input-foreground);
            padding: 6px 10px;
            border-radius: 4px;
            resize: none;
            font-family: inherit;
            box-sizing: border-box;
            max-height: 44px;
            height: 44px;
            margin-bottom: 8px;
            line-height: 1.4;
            display: block;
        }
        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        .button-group {
            display: flex;
            height: 32px;
            margin-bottom: 12px;
            position: relative;
        }
        .main-button {
            flex: 1;
            background: var(--vscode-button-background);
            color: white;
            border: none;
            border-radius: 4px 0 0 4px;
            cursor: pointer;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: opacity 0.2s;
        }
        .main-button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
        .main-button:disabled {
            opacity: 0.4;
            cursor: default;
        }
        .dropdown-toggle {
            width: 32px;
            background: var(--vscode-button-background);
            border: none;
            border-left: 1px solid rgba(255,255,255,0.1);
            border-radius: 0 4px 4px 0;
            cursor: pointer;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .dropdown-toggle:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
        .dropdown-toggle:disabled {
            opacity: 0.4;
            cursor: default;
        }

        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 0;
            margin-top: 12px;
            border-bottom: 1px solid var(--border-color);
        }
        .section-title {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.6;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .badge {
            background: #334155;
            padding: 1px 6px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: bold;
        }
        .action-icon {
            opacity: 0.5;
            cursor: pointer;
            padding: 2px;
            display: flex;
            align-items: center;
        }
        .action-icon:hover {
            opacity: 1;
            color: var(--blue-accent);
        }
        .file-list {
            margin-bottom: 4px;
        }
        .file-item {
            display: flex;
            align-items: center;
            padding: 6px 0;
            gap: 8px;
            cursor: pointer;
            border-radius: 4px;
        }
        .file-item:hover {
            background: rgba(255,255,255,0.06);
        }
        .file-item:hover .file-actions {
            display: flex;
        }
        .file-status {
            width: 16px;
            height: 16px;
            font-size: 10px;
            font-weight: 900;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 2px;
        }
        .status-M { color: var(--modified-color); }
        .status-A { color: var(--staged-color); }
        .status-D { color: var(--deleted-color); }
        .status-U { color: #cca700; }
        .status-S { color: var(--staged-color); border: 1px solid rgba(115, 201, 145, 0.3); }

        .file-info {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .file-name {
            font-size: 12.5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .file-path {
            font-size: 10px;
            opacity: 0.4;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .file-actions {
            display: none;
            gap: 6px;
            margin-right: 4px;
        }
        .dropdown-content {
            display: none;
            position: absolute;
            right: 0;
            top: 34px;
            background: #252526;
            min-width: 170px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            z-index: 1000;
            border-radius: 4px;
            border: 1px solid #454545;
            padding: 4px 0;
        }
        .dropdown-content div {
            padding: 10px 16px;
            cursor: pointer;
            font-size: 12.5px;
        }
        .dropdown-content div:hover {
            background: #094771;
            color: white;
        }
        .show { display: block; }
        .empty-state {
            opacity: 0.4;
            font-size: 12px;
            text-align: center;
            margin-top: 40px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="branch-badge">
            <span id="branch-text">loading...</span>
        </div>
    </div>

    <textarea id="commit-message" placeholder="Message (Cmd+Enter to commit)"></textarea>

    <div class="button-group">
        <button class="main-button" id="commit-btn" onclick="commit()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
            Commit
        </button>
        <button class="dropdown-toggle" id="dropdown-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.646 11.854a.5.5 0 0 0 .708 0l6-6a.5.5 0 0 0-.708-.708L8 10.793 2.354 5.146a.5.5 0 1 0-.708.708l6 6z"/></svg>
        </button>
        <div class="dropdown-content" id="dropdown-menu">
            <div onclick="commit()">Commit</div>
            <div onclick="commit(true)">Commit (Amend)</div>
            <hr style="border: 0; border-top: 1px solid #454545; margin: 4px 0;">
            <div onclick="push()">Commit & Push</div>
            <div onclick="sync()">Commit & Sync</div>
        </div>
    </div>

    <div id="staged-section" style="display:none">
        <div class="section-header">
            <span class="section-title">Staged Changes <span id="staged-count" class="badge">0</span></span>
            <div class="action-icon" title="Unstage All" onclick="unstageAll()">
                 <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 8a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"/></svg>
            </div>
        </div>
        <div class="file-list" id="staged-list"></div>
    </div>

    <div id="unstaged-section" style="display:none">
        <div class="section-header">
            <span class="section-title">Changes <span id="unstaged-count" class="badge">0</span></span>
            <div class="action-icon" title="Stage All" onclick="stageAll()">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
            </div>
        </div>
        <div class="file-list" id="unstaged-list"></div>
    </div>

    <div id="empty-state" class="empty-state">Scan repo for changes...</div>

    <script>
        const vscode = acquireVsCodeApi();
        const messageInput = document.getElementById('commit-message');
        const dropdownBtn = document.getElementById('dropdown-btn');
        const dropdownMenu = document.getElementById('dropdown-menu');
        const commitBtn = document.getElementById('commit-btn');

        // Signal ready to receive cached data
        vscode.postMessage({ type: 'ready' });

        dropdownBtn.onclick = (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        };

        window.onclick = () => dropdownMenu.classList.remove('show');

        messageInput.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                if (!commitBtn.disabled) commit();
            }
        });

        function commit(amend = false) {
            vscode.postMessage({ type: 'commit', message: messageInput.value, amend });
            if (!amend) messageInput.value = '';
        }
        function push() { vscode.postMessage({ type: 'push' }); }
        function sync() { vscode.postMessage({ type: 'sync' }); }
        function stageAll() { vscode.postMessage({ type: 'stageAll' }); }
        function unstageAll() { vscode.postMessage({ type: 'unstageAll' }); }

        function createFileItem(file, isStaged) {
            const div = document.createElement('div');
            div.className = 'file-item';
            
            const status = isStaged ? file.stagedStatus : file.workingTreeStatus;
            const statusChar = status !== ' ' ? status : (isStaged ? 'S' : '?');
            
            const fileName = file.path.split('/').pop();
            const filePath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '~';
            
            div.innerHTML = \`
                <span class="file-status status-\${isStaged ? 'S' : statusChar}">\${statusChar}</span>
                <div class="file-info">
                    <span class="file-name">\${fileName}</span>
                    <span class="file-path">\${filePath}</span>
                </div>
                <div class="file-actions">
                    <div class="action-icon" title="\${isStaged ? 'Unstage' : 'Stage'}" onclick="event.stopPropagation();\${isStaged ? 'unstage' : 'stage'}('\${file.path}')">
                        \${isStaged ? 
                            '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 8a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"/></svg>' : 
                            '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>'
                        }
                    </div>
                </div>
            \`;
            
            div.onclick = () => vscode.postMessage({ type: 'openDiff', path: file.path, isStaged });
            return div;
        }

        window.stage = (path) => vscode.postMessage({ type: 'stage', path });
        window.unstage = (path) => vscode.postMessage({ type: 'unstage', path });

        window.addEventListener('message', event => {
            const data = event.data;
            if (data.type === 'update') {
                document.getElementById('branch-text').textContent = data.branch;
                
                const stagedList = document.getElementById('staged-list');
                const unstagedList = document.getElementById('unstaged-list');
                stagedList.innerHTML = '';
                unstagedList.innerHTML = '';

                data.staged.forEach(f => stagedList.appendChild(createFileItem(f, true)));
                data.unstaged.forEach(f => unstagedList.appendChild(createFileItem(f, false)));

                const hasStaged = data.staged.length > 0;
                const hasUnstaged = data.unstaged.length > 0;

                document.getElementById('staged-section').style.display = hasStaged ? 'block' : 'none';
                document.getElementById('unstaged-section').style.display = hasUnstaged ? 'block' : 'none';
                document.getElementById('staged-count').textContent = data.staged.length;
                document.getElementById('unstaged-count').textContent = data.unstaged.length;
                
                commitBtn.disabled = !(hasStaged || hasUnstaged);
                dropdownBtn.disabled = !(hasStaged || hasUnstaged);

                const hasChanges = (hasStaged || hasUnstaged);
                document.getElementById('empty-state').style.display = hasChanges ? 'none' : 'block';
                if (!hasChanges) {
                    document.getElementById('empty-state').textContent = 'No changes detected';
                }
            }
        });
    </script>
</body>
</html>`;
  }
}
