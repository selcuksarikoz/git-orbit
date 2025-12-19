import * as vscode from "vscode";
import { BaseTreeProvider } from "./BaseTreeProvider";
import { GitService } from "../services/GitService";

export class StashItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly type: "stash" | "file",
    public readonly index?: number, // stash index
    public readonly filePath?: string
  ) {
    super(
      label,
      type === "stash"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = type;

    if (type === "stash") {
      this.iconPath = new vscode.ThemeIcon("archive");
      this.description = `stash@{${index}}`;
    } else {
      this.iconPath = vscode.ThemeIcon.File;
      this.resourceUri = vscode.Uri.file(filePath || "");
    }
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

    // Root: List Stashes
    if (!element) {
      const stashes = await this.gitService.getStashes();
      return stashes.all.map(
        (stash) => new StashItem(stash.message, "stash", stash.index)
      );
    }

    // Stash content: List changed files
    if (element.type === "stash" && element.index !== undefined) {
      const files = await this.gitService.getStashFiles(element.index);
      return files.map(
        (file) => new StashItem(file, "file", element.index, file)
      );
    }

    return [];
  }
}
