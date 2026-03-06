import * as vscode from 'vscode';
import { ConfigService } from '../services/ConfigService';
import { GitRepository, GitService } from '../services/GitService';
import { TooltipGenerator } from '../utils/TooltipGenerator';
import { BaseTreeProvider } from './BaseTreeProvider';

export class GraphTreeProvider extends BaseTreeProvider<GraphItem | vscode.TreeItem> {
  private gitService: GitService;
  private limit: number = 50;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
    this.limit = ConfigService.getInstance().commitLimit;

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitorbit.views.commitLimit')) {
        this.limit = ConfigService.getInstance().commitLimit;
        this.refresh();
      }
    });
  }

  getTreeItem(element: GraphItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  private resolveRepo(repoRoot?: string): GitRepository | undefined {
    return repoRoot ? this.gitService.getRepositoryByRoot(repoRoot) : undefined;
  }

  private createCommitItem(commit: any, index: number, repo?: GitRepository): GraphItem {
    return new GraphItem(
      commit.message,
      commit.author_name,
      commit.date,
      commit.hash,
      vscode.TreeItemCollapsibleState.Collapsed,
      'commit',
      index === 0,
      commit.refs,
      commit.author_email,
      undefined,
      undefined,
      undefined,
      repo?.rootDir
    );
  }

  resolveTreeItem(
    item: vscode.TreeItem,
    element: GraphItem | vscode.TreeItem
  ): vscode.ProviderResult<vscode.TreeItem> {
    if (element instanceof GraphItem) {
      element.resolveTooltip();
    }
    return element;
  }

  async getChildren(
    element?: GraphItem | vscode.TreeItem
  ): Promise<(GraphItem | vscode.TreeItem)[]> {
    const repos = this.gitService.getMainRepositories();
    const worktrees = this.gitService.getWorktrees();

    if (element instanceof vscode.TreeItem && !(element instanceof GraphItem)) {
      // Handle TreeItem (worktree groups)
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
        const repo = this.resolveRepo(repoRoot);
        const log = await this.gitService.getAllLog(this.limit, repo);

        return log.all.slice(0, this.limit).map((commit, index) => this.createCommitItem(commit, index, repo));
      }

      return [];
    }

    const graphElement = element as GraphItem | undefined;

    if (!graphElement) {
      // Root: Show all repos, worktrees, AND their commits (no clicking needed)
      const items: (GraphItem | vscode.TreeItem)[] = [];

      // Add main repositories with their commits and worktrees
      for (const repo of repos) {
        const repoWorktrees = worktrees.filter((w) => w.worktreePath?.startsWith(repo.rootDir));

        // Get main repo commits
        const log = await this.gitService.getAllLog(this.limit, repo);

        if (log.all.length > 0) {
          const repoItem = new vscode.TreeItem(
            repo.rootDir.split(/[/\\]/).pop() || 'Repository',
            vscode.TreeItemCollapsibleState.Expanded
          );
          repoItem.contextValue = 'repo';
          repoItem.iconPath = new vscode.ThemeIcon('repo');
          (repoItem as any).repoRoot = repo.rootDir;

          // Add commits as children of repo
          const commitItems: (GraphItem | vscode.TreeItem)[] = log.all
            .slice(0, this.limit)
            .map((commit, index) => this.createCommitItem(commit, index, repo));
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
          const wtLog = await this.gitService.getAllLog(this.limit, wt);

          const wtCommitItems: (GraphItem | vscode.TreeItem)[] = wtLog.all
            .slice(0, this.limit)
            .map((commit, index) => this.createCommitItem(commit, index, wt));
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

        const wtLog = await this.gitService.getAllLog(this.limit, wt);

        const wtCommitItems: (GraphItem | vscode.TreeItem)[] = wtLog.all
          .slice(0, this.limit)
          .map((commit, index) => this.createCommitItem(commit, index, wt));
        items.push(wtItem, ...wtCommitItems);
      }

      if (items.length === 0) {
        return [new vscode.TreeItem('No commits found')];
      }

      return items;
    }

    // Handle repo item - show its commits
    if ((graphElement as any).contextValue === 'repo') {
      const repoRoot = (graphElement as any).repoRoot;
      const targetRepo = this.resolveRepo(repoRoot);
      const log = await this.gitService.getAllLog(this.limit, targetRepo);

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

      const items: (GraphItem | vscode.TreeItem)[] = commits.map(
        (commit, index) => this.createCommitItem(commit, index, targetRepo)
      );

      if (log.all.length >= this.limit && !this.filterText) {
        const loadMoreItem = new vscode.TreeItem(
          'Load More...',
          vscode.TreeItemCollapsibleState.None
        );
        loadMoreItem.command = {
          command: 'gitorbit.graph.loadMore',
          title: 'Load More',
        };
        loadMoreItem.iconPath = new vscode.ThemeIcon('add');
        items.push(loadMoreItem);
      }

      return items;
    }

    return [];
  }

  private buildFileTree(files: { path: string; status: string }[]) {
    const root: any = {};
    files.forEach((file) => {
      const parts = file.path.split(/[\\\/]/);
      let current = root;
      parts.forEach((part, i) => {
        if (i === parts.length - 1) {
          current[part] = {
            _isFile: true,
            _path: file.path,
            _status: file.status,
          };
        } else {
          if (!current[part]) current[part] = {};
          current = current[part];
        }
      });
    });
    return root;
  }

  private mapToFileItems(tree: any, hash: string): GraphItem[] {
    return Object.keys(tree).map((key) => {
      const node = tree[key];
      if (node._isFile) {
        return new GraphItem(
          key,
          '',
          '',
          hash,
          vscode.TreeItemCollapsibleState.None,
          'file',
          false,
          '',
          '',
          node._path,
          node._status
        );
      } else {
        return new GraphItem(
          key,
          '',
          '',
          hash,
          vscode.TreeItemCollapsibleState.Collapsed,
          'folder',
          false,
          '',
          '',
          undefined,
          undefined,
          node
        );
      }
    });
  }

  public incrementLimit() {
    this.limit += 20;
    this.refresh();
  }
}

