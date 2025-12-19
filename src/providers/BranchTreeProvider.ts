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
    public readonly isCurrent: boolean = false,
    public readonly status?: { ahead: number; behind: number }
  ) {
    super(label, collapsibleState);
    this.contextValue =
      type === "branch"
        ? isRemote
          ? "remoteBranch"
          : isCurrent
          ? "localBranchCurrent"
          : "localBranchNotCurrent"
        : "folder";

    if (type === "branch") {
      this.iconPath = new vscode.ThemeIcon(
        "git-branch",
        isCurrent ? new vscode.ThemeColor("charts.green") : undefined
      );

      const parts = [];
      if (isCurrent) parts.push("(current)");

      if (status) {
        if (status.ahead > 0) parts.push(`↑${status.ahead}`);
        if (status.behind > 0) parts.push(`↓${status.behind}`);
      }

      this.description = parts.join(" ");

      if (status) {
        this.tooltip = `Ahead: ${status.ahead}, Behind: ${status.behind}`;
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
        return await this.mapToBranchItems(
          element.subItems,
          element.isRemote,
          branches.current,
          (branches as any).currentUpstream
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
      return await this.mapToBranchItems(
        tree,
        this.isRemote,
        branches.current,
        (branches as any).currentUpstream
      );
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

  private async mapToBranchItems(
    tree: any,
    isRemote: boolean,
    currentBranch?: string,
    currentUpstream?: string
  ): Promise<BranchItem[]> {
    const items = await Promise.all(
      Object.keys(tree).map(async (key) => {
        const node = tree[key];
        if (node._isBranch) {
          let status;
          if (!isRemote) {
            status = await this.gitService.getBranchStatus(node._name);
          }
          const isCurrent = isRemote
            ? node._name === currentUpstream
            : node._name === currentBranch;

          return new BranchItem(
            key,
            vscode.TreeItemCollapsibleState.None,
            "branch",
            node._name,
            isRemote,
            undefined,
            isCurrent,
            status
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
      })
    );
    return items;
  }
}
