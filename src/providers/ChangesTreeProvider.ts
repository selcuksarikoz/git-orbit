import * as vscode from 'vscode';
import { GitService, GitRepository } from '../services/GitService';
import { GitContentProvider } from './GitContentProvider';
import { StatusDecorationProvider } from './StatusDecorationProvider';
import { AIService } from '../services/AIService';
import { BisectService, BisectState } from '../services/BisectService';

class BisectLogItem extends vscode.TreeItem {
  constructor(status: 'bad' | 'good' | 'skip', hash: string) {
    super(
      `Bisect: ${status.toUpperCase()} - ${hash.substring(0, 7)}`,
      vscode.TreeItemCollapsibleState.None
    );

    let icon = 'question';
    let color = undefined;

    if (status === 'bad') {
      icon = 'x';
      color = new vscode.ThemeColor('charts.red');
    } else if (status === 'good') {
      icon = 'check';
      color = new vscode.ThemeColor('charts.green');
    } else {
      icon = 'debug-step-over';
    }

    this.iconPath = new vscode.ThemeIcon(icon, color);
    this.description = hash;
    this.contextValue = 'bisectItem';

    this.command = {
      command: 'gitorbit.copy.hash',
      title: 'Copy Hash',
      arguments: [{ hash }],
    };
  }
}

class ChangeItem extends vscode.TreeItem {
  constructor(
    public readonly path: string,
    public readonly status: string,
    public readonly isStaged: boolean,
    public readonly rootPath: string,
    public readonly repo?: GitRepository
  ) {
    const label = path.split('/').pop() || path;
    super(status === 'D' ? ChangeItem.toStrikethrough(label) : label);

    this.resourceUri = vscode.Uri.file(vscode.Uri.joinPath(vscode.Uri.file(rootPath), path).fsPath);

    this.tooltip = `${path} • ${
      status === 'A' ? 'A' : status === 'M' ? 'M' : status === 'D' ? 'D' : 'U'
    }`;

    this.description = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';

    this.command = {
      command: 'gitorbit.changes.openDiff',
      title: 'Open Diff',
      arguments: [this],
    };

    // Set context for inline actions
    if (isStaged) {
      this.contextValue = 'stagedChange';
    } else {
      this.contextValue = status === 'D' ? 'change_deleted' : 'change';
    }
  }

  static toStrikethrough(text: string): string {
    return text
      .split('')
      .map((char) => char + '\u0336')
      .join('');
  }
}

class BranchStatusItem extends vscode.TreeItem {
  constructor(
    label: string,
    isGone: boolean,
    public readonly repo?: GitRepository
  ) {
    const finalLabel = isGone ? ChangeItem.toStrikethrough(label) : label;
    super(finalLabel, vscode.TreeItemCollapsibleState.None);

    this.iconPath = new vscode.ThemeIcon(
      'git-branch',
      isGone ? new vscode.ThemeColor('charts.red') : new vscode.ThemeColor('charts.green')
    );

    this.description = isGone ? 'gone on remote' : '(current)';
    this.tooltip = isGone ? `${label} (Deleted from remote)` : `${label} (Current branch)`;
    this.contextValue = 'branchStatus';
  }
}

class GroupItem extends vscode.TreeItem {
  constructor(
    label: string,
    count: number,
    contextValue: string,
    public readonly repo?: GitRepository
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `(${count})`;
    this.contextValue = contextValue;
  }
}

