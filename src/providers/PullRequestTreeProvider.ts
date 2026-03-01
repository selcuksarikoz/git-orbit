import * as vscode from 'vscode';
import { PullRequest, PullRequestService } from '../services/PullRequestService';
import { GitRepository } from '../services/GitService';

class PRItem extends vscode.TreeItem {
  constructor(public readonly pr: PullRequest) {
    super(pr.title, vscode.TreeItemCollapsibleState.None);

    const repoName = pr.repo ? pr.repo.rootDir.split(/[/\\]/).pop() : '';
    this.description = `#${pr.number} by ${pr.author.login}${repoName ? ` [${repoName}]` : ''}`;
    this.tooltip = `${pr.title} (${pr.state})\nCreated at: ${new Date(pr.createdAt).toLocaleString()}\nRepo: ${repoName || 'Unknown'}`;

    this.iconPath = new vscode.ThemeIcon(
      'git-pull-request',
      pr.state === 'open' ? new vscode.ThemeColor('charts.green') : undefined
    );

    this.command = {
      command: 'gitorbit.openPR',
      title: 'Open PR',
      arguments: [pr],
    };
  }
}

class SignInItem extends vscode.TreeItem {
  constructor() {
    super('Sign in to GitHub to view PRs', vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: 'gitorbit.pullRequests.login',
      title: 'Sign in',
    };
    this.iconPath = new vscode.ThemeIcon('sign-in');
  }
}

class CreatePRItem extends vscode.TreeItem {
  constructor(public readonly repo?: GitRepository) {
    super(
      repo ? `Create PR for ${repo.rootDir.split(/[/\\]/).pop()}` : 'Create Pull Request',
      vscode.TreeItemCollapsibleState.None
    );
    this.command = {
      command: 'gitorbit.pullRequests.create',
      title: 'Create Pull Request',
      arguments: repo ? [repo] : [],
    };
    this.iconPath = new vscode.ThemeIcon('add');
    this.contextValue = 'createPR';
  }
}

class RepoGroupItem extends vscode.TreeItem {
  constructor(
    public readonly repo: GitRepository,
    prCount: number
  ) {
    const folderName = repo.rootDir.split(/[/\\]/).pop() || 'Repository';
    super(folderName, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `(${prCount} PRs)`;
    this.tooltip = repo.rootDir;
    this.iconPath = new vscode.ThemeIcon('repo');
    this.contextValue = 'repoGroup';
  }
}

export class PullRequestTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private _prs: PullRequest[] = [];

  async refresh() {
    this._prs = await PullRequestService.getInstance().getPullRequests();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element instanceof RepoGroupItem) {
      // Show PRs for this repo
      const repoPRs = this._prs.filter((pr) => pr.repo?.rootDir === element.repo.rootDir);
      return repoPRs.map((pr) => new PRItem(pr));
    }

    if (element) return [];

