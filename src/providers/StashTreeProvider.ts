import * as vscode from "vscode";
import { BaseTreeProvider } from "./BaseTreeProvider";
import { GitService } from "../services/GitService";

export class StashItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly index: number,
    public readonly description: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "stash";
    this.iconPath = new vscode.ThemeIcon("archive");
  }
}

export class StashTreeProvider extends BaseTreeProvider<StashItem> {
  private gitService: GitService;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
  }

  getTreeItem(element: StashItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: StashItem): Promise<StashItem[]> {
    if (!this.gitService.isInitialized()) return [];
    if (element) return [];

    const stashes = await this.gitService.getStashes();
    return stashes.all.map(
      (stash, index) => new StashItem(stash.message, index, `stash@{${index}}`)
    );
  }
}