class RepoHeaderItem extends vscode.TreeItem {
  constructor(
    public readonly repo: GitRepository,
    changeCount: number,
    isSelected: boolean = false
  ) {
    const folderName = repo.rootDir.split(/[/\\]/).pop() || 'Repository';
    const isWorktree = repo.isWorktree;
    const branchInfo = repo.branch ? ` (${repo.branch})` : '';
    const iconName = isWorktree ? 'files' : 'repo';

    super(`${folderName}${branchInfo}`, vscode.TreeItemCollapsibleState.Expanded);
    this.description = changeCount > 0 ? `${changeCount} changes` : 'no changes';

    const typeLabel = isWorktree ? 'Worktree' : 'Repository';
    this.tooltip = `${typeLabel}: ${repo.rootDir}\nChanges: ${changeCount}${isSelected ? '\n(Selected)' : ''}`;

    this.iconPath = new vscode.ThemeIcon(
      iconName,
      isSelected ? new vscode.ThemeColor('charts.green') : new vscode.ThemeColor('foreground')
    );
    this.contextValue = isSelected
      ? 'repoHeaderSelected'
      : isWorktree
        ? 'worktreeHeader'
        : 'repoHeader';

    // Click to select this repo
    this.command = {
      command: 'gitorbit.selectRepo',
      title: 'Select Repository',
      arguments: [repo],
    };
  }
}

