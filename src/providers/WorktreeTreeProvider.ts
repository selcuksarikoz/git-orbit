import * as vscode from 'vscode';
import { GitService, GitRepository } from '../services/GitService';
import { WorktreeService, WorktreeInfo } from '../services/WorktreeService';

class WorktreeGroupItem extends vscode.TreeItem {
  constructor(
    public readonly repo: GitRepository,
    public readonly worktrees: WorktreeInfo[]
  ) {
    const repoName = repo.rootDir.split(/[/\\]/).pop() || 'Repository';
    super(repoName, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `(${worktrees.length})`;
    this.iconPath = new vscode.ThemeIcon('files');
    this.contextValue = 'worktreeGroup';
  }
}

class WorktreeItem extends vscode.TreeItem {
  constructor(
    public readonly repo: GitRepository,
    public readonly worktreeInfo: WorktreeInfo,
    public readonly isCurrent: boolean
  ) {
    const name = worktreeInfo.path.split(/[/\\]/).pop() || 'Worktree';
    const label = isCurrent ? `${name} (current)` : name;

    super(label, vscode.TreeItemCollapsibleState.None);

    this.iconPath = new vscode.ThemeIcon(
      'files',
      isCurrent ? new vscode.ThemeColor('charts.green') : new vscode.ThemeColor('foreground')
    );

    this.description = worktreeInfo.branch || worktreeInfo.head || '';
    this.tooltip = `Path: ${worktreeInfo.path}\nBranch: ${this.description}${isCurrent ? '\n(Current)' : ''}`;
    this.contextValue = 'worktreeItem';

    this.command = {
      command: 'gitorbit.worktree.switch',
      title: 'Switch to Worktree',
      arguments: [this],
    };
  }
}

export class WorktreeTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private gitService: GitService;
  private worktreeService: WorktreeService;

  constructor() {
    this.gitService = GitService.getInstance();
    this.worktreeService = WorktreeService.getInstance();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    await this.gitService.ensureInitialized();

    if (!element) {
      return this.getRootItems();
    }

    if (element instanceof WorktreeGroupItem) {
      return this.getGroupChildren(element);
    }

    return [];
  }

  private async getRootItems(): Promise<vscode.TreeItem[]> {
    const repos = this.gitService.getMainRepositories();
    const selectedRepo = this.gitService.getSelectedRepository();

    if (repos.length === 0) {
      return [new vscode.TreeItem('No repositories found')];
    }

    const items: vscode.TreeItem[] = [];

    for (const repo of repos) {
      const worktrees = await this.worktreeService.listWorktrees(repo);
      const nonBareWorktrees = worktrees.filter((wt) => !wt.isBare);

      if (nonBareWorktrees.length > 0) {
        items.push(new WorktreeGroupItem(repo, nonBareWorktrees));
      }
    }

    if (items.length === 0) {
      return [new vscode.TreeItem('No worktrees found')];
    }

    return items;
  }

  private async getGroupChildren(group: WorktreeGroupItem): Promise<vscode.TreeItem[]> {
    const selectedRepo = this.gitService.getSelectedRepository();
    const items: vscode.TreeItem[] = [];

    for (const wt of group.worktrees) {
      const isCurrent = selectedRepo?.rootDir === wt.path;
      const gitRepos = this.gitService.getRepositories();
      const gitWt = gitRepos.find((r) => r.rootDir === wt.path);

      if (gitWt) {
        items.push(new WorktreeItem(gitWt, wt, isCurrent));
      }
    }

    return items;
  }
}
