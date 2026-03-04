import * as vscode from 'vscode';
import { BaseTreeProvider } from './BaseTreeProvider';
import { GitService, GitRepository } from '../services/GitService';
import { IconService } from '../services/IconService';
import { toStrikethrough } from '../utils/HtmlUtils';

/**
 * Represents a branch or a folder in the tree view.
 */
export class BranchItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'folder' | 'branch' | 'worktree' | 'repo' | 'worktreeGroup',
    public readonly branchName?: string,
    public readonly isRemote: boolean = false,
    public readonly subItems?: any,
    public readonly isCurrent: boolean = false,
    public readonly status?: { ahead: number; behind: number; isGone: boolean },
    public readonly repo?: GitRepository
  ) {
    const isGone = status?.isGone;
    const finalLabel = isGone ? BranchItem.toStrikethrough(label) : label;
    super(finalLabel, collapsibleState);

    if (type === 'repo') {
      this.contextValue = 'repoGroup';
      this.iconPath = new vscode.ThemeIcon('repo');
      this.tooltip = `Repository: ${repo?.rootDir}`;
    } else if (type === 'worktreeGroup') {
      this.contextValue = 'worktreeGroup';
      this.iconPath = new vscode.ThemeIcon('files');
      this.tooltip = 'Worktrees';
    } else if (type === 'worktree') {
      this.contextValue = 'worktree';
      this.iconPath = new vscode.ThemeIcon('files');
      this.description = repo?.branch || '';
      this.tooltip = `Worktree: ${repo?.rootDir}\nBranch: ${repo?.branch || 'unknown'}`;
    } else {
      this.contextValue =
        type === 'branch'
          ? isRemote
            ? 'remoteBranch'
            : isCurrent
              ? 'localBranchCurrent'
              : 'localBranchNotCurrent'
          : 'folder';

      if (type === 'branch') {
        this.iconPath = new vscode.ThemeIcon(
          'git-branch',
          isGone
            ? new vscode.ThemeColor('charts.red')
            : isCurrent
              ? new vscode.ThemeColor('charts.green')
              : undefined
        );

        const parts = [];
        if (isCurrent) parts.push('(current)');

        if (status) {
          if (status.ahead > 0) parts.push(`↑${status.ahead}`);
          if (status.behind > 0) parts.push(`↓${status.behind}`);
        }

        this.description = parts.join(' ');

        if (status) {
          this.tooltip = `Ahead: ${status.ahead}, Behind: ${status.behind}${
            isGone ? ' (Gone on Remote)' : ''
          }`;
        }
      }
    }
  }

  static toStrikethrough(text: string): string {
    return toStrikethrough(text);
  }
}

/**
 * Tree provider for both local and remote branches.
 * Supports hierarchical view (folders) for "feature/", "hotfix/", etc.
 * Groups branches by worktree for multi-worktree support.
 *
 * Structure:
 * ▼ main-repo (repo icon)
 *   ▼ 📁 feature/
 *       branch-a
 *   ▼ 📁 Worktrees
 *     ▼ 📁 main-repo-feature (files icon)
 *         main (current)
 *     ▼ 📁 main-repo-hotfix (files icon)
 *         hotfix-branch
 */
export class BranchTreeProvider extends BaseTreeProvider<BranchItem> {
  private gitService: GitService;

  constructor(private readonly isRemote: boolean) {
    super();
    this.gitService = GitService.getInstance();
  }

  getTreeItem(element: BranchItem): vscode.TreeItem {
    return element;
  }

  /**
   * Retrieves children for the given element.
   * Root level: Main repositories
   * Repo level: Branch folders + Worktrees group
   * Worktree group level: Individual worktrees
   * Worktree level: Branches
   */
  async getChildren(element?: BranchItem): Promise<BranchItem[]> {
    if (!this.gitService.isInitialized()) return [];

    const repos = this.gitService.getMainRepositories();
    const worktrees = this.gitService.getWorktrees();

    // Root level: Show main repositories
    if (!element) {
      const items: BranchItem[] = [];

      for (const repo of repos) {
        // Check if this repo has worktrees
        const repoWorktrees = worktrees.filter((w) => w.worktreePath?.startsWith(repo.rootDir));

        items.push(
          new BranchItem(
            repo.rootDir.split(/[/\\]/).pop() || 'Repository',
            vscode.TreeItemCollapsibleState.Expanded,
            'repo',
            undefined,
            false,
            undefined,
            false,
            undefined,
            repo
          )
        );
      }

      // Add standalone worktrees (not linked to any main repo)
      const mainRoots = new Set(repos.map((r) => r.rootDir));
      const standaloneWorktrees = worktrees.filter((w) => !mainRoots.has(w.rootDir));

      for (const wt of standaloneWorktrees) {
        items.push(
          new BranchItem(
            wt.rootDir.split(/[/\\]/).pop() || 'Worktree',
            vscode.TreeItemCollapsibleState.Expanded,
            'worktree',
            undefined,
            false,
            undefined,
            false,
            undefined,
            wt
          )
        );
      }

      return items;
    }

    // If element is a main repo: show branch folders + worktrees group
    if (element.type === 'repo' && element.repo) {
      return this.getRepoChildren(element.repo);
    }

    // If element is a worktree group: show individual worktrees
    if (element.type === 'worktreeGroup' && element.repo) {
      return this.getWorktreeGroupChildren(element.repo);
    }

    // If element is an individual worktree: show its branches
    if (element.type === 'worktree' && element.repo) {
      return this.getBranchesForRepo(element.repo);
    }

    // If element is a folder: show branches in that folder
    if (element.type === 'folder' && element.subItems && element.repo) {
      const branches = await this.gitService.getBranches(element.repo);
      return await this.mapToBranchItems(
        element.subItems,
        element.isRemote,
        branches.current,
        (branches as any).currentUpstream,
        element.repo
      );
    }

    return [];
  }