export class ChangesTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private _staged: { path: string; status: string; repo: GitRepository }[] = [];
  private _unstaged: { path: string; status: string; repo: GitRepository }[] = [];
  private _refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private _repoStatus: Map<string, { staged: number; unstaged: number; repo: GitRepository }> =
    new Map();

  public get stagedCount(): number {
    return this._staged.length;
  }

  public get unstagedCount(): number {
    return this._unstaged.length;
  }

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _onRefreshAll?: () => void
  ) {
    this.startWatchers();
  }

  private startWatchers() {
    const debouncedRefresh = () => {
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => {
        this.refresh();
      }, 500); // 500ms debounce
    };

    // Watch workspace files
    const workspaceWatcher = vscode.workspace.createFileSystemWatcher('**/*');

    const shouldRefresh = (uri: vscode.Uri) => {
      const path = uri.fsPath;

      // Critical exclusions
      if (path.includes('/.git/') || path.includes('\\.git\\')) return false;
      if (path.includes('/node_modules/') || path.includes('\\node_modules\\')) return false;

      // Check VSCode exclusions
      const config = vscode.workspace.getConfiguration();
      const filesExclude = config.get<{ [key: string]: boolean }>('files.exclude') || {};
      const searchExclude = config.get<{ [key: string]: boolean }>('search.exclude') || {};
      const allExcludes = { ...filesExclude, ...searchExclude };

      for (const [pattern, enabled] of Object.entries(allExcludes)) {
        if (enabled) {
          // Glob matching
          // Remove syntax fix
          const cleanPattern = pattern.replace(/^\*\*\//, '').replace(/\/$/, '');

          // Directory match
          if (pattern.endsWith('/') || pattern.includes('/')) {
            if (path.includes(cleanPattern)) return false;
          }
          // Extension match
          else if (pattern.startsWith('*.')) {
            if (path.endsWith(pattern.substring(1))) return false;
          }
          // Exact match
          else {
            if (path.includes(`/${cleanPattern}`) || path.includes(`\\${cleanPattern}`))
              return false;
          }
        }
      }

      return true;
    };

    const handleEvent = (uri: vscode.Uri) => {
      if (shouldRefresh(uri)) debouncedRefresh();
    };

    workspaceWatcher.onDidChange(handleEvent);
    workspaceWatcher.onDidCreate(handleEvent);
    workspaceWatcher.onDidDelete(handleEvent);

    // Initial refresh
    this.refresh();
  }

  async refresh() {
    const gitService = GitService.getInstance();
    gitService.clearCache();

    // Clear previous status
    this._staged = [];
    this._unstaged = [];
    this._repoStatus.clear();

    // Get status from all repositories
    const allStatus = await gitService.getAllStatus();

    for (const entry of allStatus) {
      const isStaged = entry.stagedStatus !== ' ' && entry.stagedStatus !== '?';
      const isUnstaged = entry.workingTreeStatus !== ' ' || entry.stagedStatus === '?';

      // Track per-repo counts
      const existing = this._repoStatus.get(entry.repo.rootDir) || {
        staged: 0,
        unstaged: 0,
        repo: entry.repo,
      };

      if (isStaged) {
        this._staged.push({ path: entry.path, status: entry.stagedStatus, repo: entry.repo });
        existing.staged++;
      }

      if (isUnstaged) {
        this._unstaged.push({
          path: entry.path,
          status: entry.workingTreeStatus !== ' ' ? entry.workingTreeStatus : '?',
          repo: entry.repo,
        });
        existing.unstaged++;
      }

      this._repoStatus.set(entry.repo.rootDir, existing);
    }

    // Update context keys
    vscode.commands.executeCommand(
      'setContext',
      'gitorbit.hasUnstagedChanges',
      this._unstaged.length > 0
    );
    vscode.commands.executeCommand(
      'setContext',
      'gitorbit.hasStagedChanges',
      this._staged.length > 0
    );

    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const gitService = GitService.getInstance();
    await gitService.ensureInitialized();
    const repos = gitService.getRepositories();

    if (!element) {
      // Root level - always show repo headers if repos exist
      if (repos.length >= 1) {
        const items: vscode.TreeItem[] = [];

        // Show all repos (even those without changes)
        const selectedRepo = gitService.getSelectedRepository();
        for (const repo of repos) {
          const repoStaged = this._staged.filter((s) => s.repo.rootDir === repo.rootDir);
          const repoUnstaged = this._unstaged.filter((s) => s.repo.rootDir === repo.rootDir);
          const totalChanges = repoStaged.length + repoUnstaged.length;
          const isSelected = selectedRepo?.rootDir === repo.rootDir;
          items.push(new RepoHeaderItem(repo, totalChanges, isSelected));
        }

        // Add Bisect Log if active (global)
        const bisectService = BisectService.getInstance();
        if (bisectService.currentState !== BisectState.Idle) {
          const logs = await bisectService.getLog();
          if (logs.length > 0) {
            items.push(new GroupItem('Bisect Log', logs.length, 'bisectGroup'));
          }
        }

        return items;
      } else {
        // No repos found
        return [new vscode.TreeItem('No git repositories found')];
      }
    }

    if (element instanceof RepoHeaderItem) {
      // Show repo-specific groups
      return this.getRepoSpecificChildren(element.repo);
    }

    if (element instanceof GroupItem) {
      if (element.label === 'Bisect Log') {
        const logs = await BisectService.getInstance().getLog();
        return logs.map((l) => new BisectLogItem(l.status, l.hash));
      }
      if (element.label === 'Staged Changes') {
        const repoStaged = element.repo
          ? this._staged.filter((s) => s.repo.rootDir === element.repo!.rootDir)
          : this._staged;
        return repoStaged.map(
          (s) => new ChangeItem(s.path, s.status, true, s.repo.rootDir, s.repo)
        );
      } else if (element.label === 'Changes') {
        const repoUnstaged = element.repo
          ? this._unstaged.filter((s) => s.repo.rootDir === element.repo!.rootDir)
          : this._unstaged;
        return repoUnstaged.map(
          (s) => new ChangeItem(s.path, s.status, false, s.repo.rootDir, s.repo)
        );
      }
    }

    return [];
  }

  private async getSingleRepoChildren(gitService: GitService): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];

    // Add branch status
    const branches = await gitService.getBranches();
    if (branches.current) {
      const status = await gitService.getBranchStatus(branches.current);
      items.push(new BranchStatusItem(branches.current, status.isGone));
    }

    // Add Bisect Log if active
    const bisectService = BisectService.getInstance();
    if (bisectService.currentState !== BisectState.Idle) {
      const logs = await bisectService.getLog();
      if (logs.length > 0) {
        items.push(new GroupItem('Bisect Log', logs.length, 'bisectGroup'));
      }
    }

    if (this._staged.length) {
      items.push(new GroupItem('Staged Changes', this._staged.length, 'stagedGroup'));
    }

    items.push(
      new GroupItem(
        'Changes',
        this._unstaged.length,
        this._unstaged.length > 0 ? 'changesGroup' : 'changesGroupEmpty'
      )
    );

    // Update decorations
    const allStatus = [
      ...this._staged.map((s) => ({
        path: s.path,
        status: s.status,
        rootDir: s.repo.rootDir,
      })),
      ...this._unstaged.map((s) => ({
        path: s.path,
        status: s.status,
        rootDir: s.repo.rootDir,
      })),
    ];
    StatusDecorationProvider.updateStatus(allStatus);
    new StatusDecorationProvider().fireUpdate();

    return items;
  }

  private async getRepoSpecificChildren(repo: GitRepository): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const gitService = GitService.getInstance();

    // Add branch status for this repo
    const branches = await gitService.getBranches(repo);
    if (branches.current) {
      const status = await gitService.getBranchStatus(branches.current, repo);
      items.push(new BranchStatusItem(branches.current, status.isGone, repo));
    }

    const repoStaged = this._staged.filter((s) => s.repo.rootDir === repo.rootDir);
    const repoUnstaged = this._unstaged.filter((s) => s.repo.rootDir === repo.rootDir);

    if (repoStaged.length) {
      items.push(new GroupItem('Staged Changes', repoStaged.length, 'stagedGroup', repo));
    }

    items.push(
      new GroupItem(
        'Changes',
        repoUnstaged.length,
        repoUnstaged.length > 0 ? 'changesGroup' : 'changesGroupEmpty',
        repo
      )
    );

    return items;
  }

  // --- Commands ---

  public async commit(amend: boolean = false) {
    const gitService = GitService.getInstance();

    // If multiple repos, ask which one to commit
    const repos = gitService.getRepositories();
    let targetRepo: GitRepository | undefined;

    if (repos.length > 1) {
      const repoOptions = repos.map((r) => ({
        label: r.rootDir.split(/[/\\]/).pop() || r.rootDir,
        description: r.rootDir,
        repo: r,
      }));

      const selected = await vscode.window.showQuickPick(repoOptions, {
        placeHolder: 'Select repository to commit',
      });

      if (!selected) return;
      targetRepo = selected.repo;
    } else {
      targetRepo = repos[0];
    }

    if (!targetRepo) {
      vscode.window.showErrorMessage('No repository found.');
      return;
    }

    // Check staged status for this repo
    const status = await gitService.getStatus(targetRepo);
    const staged = status.filter((s) => s.stagedStatus !== ' ' && s.stagedStatus !== '?');
    const unstaged = status.filter((s) => s.workingTreeStatus !== ' ' || s.stagedStatus === '?');

    // Auto-stage logic
    if (staged.length === 0 && !amend) {
      if (unstaged.length === 0) {
        vscode.window.showInformationMessage('No changes to commit.');
        return;
      }

      // Auto-stage if empty
      await gitService.stageAll(targetRepo);
    }

    const message = await vscode.window.showInputBox({
      placeHolder: 'Commit message',
      prompt: amend ? 'Enter commit message (Amend)' : 'Enter commit message',
      ignoreFocusOut: true,
    });

    if (message === undefined) return; // Cancelled
    if (!message && !amend) {
      vscode.window.showErrorMessage('Commit message is required.');
      return;
    }

    try {
      const options = message ? ['-m', message] : [];
      if (amend) options.push('--amend');

      await gitService.commit(options, targetRepo);
      vscode.window.showInformationMessage('Commit successful!');
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Commit failed: ${e.message}`);
    }
  }

  public async openDiff(item: ChangeItem) {
    const gitService = GitService.getInstance();

    try {
      const { original, modified } = GitContentProvider.getDiffUris(
        item.status,
        item.path,
        item.isStaged,
        item.rootPath
      );

      // Handle deletions
      if (!item.isStaged && item.status === 'D') {
        // Show deleted file
        const indexUri = GitContentProvider.getUri('INDEX', item.path);
        await vscode.commands.executeCommand('vscode.open', indexUri, {
          preview: true,
          label: `${item.path} (Deleted)`,
        });
        return;
      }

      if (original) {
        const title = `${item.path} (${item.isStaged ? 'Staged' : 'Changes'})`;
        await vscode.commands.executeCommand('vscode.diff', original, modified, title);
      }
    } catch (e) {
      vscode.window.showErrorMessage('Could not open diff: ' + e);
    }
  }

  public async stage(item: ChangeItem) {
    if (item.repo) {
      await GitService.getInstance().stage(item.path, item.repo);
    } else {
      await GitService.getInstance().stage(item.path);
    }
    this.refresh();
  }

  public async unstage(item: ChangeItem) {
    if (item.repo) {
      await GitService.getInstance().unstage(item.path, item.repo);
    } else {
      await GitService.getInstance().unstage(item.path);
    }
    this.refresh();
  }

  public async stageAll() {
    const gitService = GitService.getInstance();
    const repos = gitService.getRepositories();

    if (repos.length > 1) {
      // Stage all in all repos
      for (const repo of repos) {
        await gitService.stageAll(repo);
      }
    } else {
      await gitService.stageAll();
    }
    this.refresh();
  }

  public async unstageAll() {
    const gitService = GitService.getInstance();
    const repos = gitService.getRepositories();

    if (repos.length > 1) {
      // Unstage all in all repos
      for (const repo of repos) {
        await gitService.unstageAll(repo);
      }
    } else {
      await gitService.unstageAll();
    }
    this.refresh();
  }

  public async commitStaged() {
    // Commit staged only - will show repo picker if needed
    this.commit();
  }

  public async undoCommit() {
    const gitService = GitService.getInstance();
    const repos = gitService.getRepositories();

    let targetRepo: GitRepository | undefined;
    if (repos.length > 1) {
      const repoOptions = repos.map((r) => ({
        label: r.rootDir.split(/[/\\]/).pop() || r.rootDir,
        description: r.rootDir,
        repo: r,
      }));

      const selected = await vscode.window.showQuickPick(repoOptions, {
        placeHolder: 'Select repository to undo commit',
      });

      if (!selected) return;
      targetRepo = selected.repo;
    } else {
      targetRepo = repos[0];
    }

    if (!targetRepo) return;

    try {
      await gitService.undoCommit(targetRepo);
      vscode.window.showInformationMessage('Last commit undone (soft reset).');
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to undo commit: ${e.message}`);
    }
  }

  public async abortRebase() {
    const gitService = GitService.getInstance();
    const repos = gitService.getRepositories();

    let targetRepo: GitRepository | undefined;
    if (repos.length > 1) {
      const repoOptions = repos.map((r) => ({
        label: r.rootDir.split(/[/\\]/).pop() || r.rootDir,
        description: r.rootDir,
        repo: r,
      }));

      const selected = await vscode.window.showQuickPick(repoOptions, {
        placeHolder: 'Select repository to abort rebase',
      });

      if (!selected) return;
      targetRepo = selected.repo;
    } else {
      targetRepo = repos[0];
    }

    if (!targetRepo) return;

    try {
      await gitService.abortRebase(targetRepo);
      vscode.window.showInformationMessage('Rebase aborted.');
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to abort rebase: ${e.message}`);
    }
  }

  public async abortMerge() {
    const gitService = GitService.getInstance();
    const repos = gitService.getRepositories();

    let targetRepo: GitRepository | undefined;
    if (repos.length > 1) {
      const repoOptions = repos.map((r) => ({
        label: r.rootDir.split(/[/\\]/).pop() || r.rootDir,
        description: r.rootDir,
        repo: r,
      }));

      const selected = await vscode.window.showQuickPick(repoOptions, {
        placeHolder: 'Select repository to abort merge',
      });

      if (!selected) return;
      targetRepo = selected.repo;
    } else {
      targetRepo = repos[0];
    }

    if (!targetRepo) return;

    try {
      await gitService.abortMerge(targetRepo);
      vscode.window.showInformationMessage('Merge aborted.');
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to abort merge: ${e.message}`);
    }
  }

  public async openFile(item: ChangeItem) {
    if (item.status === 'D') {
      vscode.window.showWarningMessage('File is deleted.');
      return;
    }

    const uri = vscode.Uri.file(
      vscode.Uri.joinPath(vscode.Uri.file(item.rootPath), item.path).fsPath
    );
    try {
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (e: any) {
      vscode.window.showErrorMessage('Could not open file: ' + e.message);
    }
  }

  public async discard(item: ChangeItem) {
    const confirm = await vscode.window.showWarningMessage(
      `Discard changes in ${item.label}?`,
      { modal: true },
      'Discard'
    );

    if (confirm !== 'Discard') return;

    try {
      if (item.status === '?' || item.status === 'U') {
        const uri = vscode.Uri.file(
          vscode.Uri.joinPath(vscode.Uri.file(item.rootPath), item.path).fsPath
        );
        await vscode.workspace.fs.delete(uri, {
          recursive: true,
          useTrash: false,
        });
      } else {
        if (item.repo) {
          await GitService.getInstance().discardChanges(item.path, item.repo);
        } else {
          await GitService.getInstance().discardChanges(item.path);
        }
      }
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to discard: ${e.message}`);
    }
  }

  public async discardAll() {
    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to discard ALL changes? This cannot be undone.',
      { modal: true },
      'Discard All'
    );
    if (confirm !== 'Discard All') return;

    const gitService = GitService.getInstance();
    const repos = gitService.getRepositories();

    // Discard in all repos
    for (const repo of repos) {
      await gitService.discardAllChanges(repo);
    }

    this.refresh();
  }

  public async sync() {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Syncing...' },
      async () => {
        const gitService = GitService.getInstance();
        const repos = gitService.getRepositories();

        // Sync all repos
        for (const repo of repos) {
          try {
            await gitService.pull('origin', undefined, repo);
            await gitService.push('origin', undefined, false, repo);
          } catch (e: any) {
            vscode.window.showWarningMessage(`Sync failed for ${repo.rootDir}: ${e.message}`);
          }
        }

        if (this._onRefreshAll) {
          this._onRefreshAll();
        } else {
          this.refresh();
        }
      }
    );
  }

  public async push() {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Pushing...' },
      async () => {
        const gitService = GitService.getInstance();
        const repos = gitService.getRepositories();

        // Push all repos
        for (const repo of repos) {
          try {
            await gitService.push('origin', undefined, false, repo);
          } catch (e: any) {
            vscode.window.showWarningMessage(`Push failed for ${repo.rootDir}: ${e.message}`);
          }
        }

        if (this._onRefreshAll) {
          this._onRefreshAll();
        } else {
          this.refresh();
        }
      }
    );
  }

  public async openAllStaged() {
    const gitService = GitService.getInstance();

    // If multiple repos, aggregate all staged
    const allStaged = this._staged;

    if (allStaged.length === 0) return;

    const resources = allStaged.map((s) => {
      const { original, modified } = GitContentProvider.getDiffUris(
        s.status,
        s.path,
        true,
        s.repo.rootDir
      );

      return {
        originalUri: original,
        modifiedUri: modified,
        name: s.path,
        title: s.path,
      };
    });

    await vscode.commands.executeCommand('_workbench.openMultiDiffEditor', {
      title: 'Staged Changes',
      resources,
    });
  }

  public async openAllChanges() {
    const gitService = GitService.getInstance();

    // Aggregate all unstaged from all repos
    const allUnstaged = this._unstaged;

    if (allUnstaged.length === 0) return;

    const resources = allUnstaged.map((s) => {
      const { original, modified } = GitContentProvider.getDiffUris(
        s.status,
        s.path,
        false,
        s.repo.rootDir
      );

      return {
        originalUri: original,
        modifiedUri: modified,
        name: s.path,
        title: s.path,
      };
    });

    await vscode.commands.executeCommand('_workbench.openMultiDiffEditor', {
      title: 'Changes',
      resources,
    });
  }

  public async pull() {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Pulling...' },
      async () => {
        const gitService = GitService.getInstance();
        const repos = gitService.getRepositories();

        // Pull all repos
        for (const repo of repos) {
          try {
            await gitService.pull('origin', undefined, repo);
          } catch (e: any) {
            vscode.window.showWarningMessage(`Pull failed for ${repo.rootDir}: ${e.message}`);
          }
        }

        if (this._onRefreshAll) {
          this._onRefreshAll();
        } else {
          this.refresh();
        }
      }
    );
  }

  public async smartCommit() {
    const gitService = GitService.getInstance();
    const aiService = AIService.getInstance();

    // If multiple repos, ask which one to use
    const repos = gitService.getRepositories();
    let targetRepo: GitRepository | undefined;

    if (repos.length > 1) {
      const repoOptions = repos.map((r) => ({
        label: r.rootDir.split(/[/\\]/).pop() || r.rootDir,
        description: r.rootDir,
        repo: r,
      }));

      const selected = await vscode.window.showQuickPick(repoOptions, {
        placeHolder: 'Select repository for Smart Commit',
      });

      if (!selected) return;
      targetRepo = selected.repo;
    } else {
      targetRepo = repos[0];
    }

    if (!targetRepo) {
      vscode.window.showErrorMessage('No repository found.');
      return;
    }

    // Determine diff target
    const status = await gitService.getStatus(targetRepo);
    const staged = status.filter((s) => s.stagedStatus !== ' ' && s.stagedStatus !== '?');

    let hasStagedChanges = staged.length > 0;
    let diff = '';

    if (hasStagedChanges) {
      // Get staged diff
      diff = await gitService.getTruncatedDiff(true, 4000, targetRepo);
    } else {
      // Diff all tracked
      diff = await gitService.getTruncatedDiff(false, 4000, targetRepo);

      // Diff untracked?
      if (!diff) {
        // Auto-stage for diff
        vscode.window.showInformationMessage('Staging all changes to generate commit message...');
        await gitService.stageAll(targetRepo);
        diff = await gitService.getTruncatedDiff(true, 4000, targetRepo);
        hasStagedChanges = true;
      }
    }

    if (!diff) {
      vscode.window.showWarningMessage('No changes found to generate commit message.');
      return;
    }

    // Call AI
    if (!aiService.validateConfig()) return;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Generating Smart Commit Messages...',
          cancellable: false,
        },
        async () => {
          const prompt = `Generate 1-2 commit messages. Format: <type>: <desc>
Types: feat|fix|refactor|perf|style|docs|test|chore. One per line, max 72 chars.

${diff}`;

          const commitRecommendations = await aiService.generateCommitMessages([
            { role: 'user', content: prompt },
          ]);

          // Show options
          const selected = await vscode.window.showQuickPick(commitRecommendations, {
            placeHolder: 'Select a commit message...',
            title: 'Smart Commit Recommendations',
          });

          if (selected) {
            // Edit message
            const editedMessage = await vscode.window.showInputBox({
              value: selected,
              placeHolder: 'Commit message',
              prompt: 'Edit your commit message if needed',
              ignoreFocusOut: true,
            });

            if (editedMessage === undefined) return; // User cancelled editing

            if (!editedMessage) {
              vscode.window.showErrorMessage('Commit message cannot be empty.');
              return;
            }

            // Commit
            // Stage if needed
            if (!hasStagedChanges) {
              await gitService.stageAll(targetRepo);
            }
            await gitService.commit(['-m', editedMessage], targetRepo);
            vscode.window.showInformationMessage('Smart Commit successful!');
            this.refresh();
          }
        }
      );
    } catch (e: any) {
      vscode.window.showErrorMessage(`Smart Commit failed: ${e.message}`);
    }
  }
}
