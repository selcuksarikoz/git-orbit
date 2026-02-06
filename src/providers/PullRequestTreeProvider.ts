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

export class PullRequestTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor() {}

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return [];

    try {
        // fast check if session exists
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
        if (!session) {
            return [new SignInItem()];
        }

        const prs = await PullRequestService.getInstance().getPullRequests();
        if (prs.length === 0) {
            const item = new vscode.TreeItem('No open pull requests');
            item.contextValue = 'empty';
            return [item];
        }
        return prs.map(pr => new PRItem(pr));
    } catch (e) {
        return [new vscode.TreeItem('Error loading PRs')];
    }
  }

  async login() {
      await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
      this.refresh();
  }
}