  /**
   * Get children for a main repository (folders + worktrees group)
   */
  private async getRepoChildren(repo: GitRepository): Promise<BranchItem[]> {
    const items: BranchItem[] = [];
    const worktrees = this.gitService.getWorktrees();
    const repoWorktrees = worktrees.filter((w) => w.worktreePath?.startsWith(repo.rootDir));

    // Get branches for this repo
    try {
      const branches = await this.gitService.getBranches(repo);
      const branchNames = this.isRemote
        ? branches.all.filter((b) => b.startsWith('remotes/')).map((b) => b.replace('remotes/', ''))
        : branches.all.filter((b) => !b.startsWith('remotes/'));

      const tree = this.buildTree(branchNames);
      const folderItems = await this.mapToBranchItems(
        tree,
        this.isRemote,
        branches.current,
        (branches as any).currentUpstream,
        repo
      );
      items.push(...folderItems);
    } catch {
      // No branches
    }

    // Add Worktrees group if repo has worktrees
    if (repoWorktrees.length > 0) {
      items.push(
        new BranchItem(
          'Worktrees',
          vscode.TreeItemCollapsibleState.Expanded,
          'worktreeGroup',
          undefined,
          false,
          undefined,
          false,
          undefined,
          repo
        )
      );
    }

    return items;
  }

  /**
   * Get children for a worktree group (individual worktrees)
   */
  private getWorktreeGroupChildren(repo: GitRepository): BranchItem[] {
    const worktrees = this.gitService.getWorktrees();
    const repoWorktrees = worktrees.filter((w) => w.worktreePath?.startsWith(repo.rootDir));

    return repoWorktrees.map(
      (wt) =>
        new BranchItem(
          `${wt.rootDir.split(/[/\\]/).pop()} (${wt.branch})`,
          vscode.TreeItemCollapsibleState.None,
          'worktree',
          undefined,
          false,
          undefined,
          false,
          undefined,
          wt
        )
    );
  }

  /**
   * Get branches for a specific repository.
   */
  private async getBranchesForRepo(repo: GitRepository): Promise<BranchItem[]> {
    try {
      const branches = await this.gitService.getBranches(repo);
      const branchNames = this.isRemote
        ? branches.all.filter((b) => b.startsWith('remotes/')).map((b) => b.replace('remotes/', ''))
        : branches.all.filter((b) => !b.startsWith('remotes/'));

      const tree = this.buildTree(branchNames);
      return await this.mapToBranchItems(
        tree,
        this.isRemote,
        branches.current,
        (branches as any).currentUpstream,
        repo
      );
    } catch {
      return [];
    }
  }

  /**
   * Builds a nested tree structure from flat list of branch names.
   * Splits names by '/' to create folders.
   * @param branchNames - List of branch names.
   * @returns Nested object representing the tree.
   */
  private buildTree(branchNames: string[]): any {
    const root: any = {};
    branchNames.forEach((name) => {
      const parts = name.split('/');
      let current = root;
      parts.forEach((part, i) => {
        if (i === parts.length - 1) {
          current[part] = { _name: name, _isBranch: true };
        } else {
          current[part] = current[part] || {};
          current = current[part];
        }
      });
    });
    return root;
  }

  /**
   * Converts the tree object into BranchItem instances.
   * Handles status calculation for local branches and identifies current/upstream branches.
   * @param tree - The tree object from buildTree.
   * @param isRemote - Whether these are remote branches.
   * @param currentBranch - The currently active local branch name.
   * @param currentUpstream - The upstream of the current branch.
   * @param repo - The repository this branch belongs to.
   */
  private async mapToBranchItems(
    tree: any,
    isRemote: boolean,
    currentBranch?: string,
    currentUpstream?: string,
    repo?: GitRepository
  ): Promise<BranchItem[]> {
    const items = await Promise.all(
      Object.keys(tree).map(async (key) => {
        const node = tree[key];
        if (node._isBranch) {
          let status;
          if (!isRemote && repo) {
            status = await this.gitService.getBranchStatus(node._name, repo);
          }
          const isCurrent = isRemote
            ? node._name === currentUpstream
            : node._name === currentBranch;

          return new BranchItem(
            key,
            vscode.TreeItemCollapsibleState.None,
            'branch',
            node._name,
            isRemote,
            undefined,
            isCurrent,
            status,
            repo
          );
        } else {
          return new BranchItem(
            key,
            vscode.TreeItemCollapsibleState.Collapsed,
            'folder',
            undefined,
            isRemote,
            node,
            false,
            undefined,
            repo
          );
        }
      })
    );
    return items;
  }
}