    // Root level
    try {
      const session = await vscode.authentication.getSession('github', ['repo'], {
        createIfNone: false,
      });
      if (!session) {
        return [new SignInItem()];
      }

      // Load PRs if not loaded
      if (this._prs.length === 0) {
        this._prs = await PullRequestService.getInstance().getPullRequests();
      }

      // Group PRs by repository
      const prsByRepo = new Map<string, PullRequest[]>();
      for (const pr of this._prs) {
        const repoRoot = pr.repo?.rootDir || 'unknown';
        const existing = prsByRepo.get(repoRoot) || [];
        existing.push(pr);
        prsByRepo.set(repoRoot, existing);
      }

      // Get all repos with remotes
      const { GitService } = await import('../services/GitService.js');
      const gitService = GitService.getInstance();
      const repos = gitService.getRepositories();
      const reposWithRemotes = repos.filter((r: GitRepository) =>
        r.remoteUrl?.includes('github.com')
      );

      const items: vscode.TreeItem[] = [];

      // Show repo groups if multiple repos with PRs
      if (reposWithRemotes.length > 1) {
        for (const repo of reposWithRemotes) {
          const repoPRs = prsByRepo.get(repo.rootDir) || [];
          items.push(new RepoGroupItem(repo, repoPRs.length));

          // If no PRs for this repo, show empty placeholder
          if (repoPRs.length === 0) {
            const empty = new vscode.TreeItem('No open pull requests');
            empty.contextValue = 'empty';
            items.push(empty);
          }
        }

        // Add create buttons for each repo
        items.push(new vscode.TreeItem('', vscode.TreeItemCollapsibleState.None)); // Spacer
        for (const repo of reposWithRemotes) {
          items.push(new CreatePRItem(repo));
        }
      } else {
        // Single repo mode - show PRs directly
        items.push(new CreatePRItem(reposWithRemotes[0]));

        if (this._prs.length === 0) {
          const empty = new vscode.TreeItem('No open pull requests');
          empty.contextValue = 'empty';
          items.push(empty);
        } else {
          items.push(...this._prs.map((pr) => new PRItem(pr)));
        }
      }

      return items;
    } catch (e) {
      return [new vscode.TreeItem('Error loading PRs')];
    }
  }

  async login() {
    await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
    this.refresh();
  }

  async createPR(repo?: GitRepository) {
    // 1. Get git service
    const { GitService } = await import('../services/GitService.js');
    const gitService = GitService.getInstance();
    const repos = gitService.getRepositories();

    // If no repo specified and multiple repos, ask user
    let targetRepo = repo;
    if (!targetRepo && repos.length > 1) {
      const repoOptions = repos
        .filter((r: GitRepository) => r.remoteUrl?.includes('github.com'))
        .map((r: GitRepository) => ({
          label: r.rootDir.split(/[/\\]/).pop() || r.rootDir,
          description: r.rootDir,
          repo: r,
        }));

      if (repoOptions.length === 0) {
        vscode.window.showErrorMessage('No GitHub repositories found.');
        return;
      }

      const selected = await vscode.window.showQuickPick(repoOptions, {
        placeHolder: 'Select repository to create PR',
      });

      if (!selected) return;
      targetRepo = selected.repo;
    } else if (!targetRepo) {
      targetRepo = repos[0];
    }

    if (!targetRepo) {
      vscode.window.showErrorMessage('No repository found.');
      return;
    }

    // 2. Get current branch for this repo
    const branches = await gitService.getBranches(targetRepo);
    const currentBranch = branches.current;

    if (!currentBranch) {
      vscode.window.showErrorMessage('No active branch found.');
      return;
    }

    // 3. Simple QuickPick/Input workflow for MVP.
    const title = await vscode.window.showInputBox({
      title: 'Create Pull Request',
      prompt: 'Title',
      value: currentBranch, // Default to branch name
      ignoreFocusOut: true,
    });
    if (!title) return;

    const description = await vscode.window.showInputBox({
      title: 'Create Pull Request',
      prompt: 'Description',
      placeHolder: 'Describe your changes...',
      ignoreFocusOut: true,
    });

    // Default base to main/master usually, scanning for it
    const baseOptions = branches.all.filter((b: string) =>
      ['main', 'master', 'develop'].includes(b)
    );
    let base = 'main';
    if (baseOptions.length > 0) base = baseOptions[0];

    // Allow user to select base
    const selectedBase = await vscode.window.showQuickPick(branches.all, {
      title: 'Select Base Branch',
      placeHolder: 'Select the branch you want to merge into',
    });
    if (selectedBase) base = selectedBase;

    // Create
    const url = await PullRequestService.getInstance().createPullRequest(
      targetRepo,
      title,
      description || '',
      currentBranch,
      base
    );

    if (url) {
      const action = await vscode.window.showInformationMessage(
        'Pull Request Created!',
        'Open in Browser'
      );
      if (action === 'Open in Browser') {
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
      this.refresh();
    }
  }
}
