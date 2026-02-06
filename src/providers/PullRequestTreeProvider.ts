import * as vscode from 'vscode';
import { PullRequest, PullRequestService } from '../services/PullRequestService';

class PRItem extends vscode.TreeItem {
  constructor(public readonly pr: PullRequest) {
    super(pr.title, vscode.TreeItemCollapsibleState.None);

    this.description = `#${pr.number} by ${pr.author.login}`;
    this.tooltip = `${pr.title} (${pr.state})\nCreated at: ${new Date(pr.createdAt).toLocaleString()}`;

    this.iconPath = new vscode.ThemeIcon(
        'git-pull-request',
        pr.state === 'open' ? new vscode.ThemeColor('charts.green') : undefined
    );

    this.command = {
        command: 'vscode.open',
        title: 'Open PR',
        arguments: [vscode.Uri.parse(pr.url)]
    };
  }
}

class SignInItem extends vscode.TreeItem {
    constructor() {
        super('Sign in to GitHub to view PRs', vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: 'gitorbit.pullRequests.login',
            title: 'Sign in'
        };
        this.iconPath = new vscode.ThemeIcon('sign-in');
    }
}

class CreatePRItem extends vscode.TreeItem {
    constructor() {
        super('Create Pull Request', vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: 'gitorbit.pullRequests.create',
            title: 'Create Pull Request'
        };
        this.iconPath = new vscode.ThemeIcon('add');
    }
}

export class PullRequestTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  // ... (previous events)
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  async refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return [];

    try {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
        if (!session) {
            return [new SignInItem()];
        }

        const prs = await PullRequestService.getInstance().getPullRequests();

        // Show "Create PR" button
        const items: vscode.TreeItem[] = [new CreatePRItem()];

        if (prs.length === 0) {
            const empty = new vscode.TreeItem('No open pull requests');
            empty.contextValue = 'empty';
            items.push(empty);
        } else {
            items.push(...prs.map(pr => new PRItem(pr)));
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

  async createPR() {
      // 1. Get current branch
      const gitService = (await import('../services/GitService')).GitService.getInstance(); // Lazy import to avoid circular dep if any
      const branches = await gitService.getBranches();
      const currentBranch = branches.current;

      if (!currentBranch) {
          vscode.window.showErrorMessage('No active branch found.');
          return;
      }

      // 2. Simple QuickPick/Input workflow for MVP.
      const title = await vscode.window.showInputBox({
          title: 'Create Pull Request',
          prompt: 'Title',
          value: currentBranch, // Default to branch name
          ignoreFocusOut: true
      });
      if (!title) return;

      const description = await vscode.window.showInputBox({
          title: 'Create Pull Request',
          prompt: 'Description',
          placeHolder: 'Describe your changes...',
          ignoreFocusOut: true
      });

      // Default base to main/master usually, scanning for it
      const baseOptions = branches.all.filter(b => ['main', 'master', 'develop'].includes(b));
      let base = 'main';
      if (baseOptions.length > 0) base = baseOptions[0];

      // Allow user to select base
      const selectedBase = await vscode.window.showQuickPick(branches.all, {
          title: 'Select Base Branch',
          placeHolder: 'Select the branch you want to merge into',
      });
      if (selectedBase) base = selectedBase;

      // Create
      const url = await PullRequestService.getInstance().createPullRequest(title, description || '', currentBranch, base);

      if (url) {
          const action = await vscode.window.showInformationMessage('Pull Request Created!', 'Open in Browser');
          if (action === 'Open in Browser') {
              vscode.env.openExternal(vscode.Uri.parse(url));
          }
          this.refresh();
      }
  }
}
