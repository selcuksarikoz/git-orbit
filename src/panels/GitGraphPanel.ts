import * as vscode from 'vscode';
import { GitService } from '../services/GitService';
import { escapeHtml } from '../utils/HtmlUtils';

interface BranchInfo {
  name: string;
  isRemote: boolean;
  current: boolean;
  upstream?: string;
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: Date;
  parents: string[];
  files?: FileChange[];
}

interface FileChange {
  path: string;
  status: string;
  diff?: string;
}

export class GitGraphPanel {
  public static currentPanel: GitGraphPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private gitService: GitService;

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.ViewColumn.One;

    if (GitGraphPanel.currentPanel) {
      GitGraphPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel('gitOrbitGraph', 'Git Graph', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri],
    });

    GitGraphPanel.currentPanel = new GitGraphPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this.gitService = GitService.getInstance();

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'ready':
            await this.loadBranches();
            break;
          case 'loadBranch':
            await this.loadBranchCommits(message.branch);
            break;
          case 'commitClick':
            await this.handleCommitClick(message.hash);
            break;
          case 'fileClick':
            await this.handleFileClick(message.hash, message.filePath);
            break;
          case 'loadFileDiff':
            await this.loadFileDiff(message.hash, message.filePath);
            break;
          case 'toggleCommit':
            await this.handleToggleCommit(message.hash);
            break;
          case 'pull':
            await this.handlePull(message.branch);
            break;
          case 'push':
            await this.handlePush(message.branch);
            break;
          case 'sync':
            await this.handleSync(message.branch);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async loadBranches() {
    try {
      await this.gitService.ensureInitialized();
      const repo = this.gitService.getDefaultRepository();

      if (!repo) {
        throw new Error('No repository found');
      }

      const result = await repo.executor.exec(['branch', '-a', '-v']);
      const branches: BranchInfo[] = [];

      result.stdout.split('\n').forEach((line) => {
        if (!line.trim()) return;

        const current = line.startsWith('*');
        const cleanLine = line.substring(2).trim();
        const parts = cleanLine.split(/\s+/);
        const name = parts[0];

        if (name.startsWith('remotes/')) {
          branches.push({
            name: name.replace('remotes/', ''),
            isRemote: true,
            current: false,
          });
        } else {
          branches.push({
            name,
            isRemote: false,
            current,
          });
        }
      });

      this._panel.webview.postMessage({
        command: 'updateBranches',
        branches,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load branches: ${error}`);
    }
  }

  private async loadBranchCommits(branch: string) {
    try {
      await this.gitService.ensureInitialized();
      const repo = this.gitService.getDefaultRepository();

      if (!repo) {
        throw new Error('No repository found');
      }

      const result = await repo.executor.exec([
        'log',
        branch,
        '--pretty=format:%H|%h|%P|%an|%at|%s',
        '-30',
      ]);

      const commits: CommitInfo[] = [];
      const lines = result.stdout.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.split('|');
        if (parts.length < 6) continue;

        const [hash, shortHash, parents, author, timestamp, ...messageParts] = parts;
        commits.push({
          hash: hash.trim(),
          shortHash: shortHash.trim(),
          message: messageParts.join('|').trim(),
          author: author.trim(),
          date: new Date(parseInt(timestamp) * 1000),
          parents: parents
            ? parents
                .trim()
                .split(' ')
                .filter((p) => p)
            : [],
          files: [],
        });
      }

      // Load files for each commit
      for (const commit of commits) {
        try {
          const filesResult = await repo.executor.exec([
            'diff-tree',
            '--no-commit-id',
            '--name-status',
            '-r',
            commit.hash,
          ]);

          commit.files = filesResult.stdout
            .trim()
            .split('\n')
            .filter((line) => line)
            .map((line) => {
              const parts = line.split(/\s+/);
              return {
                path: parts.slice(1).join(' '),
                status: parts[0],
              };
            });
        } catch {
          commit.files = [];
        }
      }

      this._panel.webview.postMessage({
        command: 'updateCommits',
        commits,
        branch,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load commits: ${error}`);
      this._panel.webview.postMessage({
        command: 'updateCommits',
        commits: [],
        branch,
      });
    }
  }

  private async loadFileDiff(hash: string, filePath: string) {
    try {
      await this.gitService.ensureInitialized();
      const repo = this.gitService.getDefaultRepository();

      if (!repo) return;

      // Get diff for specific file in commit
      const parent = hash + '^';
      const result = await repo.executor.exec(['diff', parent, hash, '--', filePath]);

      this._panel.webview.postMessage({
        command: 'updateFileDiff',
        hash,
        filePath,
        diff: result.stdout,
      });
    } catch (error) {
      // File might be new (no parent diff)
      try {
        await this.gitService.ensureInitialized();
        const repo = this.gitService.getDefaultRepository();
        if (!repo) return;

        const result = await repo.executor.exec(['show', hash, '--', filePath]);

        this._panel.webview.postMessage({
          command: 'updateFileDiff',
          hash,
          filePath,
          diff: result.stdout,
        });
      } catch {
        this._panel.webview.postMessage({
          command: 'updateFileDiff',
          hash,
          filePath,
          diff: 'Could not load diff',
        });
      }
    }
  }

  private async handleCommitClick(hash: string) {
    await vscode.commands.executeCommand('gitorbit.openCommitDiffs', { hash });
  }

  private async handleFileClick(hash: string, filePath: string) {
    await vscode.commands.executeCommand('gitorbit.openCommitDiffs', { hash, filePath });
  }

  private async handleToggleCommit(hash: string) {
    console.log('Toggle commit:', hash);
  }

  private async handlePull(branch: string) {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Pulling ${branch}...`,
          cancellable: false,
        },
        async () => {
          await this.gitService.pull('origin', branch);
        }
      );
      vscode.window.showInformationMessage(`Pulled ${branch}`);
      await this.loadBranchCommits(branch);
    } catch (error) {
      vscode.window.showErrorMessage(`Pull failed: ${error}`);
    }
  }

  private async handlePush(branch: string) {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Pushing ${branch}...`,
          cancellable: false,
        },
        async () => {
          await this.gitService.push('origin', branch);
        }
      );
      vscode.window.showInformationMessage(`Pushed ${branch}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Push failed: ${error}`);
    }
  }

  private async handleSync(branch: string) {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Syncing ${branch}...`,
          cancellable: false,
        },
        async () => {
          await this.gitService.pull('origin', branch);
          await this.gitService.push('origin', branch);
        }
      );
      vscode.window.showInformationMessage(`Synced ${branch}`);
      await this.loadBranchCommits(branch);
    } catch (error) {
      vscode.window.showErrorMessage(`Sync failed: ${error}`);
    }
  }

  public dispose() {
    GitGraphPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Graph</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: 13px;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        #header {
            padding: 12px;
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 12px;
            align-items: center;
        }
        .branch-selector {
            flex: 1;
            display: flex;
            gap: 8px;
            align-items: center;
        }
        select {
            flex: 1;
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 6px 8px;
            border-radius: 3px;
            font-size: 13px;
        }
        .actions {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        #content {
            flex: 1;
            overflow: auto;
        }
        #commitList {
            padding: 0;
            margin: 0;
            list-style: none;
        }
        .commit-item {
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .commit-header {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            transition: background-color 0.1s;
            gap: 8px;
        }
        .commit-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .commit-header.expanded {
            background-color: var(--vscode-list-inactiveSelectionBackground);
        }
        .expand-icon {
            font-size: 10px;
            width: 12px;
            transition: transform 0.2s;
            color: var(--vscode-descriptionForeground);
        }
        .expand-icon.expanded {
            transform: rotate(90deg);
        }
        .commit-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-charts-blue);
            flex-shrink: 0;
        }
        .commit-dot.merge {
            background: var(--vscode-charts-purple);
        }
        .commit-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }
        .commit-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .commit-hash {
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-textLink-foreground);
            font-size: 11px;
            flex-shrink: 0;
        }
        .commit-message {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 500;
        }
        .commit-meta {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .commit-actions {
            display: flex;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .commit-header:hover .commit-actions {
            opacity: 1;
        }
        .commit-actions button {
            padding: 2px 8px;
            font-size: 11px;
        }
        .files-list {
            list-style: none;
            padding: 0;
            margin: 0;
            background: var(--vscode-editor-background);
            border-left: 3px solid var(--vscode-charts-blue);
            margin-left: 32px;
        }
        .file-item {
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .file-header {
            display: flex;
            align-items: center;
            padding: 6px 12px 6px 8px;
            cursor: pointer;
            font-size: 12px;
            gap: 8px;
        }
        .file-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .file-header.expanded {
            background-color: var(--vscode-list-inactiveSelectionBackground);
        }
        .file-expand-icon {
            font-size: 8px;
            color: var(--vscode-descriptionForeground);
            transition: transform 0.2s;
        }
        .file-expand-icon.expanded {
            transform: rotate(90deg);
        }
        .file-status {
            font-size: 10px;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
            font-weight: bold;
            flex-shrink: 0;
        }
        .status-A { background: var(--vscode-charts-green); color: #000; }
        .status-M { background: var(--vscode-charts-yellow); color: #000; }
        .status-D { background: var(--vscode-charts-red); color: #fff; }
        .status-R { background: var(--vscode-charts-blue); color: #fff; }
        .status-default { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
        .file-path {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-family: var(--vscode-editor-font-family);
        }
        .file-actions {
            display: flex;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .file-header:hover .file-actions {
            opacity: 1;
        }
        .file-actions button {
            padding: 2px 6px;
            font-size: 10px;
        }
        .diff-container {
            padding: 0;
            background: var(--vscode-editor-background);
            overflow: auto;
            max-height: 400px;
        }
        .diff-content {
            margin: 0;
            padding: 8px 12px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 1.5;
            white-space: pre;
            overflow-x: auto;
        }
        .diff-line {
            margin: 0;
            padding: 0 4px;
        }
        .diff-add {
            background-color: rgba(35, 134, 54, 0.2);
            color: var(--vscode-gitDecoration-addedResourceForeground);
        }
        .diff-del {
            background-color: rgba(248, 81, 73, 0.2);
            color: var(--vscode-gitDecoration-deletedResourceForeground);
        }
        .diff-header {
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
        .diff-hunk {
            color: var(--vscode-textLink-foreground);
            background-color: var(--vscode-editor-selectionBackground);
        }
        .diff-loading {
            padding: 12px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .loading, .empty {
            padding: 40px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div id="header">
        <div class="branch-selector">
            <label>Branch:</label>
            <select id="branchSelect" onchange="loadBranch()">
                <option value="">Select a branch...</option>
            </select>
        </div>
        <div class="actions">
            <button class="secondary" onclick="pull()" title="Pull">⬇️ Pull</button>
            <button class="secondary" onclick="push()" title="Push">⬆️ Push</button>
            <button onclick="sync()" title="Sync">🔄 Sync</button>
        </div>
    </div>

    <div id="content">
        <div id="loading" class="loading">Loading branches...</div>
        <ul id="commitList"></ul>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const branchSelect = document.getElementById('branchSelect');
        const commitList = document.getElementById('commitList');
        const loading = document.getElementById('loading');

        let branches = [];
        let commits = [];
        let expandedCommits = new Set();
        let expandedFiles = new Map(); // hash -> Set of file paths
        let fileDiffs = new Map(); // "hash:path" -> diff content

        window.addEventListener('load', () => {
            vscode.postMessage({ command: 'ready' });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateBranches':
                    branches = message.branches;
                    renderBranches();
                    break;
                case 'updateCommits':
                    commits = message.commits;
                    expandedCommits.clear();
                    expandedFiles.clear();
                    fileDiffs.clear();
                    renderCommits();
                    break;
                case 'updateFileDiff':
                    const key = message.hash + ':' + message.filePath;
                    fileDiffs.set(key, message.diff);
                    renderFileDiff(message.hash, message.filePath, message.diff);
                    break;
            }
        });

        function renderBranches() {
            branchSelect.innerHTML = '<option value="">Select a branch...</option>';

            const localBranches = branches.filter(b => !b.isRemote);
            const remoteBranches = branches.filter(b => b.isRemote);
            let hasCurrentBranch = false;

            if (localBranches.length > 0) {
                const localGroup = document.createElement('optgroup');
                localGroup.label = 'Local Branches';
                localBranches.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch.name;
                    option.textContent = branch.name + (branch.current ? ' (current)' : '');
                    if (branch.current) {
                        option.selected = true;
                        hasCurrentBranch = true;
                    }
                    localGroup.appendChild(option);
                });
                branchSelect.appendChild(localGroup);
            }

            if (remoteBranches.length > 0) {
                const remoteGroup = document.createElement('optgroup');
                remoteGroup.label = 'Remote Branches';
                remoteBranches.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch.name;
                    option.textContent = branch.name;
                    remoteGroup.appendChild(option);
                });
                branchSelect.appendChild(remoteGroup);
            }

            loading.style.display = 'none';

            if (hasCurrentBranch) {
                loadBranch();
            }
        }

        function renderCommits() {
            if (!commits || commits.length === 0) {
                commitList.innerHTML = '<div class="empty">No commits found</div>';
                return;
            }

            commitList.innerHTML = '';
            commits.forEach(commit => {
                const li = document.createElement('li');
                li.className = 'commit-item';
                li.dataset.hash = commit.hash;

                const isExpanded = expandedCommits.has(commit.hash);
                const isMerge = commit.parents.length > 1;

                const header = document.createElement('div');
                header.className = 'commit-header' + (isExpanded ? ' expanded' : '');
                header.onclick = (e) => {
                    if (e.target.closest('.commit-actions')) return;
                    toggleCommit(commit.hash);
                };

                const expandIcon = document.createElement('span');
                expandIcon.className = 'expand-icon' + (isExpanded ? ' expanded' : '');
                expandIcon.textContent = '▶';

                const dot = document.createElement('div');
                dot.className = 'commit-dot' + (isMerge ? ' merge' : '');

                const content = document.createElement('div');
                content.className = 'commit-content';

                const row = document.createElement('div');
                row.className = 'commit-row';

                const hash = document.createElement('span');
                hash.className = 'commit-hash';
                hash.textContent = commit.shortHash;

                const message = document.createElement('span');
                message.className = 'commit-message';
                message.textContent = commit.message;
                message.title = commit.message;

                row.appendChild(hash);
                row.appendChild(message);

                const meta = document.createElement('div');
                meta.className = 'commit-meta';
                meta.innerHTML = escapeHtml(commit.author) + ' • ' + formatDate(commit.date) + 
                    (commit.files?.length ? ' • ' + commit.files.length + ' files' : '');

                content.appendChild(row);
                content.appendChild(meta);

                const actions = document.createElement('div');
                actions.className = 'commit-actions';
                
                const diffBtn = document.createElement('button');
                diffBtn.textContent = 'View Diff';
                diffBtn.onclick = (e) => {
                    e.stopPropagation();
                    vscode.postMessage({ command: 'commitClick', hash: commit.hash });
                };
                actions.appendChild(diffBtn);

                header.appendChild(expandIcon);
                header.appendChild(dot);
                header.appendChild(content);
                header.appendChild(actions);
                li.appendChild(header);

                // Files list with diffs
                if (isExpanded && commit.files?.length > 0) {
                    const filesList = document.createElement('ul');
                    filesList.className = 'files-list';
                    
                    commit.files.forEach(file => {
                        const fileKey = commit.hash + ':' + file.path;
                        const isFileExpanded = expandedFiles.get(commit.hash)?.has(file.path);
                        const diff = fileDiffs.get(fileKey);
                        
                        const fileLi = document.createElement('li');
                        fileLi.className = 'file-item';
                        fileLi.dataset.filePath = file.path;
                        
                        const fileHeader = document.createElement('div');
                        fileHeader.className = 'file-header' + (isFileExpanded ? ' expanded' : '');
                        fileHeader.onclick = (e) => {
                            if (e.target.closest('.file-actions')) return;
                            toggleFile(commit.hash, file.path);
                        };

                        const fileExpandIcon = document.createElement('span');
                        fileExpandIcon.className = 'file-expand-icon' + (isFileExpanded ? ' expanded' : '');
                        fileExpandIcon.textContent = '▶';

                        const status = document.createElement('span');
                        status.className = 'file-status status-' + (file.status || 'default');
                        status.textContent = file.status || '?';

                        const path = document.createElement('span');
                        path.className = 'file-path';
                        path.textContent = file.path;

                        const fileActions = document.createElement('div');
                        fileActions.className = 'file-actions';
                        
                        const viewFileBtn = document.createElement('button');
                        viewFileBtn.textContent = 'View';
                        viewFileBtn.onclick = (e) => {
                            e.stopPropagation();
                            vscode.postMessage({ 
                                command: 'fileClick', 
                                hash: commit.hash, 
                                filePath: file.path 
                            });
                        };
                        fileActions.appendChild(viewFileBtn);

                        fileHeader.appendChild(fileExpandIcon);
                        fileHeader.appendChild(status);
                        fileHeader.appendChild(path);
                        fileHeader.appendChild(fileActions);
                        fileLi.appendChild(fileHeader);

                        // Diff container
                        if (isFileExpanded) {
                            const diffContainer = document.createElement('div');
                            diffContainer.className = 'diff-container';
                            diffContainer.id = 'diff-' + commit.hash + '-' + file.path.replace(/[^a-zA-Z0-9]/g, '-');
                            
                            if (diff) {
                                diffContainer.innerHTML = '<pre class="diff-content">' + formatDiff(diff) + '</pre>';
                            } else {
                                diffContainer.innerHTML = '<div class="diff-loading">Loading diff...</div>';
                                // Request diff from extension
                                vscode.postMessage({ 
                                    command: 'loadFileDiff', 
                                    hash: commit.hash, 
                                    filePath: file.path 
                                });
                            }
                            fileLi.appendChild(diffContainer);
                        }

                        filesList.appendChild(fileLi);
                    });
                    
                    li.appendChild(filesList);
                }

                commitList.appendChild(li);
            });
        }

        function renderFileDiff(hash, filePath, diff) {
            const diffContainer = document.getElementById('diff-' + hash + '-' + filePath.replace(/[^a-zA-Z0-9]/g, '-'));
            if (diffContainer) {
                diffContainer.innerHTML = '<pre class="diff-content">' + formatDiff(diff) + '</pre>';
            }
        }

        function formatDiff(diff) {
            if (!diff) return '';
            return diff.split('\n').map(line => {
                let className = 'diff-line';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    className += ' diff-add';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    className += ' diff-del';
                } else if (line.startsWith('@@')) {
                    className += ' diff-hunk';
                } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
                    className += ' diff-header';
                }
                return '<div class="' + className + '">' + escapeHtml(line) + '</div>';
            }).join('');
        }

        function toggleCommit(hash) {
            if (expandedCommits.has(hash)) {
                expandedCommits.delete(hash);
            } else {
                expandedCommits.add(hash);
            }
            renderCommits();
            vscode.postMessage({ command: 'toggleCommit', hash });
        }

        function toggleFile(hash, filePath) {
            let commitFiles = expandedFiles.get(hash);
            if (!commitFiles) {
                commitFiles = new Set();
                expandedFiles.set(hash, commitFiles);
            }
            
            if (commitFiles.has(filePath)) {
                commitFiles.delete(filePath);
            } else {
                commitFiles.add(filePath);
            }
            renderCommits();
        }

        function loadBranch() {
            const branch = branchSelect.value;
            if (!branch) return;

            commitList.innerHTML = '<div class="loading">Loading commits...</div>';
            vscode.postMessage({ command: 'loadBranch', branch });
        }

        function pull() {
            const branch = branchSelect.value;
            if (!branch) {
                alert('Please select a branch first');
                return;
            }
            vscode.postMessage({ command: 'pull', branch });
        }

        function push() {
            const branch = branchSelect.value;
            if (!branch) {
                alert('Please select a branch first');
                return;
            }
            vscode.postMessage({ command: 'push', branch });
        }

        function sync() {
            const branch = branchSelect.value;
            if (!branch) {
                alert('Please select a branch first');
                return;
            }
            vscode.postMessage({ command: 'sync', branch });
        }

        function formatDate(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
  }
}
