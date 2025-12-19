import * as vscode from "vscode";
import { BaseTreeProvider } from "./BaseTreeProvider";
import { GitService } from "../services/GitService";
import { IconService } from "../services/IconService";

export class BranchItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: "folder" | "branch",
    public readonly branchName?: string,
    public readonly isRemote: boolean = false,
    public readonly subItems?: any,
    public readonly isCurrent: boolean = false
  ) {
    super(label, collapsibleState);
    this.contextValue =
      type === "branch"
        ? isRemote
          ? "remoteBranch"
          : "localBranch"
        : "folder";

    if (type === "branch") {
      this.iconPath = new vscode.ThemeIcon(
        "git-branch",
        isCurrent ? new vscode.ThemeColor("charts.green") : undefined
      );
      if (isCurrent) {
        this.description = "(current)";
      }
    }
  }
}

export class BranchTreeProvider extends BaseTreeProvider<BranchItem> {
  private gitService: GitService;

  constructor(private readonly isRemote: boolean) {
    super();
    this.gitService = GitService.getInstance();
  }

  getTreeItem(element: BranchItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BranchItem): Promise<BranchItem[]> {
    if (!this.gitService.isInitialized()) return [];

    if (element) {
      if (element.type === "folder" && element.subItems) {
        const branches = await this.gitService.getBranches();
        return this.mapToBranchItems(
          element.subItems,
          element.isRemote,
          branches.current
        );
      }
      return [];
    }

    try {
      const branches = await this.gitService.getBranches();
      const branchNames = this.isRemote
        ? branches.all
            .filter((b) => b.startsWith("remotes/"))
            .map((b) => b.replace("remotes/", ""))
        : branches.all.filter((b) => !b.startsWith("remotes/"));

      const tree = this.buildTree(branchNames);
      return this.mapToBranchItems(tree, this.isRemote, branches.current);
    } catch {
      return [];
    }
  }

  private buildTree(branchNames: string[]): any {
    const root: any = {};
    branchNames.forEach((name) => {
      const parts = name.split("/");
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

  private mapToBranchItems(
    tree: any,
    isRemote: boolean,
    currentBranch?: string
  ): BranchItem[] {
    return Object.keys(tree).map((key) => {
      const node = tree[key];
      if (node._isBranch) {
        return new BranchItem(
          key,
          vscode.TreeItemCollapsibleState.None,
          "branch",
          node._name,
          isRemote,
          undefined,
          node._name === currentBranch
        );
      } else {
        return new BranchItem(
          key,
          vscode.TreeItemCollapsibleState.Collapsed,
          "folder",
          undefined,
          isRemote,
          node
        );
      }
    });
  }
}
