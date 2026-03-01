import * as vscode from 'vscode';
import { BaseTreeProvider } from './BaseTreeProvider';
import { GitService } from '../services/GitService';

export class ContributorItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly email: string,
    public readonly commitCount: number,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(name, collapsibleState);
    this.description = `${commitCount} commits`;
    this.contextValue = 'contributor';
    this.iconPath = new vscode.ThemeIcon('person');

    // Rich tooltip with information
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`### ${name}\n\n`);
    tooltip.appendMarkdown(`**Email:** ${email}\n\n`);
    tooltip.appendMarkdown(`**Total Commits:** ${commitCount}\n\n`);
    tooltip.appendMarkdown(`---\n\n`);
    tooltip.appendMarkdown(
      `[Search for User on GitHub](https://github.com/search?q=${encodeURIComponent(email)}&type=users)`
    );
    tooltip.isTrusted = true;
    this.tooltip = tooltip;
  }
}

export class ContributorTreeProvider extends BaseTreeProvider<ContributorItem> {
  private gitService: GitService;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
  }

  getTreeItem(element: ContributorItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ContributorItem): Promise<ContributorItem[]> {
    if (!this.gitService.isInitialized()) return [];
    if (element) return [];

    // Get selected repository for multi-repo support
    const repo = this.gitService.getSelectedRepository();

    try {
      const contributors = await this.gitService.getContributors(repo);
      return contributors.map(
        (c) => new ContributorItem(c.name, c.email, c.count, vscode.TreeItemCollapsibleState.None)
      );
    } catch {
      return [];
    }
  }
}
