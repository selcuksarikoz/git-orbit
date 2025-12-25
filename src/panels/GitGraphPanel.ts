import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

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
}

export class GitGraphPanel {
  public static currentPanel: GitGraphPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private gitService: GitService;

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.ViewColumn.One;

    // If we already have a panel, show it
    if (GitGraphPanel.currentPanel) {
      GitGraphPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
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

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
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
      await this.gitService['_ensureInitialized']();
      const executor = this.gitService['executor'];

      if (!executor) {
        throw new Error('Git executor not initialized');
      }

      // Get all branches
      const result = await executor.exec(['branch', '-a', '-v']);
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
      console.log('Loading commits for branch:', branch);
      await this.gitService['_ensureInitialized']();
      const executor = this.gitService['executor'];

      if (!executor) {
        throw new Error('Git executor not initialized');
      }

      // Try different git log formats
      let result;
      try {
        result = await executor.exec([
          'log',
          branch,
          '--pretty=format:%H|%h|%P|%an|%at|%s',
          '-100',
        ]);
      } catch (e) {
        console.error('First git log attempt failed:', e);
        // Try alternative format
        result = await executor.exec(['log', branch, '-n', '100', '--format=%H|%h|%P|%an|%at|%s']);
      }

      console.log('Git log raw output:', result.stdout);
      console.log('Git log stderr:', result.stderr);

      const commits: CommitInfo[] = [];
      const lines = result.stdout.trim().split('\n');

      console.log('Total lines:', lines.length);

      lines.forEach((line, index) => {
        if (!line.trim()) {
          console.log(`Line ${index} is empty`);
          return;
        }

        const parts = line.split('|');
        console.log(`Line ${index} parts:`, parts.length, parts);

        if (parts.length < 6) {
          console.warn(`Skipping line ${index}, not enough parts (${parts.length}):`, line);
          return;
        }

        const [hash, shortHash, parents, author, timestamp, ...messageParts] = parts;
        const commit = {
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
        };
        console.log(`Parsed commit ${index}:`, commit);
        commits.push(commit);
      });

      console.log('Total parsed commits:', commits.length);

      this._panel.webview.postMessage({
        command: 'updateCommits',
        commits,
        branch,
      });
    } catch (error) {
      console.error('Failed to load commits:', error);
      vscode.window.showErrorMessage(`Failed to load commits: ${error}`);

      // Send empty commits to show error state
      this._panel.webview.postMessage({
        command: 'updateCommits',
        commits: [],
        branch,
      });
    }
  }

  private async handleCommitClick(hash: string) {
    await vscode.commands.executeCommand('gitorbit.openCommitDiffs', { hash });
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
          // Sync = Pull + Push
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
        * {
            box-sizing: border-box;
        }
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
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        #content {
            flex: 1;
            overflow: auto;
        }
        #commitList {
            padding: 0;
            margin: 0;
            list-style: none;
        }
        .commit-row {
            display: flex;
            align-items: center;
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            transition: background-color 0.1s;
            cursor: pointer;
        }
        .commit-row:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .commit-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
        }
        .commit-header {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .commit-hash {
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
            flex-shrink: 0;
        }
        .commit-message {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .commit-meta {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .loading, .empty {
            padding: 40px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
        .branch-badge {
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: bold;
            white-space: nowrap;
        }
        .branch-local {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .branch-remote {
            background: var(--vscode-charts-blue);
            color: #000;
        }
        .branch-current {
            background: var(--vscode-charts-green);
            color: #000;
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
            <button class="secondary" onclick="pull()" title="Pull">
                ⬇️ Pull
            </button>
            <button class="secondary" onclick="push()" title="Push">
                ⬆️ Push
            </button>
            <button onclick="sync()" title="Sync">
                🔄 Sync
            </button>
        </div>
    </div>

    <div id="content">
        <div id="loading" class="loading">Loading branches...</div>
        <ul id="commitList"></ul>
        <div id="loadMoreContainer" style="padding: 20px; text-align: center; display: none;">
            <button id="loadMoreBtn" onclick="loadMore()">Load More Commits</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const branchSelect = document.getElementById('branchSelect');
        const commitList = document.getElementById('commitList');
        const loading = document.getElementById('loading');
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        const loadMoreBtn = document.getElementById('loadMoreBtn');

        let branches = [];
        let currentBranch = '';
        let allCommits = [];
        let displayedCommits = 0;
        const COMMITS_PER_PAGE = 50;

        // Initialize
        window.addEventListener('load', () => {
            updateButtonStates(false); // Disable buttons initially
            vscode.postMessage({ command: 'ready' });
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateBranches':
                    branches = message.branches;
                    renderBranches();
                    break;
                case 'updateCommits':
                    currentBranch = message.branch;
                    allCommits = message.commits;
                    displayedCommits = 0;
                    commitList.innerHTML = '';
                    renderCommits();
                    break;
            }
        });

        function renderBranches() {
            branchSelect.innerHTML = '<option value="">Select a branch...</option>';

            // Group by local and remote
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

            // If current branch is selected, load it and enable buttons
            if (hasCurrentBranch) {
                loadBranch();
            }
        }

        function renderCommits() {
            if (!allCommits || allCommits.length === 0) {
                commitList.innerHTML = '<div class="empty">No commits found</div>';
                loadMoreContainer.style.display = 'none';
                return;
            }

            // Calculate how many commits to show
            const endIndex = Math.min(displayedCommits + COMMITS_PER_PAGE, allCommits.length);
            const commitsToShow = allCommits.slice(displayedCommits, endIndex);

            commitsToShow.forEach(commit => {
                const li = document.createElement('li');
                li.className = 'commit-row';
                li.onclick = () => commitClick(commit.hash);

                const content = document.createElement('div');
                content.className = 'commit-content';

                const header = document.createElement('div');
                header.className = 'commit-header';

                const hash = document.createElement('span');
                hash.className = 'commit-hash';
                hash.textContent = commit.shortHash;

                const message = document.createElement('span');
                message.className = 'commit-message';
                message.textContent = commit.message;
                message.title = commit.message;

                header.appendChild(hash);
                header.appendChild(message);

                const meta = document.createElement('div');
                meta.className = 'commit-meta';

                const author = document.createElement('span');
                author.innerHTML = \`👤 \${escapeHtml(commit.author)}\`;

                const date = document.createElement('span');
                const dateStr = new Date(commit.date).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                date.innerHTML = \`🕐 \${dateStr}\`;

                meta.appendChild(author);
                meta.appendChild(date);

                content.appendChild(header);
                content.appendChild(meta);
                li.appendChild(content);
                commitList.appendChild(li);
            });

            displayedCommits = endIndex;

            // Show/hide load more button
            if (displayedCommits < allCommits.length) {
                loadMoreContainer.style.display = 'block';
                loadMoreBtn.textContent = \`Load More (\${allCommits.length - displayedCommits} remaining)\`;
            } else {
                loadMoreContainer.style.display = 'none';
            }
        }

        function loadMore() {
            renderCommits();
        }

        function loadBranch() {
            const branch = branchSelect.value;
            if (!branch) {
                updateButtonStates(false);
                return;
            }

            updateButtonStates(true);
            commitList.innerHTML = '<div class="loading">Loading commits...</div>';
            vscode.postMessage({
                command: 'loadBranch',
                branch: branch
            });
        }

        function updateButtonStates(enabled) {
            const buttons = document.querySelectorAll('.actions button');
            buttons.forEach(btn => {
                btn.disabled = !enabled;
                if (!enabled) {
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                } else {
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                }
            });
        }

        function commitClick(hash) {
            vscode.postMessage({
                command: 'commitClick',
                hash: hash
            });
        }

        function pull() {
            const branch = branchSelect.value;
            if (!branch) {
                alert('Please select a branch first');
                return;
            }
            console.log('Pulling branch:', branch);
            vscode.postMessage({
                command: 'pull',
                branch: branch
            });
        }

        function push() {
            const branch = branchSelect.value;
            if (!branch) {
                alert('Please select a branch first');
                return;
            }
            console.log('Pushing branch:', branch);
            vscode.postMessage({
                command: 'push',
                branch: branch
            });
        }

        function sync() {
            const branch = branchSelect.value;
            if (!branch) {
                alert('Please select a branch first');
                return;
            }
            console.log('Syncing branch:', branch);
            vscode.postMessage({
                command: 'sync',
                branch: branch
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
