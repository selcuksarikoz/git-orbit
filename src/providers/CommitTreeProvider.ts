import * as vscode from "vscode";
import { BaseTreeProvider } from "./BaseTreeProvider";
import { GitService } from "../services/GitService";
import { ConfigService } from "../services/ConfigService";

import { TooltipGenerator } from "../utils/TooltipGenerator";

export class CommitItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly hash: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None,
    public readonly filePath?: string,
    public readonly isLatest: boolean = false,
    public readonly authorEmail: string = ""
  ) {
    super(label, collapsibleState);
    const [name, date] = description.split(" • ");
    this.tooltip = TooltipGenerator.generateCommitTooltip(
      name,
      authorEmail,
      label, // message
      date,
      hash
    );

    this.contextValue = "commit";

    this.iconPath = this.getDotIcon(label, isLatest);

    this.command = {
      command: "gitorbit.openCommitDiff",
      title: "Open Commit Diff",
      arguments: [this],
    };
  }

  private getDotIcon(
    message: string,
    isLatest: boolean
  ): vscode.ThemeIcon | undefined {
    const msg = message.toLowerCase();
    let colorId = "charts.gray"; // Default to gray
    if (msg.startsWith("feat")) colorId = "charts.blue";
    else if (msg.startsWith("fix")) colorId = "charts.red";
    else if (msg.startsWith("refactor")) colorId = "charts.gray";

    return new vscode.ThemeIcon(
      isLatest ? "record" : "primitive-dot",
      new vscode.ThemeColor(colorId)
    );
  }
}

export class CommitTreeProvider extends BaseTreeProvider<
  CommitItem | vscode.TreeItem
> {
  private gitService: GitService;
  private configService: ConfigService;
  private limit: number;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
    this.configService = ConfigService.getInstance();
    this.limit = this.configService.commitLimit;

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gitorbit.views.commitLimit")) {
        this.limit = this.configService.commitLimit;
        this.refresh();
      }
    });
  }

  getTreeItem(element: CommitItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: CommitItem | vscode.TreeItem
  ): Promise<(CommitItem | vscode.TreeItem)[]> {
    if (!this.gitService.isInitialized()) return [];
    if (element) return [];

    const log = await this.gitService.getLog(this.limit);

    let commits = log.all;
    if (this.filterText) {
      const search = this.filterText.toLowerCase();
      commits = commits.filter(
        (c) =>
          c.message.toLowerCase().includes(search) ||
          c.hash.toLowerCase().includes(search) ||
          c.author_name.toLowerCase().includes(search)
      );
    }

    const items: (CommitItem | vscode.TreeItem)[] = commits.map(
      (commit, index) =>
        new CommitItem(
          commit.message,
          `${commit.author_name} • ${commit.date}`,
          commit.hash,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          index === 0, // Mark first commit as latest
          commit.author_email
        )
    );

    if (log.all.length >= this.limit && !this.filterText) {
      const loadMoreItem = new vscode.TreeItem(
        "Load More...",
        vscode.TreeItemCollapsibleState.None
      );
      loadMoreItem.command = {
        command: "gitorbit.loadMoreCommits",
        title: "Load More",
      };
      loadMoreItem.iconPath = new vscode.ThemeIcon("add");
      items.push(loadMoreItem);
    }

    return items;
  }

  public incrementLimit() {
    this.limit += 20;
    this.refresh();
  }
}
