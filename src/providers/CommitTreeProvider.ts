import * as vscode from 'vscode';
import { BaseTreeProvider } from './BaseTreeProvider';
import { GitService } from '../services/GitService';
import { ConfigService } from '../services/ConfigService';

import { TooltipGenerator } from '../utils/TooltipGenerator';

export class CommitItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly hash: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None,
    public readonly filePath?: string,
    public readonly isLatest: boolean = false,
    public readonly authorEmail: string = ''
  ) {
    super(label, collapsibleState);
    const [name, date] = description.split(' • ');
    this.tooltip = TooltipGenerator.generateCommitTooltip(
      name,
      authorEmail,
      label, // message
      date,
      hash
    );

    this.contextValue = 'commit';

    this.iconPath = this.getDotIcon(label, isLatest);

    this.command = {
      command: 'gitorbit.openCommitDiff',
      title: 'Open Commit Diff',
      arguments: [this],
    };
  }

  private getDotIcon(message: string, isLatest: boolean): vscode.ThemeIcon | undefined {
    const msg = message.toLowerCase();
    let colorId = 'charts.gray'; // Default to gray
    if (msg.startsWith('feat')) colorId = 'charts.blue';
    else if (msg.startsWith('fix')) colorId = 'charts.red';
    else if (msg.startsWith('refactor')) colorId = 'charts.gray';

    return new vscode.ThemeIcon(
      isLatest ? 'record' : 'primitive-dot',
      new vscode.ThemeColor(colorId)
    );
  }
}

