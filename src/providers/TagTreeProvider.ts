import * as vscode from 'vscode';
import { BaseTreeProvider } from './BaseTreeProvider';
import { GitService } from '../services/GitService';

export class TagItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly hash: string,
    public readonly date: string,
    public readonly subject: string,
    public readonly type: 'tag' | 'branch',
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.contextValue = type;

    if (type === 'tag') {
      this.iconPath = new vscode.ThemeIcon('tag');
      this.description = date;
      this.tooltip = `${label}\nCommit: ${hash.substring(0, 7)}\nDate: ${date}\nMessage: ${subject}`;
    } else {
      this.iconPath = new vscode.ThemeIcon('git-branch');
      const isRemote = label.startsWith('remotes/');
      if (isRemote) {
        this.iconPath = new vscode.ThemeIcon('cloud');
      }
    }
  }
}

export class TagTreeProvider extends BaseTreeProvider<TagItem> {
  private gitService: GitService;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
  }

  getTreeItem(element: TagItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TagItem): Promise<TagItem[]> {
    if (!this.gitService.isInitialized()) return [];

    // Get selected repository for multi-repo support
    const repo = this.gitService.getSelectedRepository();

    if (!element) {
      try {
        const tags = await this.gitService.getTags(repo);
        return tags.map(
          (tag) =>
            new TagItem(
              tag.name,
              tag.hash,
              tag.date,
              tag.subject,
              'tag',
              vscode.TreeItemCollapsibleState.Collapsed
            )
        );
      } catch {
        return [];
      }
    }

    if (element.type === 'tag') {
      try {
        const branches = await this.gitService.getBranchesForTag(element.label, repo);
        return branches.map(
          (branch) =>
            new TagItem(branch, '', '', '', 'branch', vscode.TreeItemCollapsibleState.None)
        );
      } catch {
        return [];
      }
    }

    return [];
  }
}