export class GraphItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly authorName: string,
    public readonly dateString: string,
    public readonly hash: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'commit' | 'folder' | 'file',
    public readonly isLatest: boolean = false,
    public readonly refs: string = '',
    public readonly authorEmail: string = '',
    public readonly filePath?: string,
    public readonly status?: string,
    public readonly subItems?: any,
    public readonly repoRoot?: string
  ) {
    super(label, collapsibleState);
    this.contextValue = type;

    if (type === 'commit') {
      this.iconPath = this.getCommitIcon(label, isLatest);
      this.description = refs ? `${refs} • ${dateString}` : dateString;
    } else if (type === 'file') {
      this.iconPath = vscode.ThemeIcon.File;
      if (this.filePath) {
        this.resourceUri = vscode.Uri.file(this.filePath);
      }
      this.description = ''; // Removed status from here, now displayed as decoration
      this.command = {
        command: 'gitorbit.openCommitDiff',
        title: 'Open Diff',
        arguments: [{ hash: this.hash, filePath: this.filePath, repoRoot: this.repoRoot }],
      };
    } else {
      this.iconPath = vscode.ThemeIcon.Folder;
    }
  }

  public resolveTooltip() {
    if (this.type === 'commit' && !this.tooltip) {
      this.tooltip = TooltipGenerator.generateCommitTooltip(
        this.authorName,
        this.authorEmail,
        this.label, // message
        this.dateString,
        this.hash,
        this.refs
      );
    } else if (this.type === 'file' && !this.tooltip) {
      this.tooltip = this.getFileTooltip(this.label, this.status, this.filePath);
    }
  }

  private getFileTooltip(label: string, status?: string, path?: string): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    let statusText = 'Modified';
    if (status === 'A') statusText = 'Added';
    if (status === 'D') statusText = 'Deleted';

    tooltip.appendMarkdown(`**${label}**\n\n`);
    tooltip.appendMarkdown(`**Status:** ${statusText} (${status || 'Unknown'})\n\n`);
    if (path) {
      tooltip.appendMarkdown(`**Path:** \`${path}\``);
    }
    return tooltip;
  }

  private getCommitIcon(message: string, isLatest: boolean): vscode.ThemeIcon {
    const msg = message.toLowerCase();
    let colorId = 'charts.gray';
    if (msg.startsWith('feat')) colorId = 'charts.blue';
    else if (msg.startsWith('fix')) colorId = 'charts.red';
    else if (msg.startsWith('refactor')) colorId = 'charts.gray';

    return new vscode.ThemeIcon(
      isLatest ? 'record' : 'primitive-dot',
      new vscode.ThemeColor(colorId)
    );
  }
}