export class CommitTreeProvider extends BaseTreeProvider<CommitItem | vscode.TreeItem> {
  private gitService: GitService;
  private configService: ConfigService;
  private limit: number;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
    this.configService = ConfigService.getInstance();
    this.limit = this.configService.commitLimit;

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitorbit.views.commitLimit')) {
        this.limit = this.configService.commitLimit;
        this.refresh();
      }
    });
  }

  getTreeItem(element: CommitItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: CommitItem | vscode.TreeItem
  ): Promise<(CommitItem | vscode.TreeItem)[]> {
    if (!this.gitService.isInitialized()) return [];

    const repos = this.gitService.getMainRepositories();
    const worktrees = this.gitService.getWorktrees();

    // Handle TreeItem (worktree groups)
    if (element instanceof vscode.TreeItem && !(element instanceof CommitItem)) {
      const treeItem = element;

      if (treeItem.contextValue === 'worktreeGroup') {
        const repoRoot = (treeItem as any).repoRoot;
        const repoWorktrees = worktrees.filter((w) => w.worktreePath?.startsWith(repoRoot));

        return repoWorktrees.map((wt) => {
          const item = new vscode.TreeItem(
            `${wt.rootDir.split(/[/\\]/).pop()} (${wt.branch})`,
            vscode.TreeItemCollapsibleState.Collapsed
          );
          item.contextValue = 'worktree';
          (item as any).repoRoot = wt.rootDir;
          item.iconPath = new vscode.ThemeIcon('files');
          return item;
        });
      }

      if (treeItem.contextValue === 'worktree') {
        const repoRoot = (treeItem as any).repoRoot;
        const repo = { rootDir: repoRoot } as any;
        const log = await this.gitService.getLog(this.limit, undefined, repo);

        return log.all
          .slice(0, this.limit)
          .map(
            (commit, index) =>
              new CommitItem(
                commit.message,
                `${commit.author_name} • ${commit.date}`,
                commit.hash,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                index === 0,
                commit.author_email
              )
          );
      }

      return [];
    }

    if (!element) {
      // Root: Show all repos, worktrees, AND their commits (no clicking needed)
      const items: (CommitItem | vscode.TreeItem)[] = [];

      // Add main repositories with their commits and worktrees
      for (const repo of repos) {
        const repoWorktrees = worktrees.filter((w) => w.worktreePath?.startsWith(repo.rootDir));

        // Get main repo commits
        const log = await this.gitService.getLog(this.limit, undefined, repo);

        if (log.all.length > 0) {
          // Add commits directly
          const commitItems: (CommitItem | vscode.TreeItem)[] = log.all
            .slice(0, this.limit)
            .map(
              (commit, index) =>
                new CommitItem(
                  commit.message,
                  `${commit.author_name} • ${commit.date}`,
                  commit.hash,
                  vscode.TreeItemCollapsibleState.None,
                  undefined,
                  index === 0,
                  commit.author_email
                )
            );
          items.push(...commitItems);
        }

        // Add worktrees with their commits
        for (const wt of repoWorktrees) {
          const wtItem = new vscode.TreeItem(
            `${wt.rootDir.split(/[/\\]/).pop()} (${wt.branch})`,
            vscode.TreeItemCollapsibleState.Expanded
          );
          wtItem.contextValue = 'worktree';
          wtItem.iconPath = new vscode.ThemeIcon('files');
          (wtItem as any).repoRoot = wt.rootDir;

          // Get worktree commits
          const wtRepo = { rootDir: wt.rootDir } as any;
          const wtLog = await this.gitService.getLog(this.limit, undefined, wtRepo);

          const wtCommitItems: (CommitItem | vscode.TreeItem)[] = wtLog.all
            .slice(0, this.limit)
            .map(
              (commit, index) =>
                new CommitItem(
                  commit.message,
                  `${commit.author_name} • ${commit.date}`,
                  commit.hash,
                  vscode.TreeItemCollapsibleState.None,
                  undefined,
                  index === 0,
                  commit.author_email
                )
            );
          items.push(wtItem, ...wtCommitItems);
        }
      }

      // Add standalone worktrees with their commits
      const mainRoots = new Set(repos.map((r) => r.rootDir));
      const standaloneWorktrees = worktrees.filter((w) => !mainRoots.has(w.rootDir));

      for (const wt of standaloneWorktrees) {
        const wtItem = new vscode.TreeItem(
          `${wt.rootDir.split(/[/\\]/).pop()} (${wt.branch})`,
          vscode.TreeItemCollapsibleState.Expanded
        );
        wtItem.contextValue = 'worktree';
        wtItem.iconPath = new vscode.ThemeIcon('files');
        (wtItem as any).repoRoot = wt.rootDir;

        const wtRepo = { rootDir: wt.rootDir } as any;
        const wtLog = await this.gitService.getLog(this.limit, undefined, wtRepo);

        const wtCommitItems: (CommitItem | vscode.TreeItem)[] = wtLog.all
          .slice(0, this.limit)
          .map(
            (commit: any, index: number) =>
              new CommitItem(
                commit.message,
                `${commit.author_name} • ${commit.date}`,
                commit.hash,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                index === 0,
                commit.author_email
              )
          );
        items.push(wtItem, ...wtCommitItems);
      }

      if (items.length === 0) {
        return [new vscode.TreeItem('No commits found')];
      }

      return items;
    }

    // Handle repo item - show its commits
    if ((element as any).contextValue === 'repo') {
      const repoRoot = (element as any).repoRoot;
      const targetRepo = this.gitService.getRepositories().find((r) => r.rootDir === repoRoot);
      const log = await this.gitService.getLog(this.limit, undefined, targetRepo);

      let commits = log.all;
      if (this.filterText) {
        const search = this.filterText.toLowerCase();
        commits = commits.filter(
          (c) =>
            c.message.toLowerCase().includes(search) ||
            c.hash.toLowerCase().includes(search) ||
            c.author_name.toLowerCase().includes(search)
        );
      }

      const items: (CommitItem | vscode.TreeItem)[] = commits.map(
        (commit, index) =>
          new CommitItem(
            commit.message,
            `${commit.author_name} • ${commit.date}`,
            commit.hash,
            vscode.TreeItemCollapsibleState.None,
            undefined,
            index === 0,
            commit.author_email
          )
      );

      if (log.all.length >= this.limit && !this.filterText) {
        const loadMoreItem = new vscode.TreeItem(
          'Load More...',
          vscode.TreeItemCollapsibleState.None
        );
        loadMoreItem.command = {
          command: 'gitorbit.loadMoreCommits',
          title: 'Load More',
        };
        loadMoreItem.iconPath = new vscode.ThemeIcon('add');
        items.push(loadMoreItem);
      }

      return items;
    }

    return [];
  }

  public incrementLimit() {
    this.limit += 20;
    this.refresh();
  }
}
