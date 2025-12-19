import * as vscode from "vscode";
import { BaseTreeProvider } from "./BaseTreeProvider";
import { GitService } from "../services/GitService";
import { ConfigService } from "../services/ConfigService";

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
    this.tooltip = this.getTooltip(label, hash, description, authorEmail);
    this.contextValue = "commit";

    this.iconPath = this.getDotIcon(label, isLatest);

    this.command = {
      command: "gitorbit.openCommitDiff",
      title: "Open Commit Diff",
      arguments: [this],
    };
  }

  private getTooltip(
    label: string,
    hash: string,
    authorInfo: string,
    email: string
  ): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.supportHtml = true;

    // authorInfo is "Name • Date"
    const [name, date] = authorInfo.split(" • ");
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      name || "Unknown"
    )}&background=38bdf8&color=fff&rounded=true&size=32`;

    tooltip.appendMarkdown(
      `<table><tr><td><img src="${avatarUrl}" width="32" height="32" /></td><td>&nbsp;&nbsp;<b>${name}</b></td></tr></table>\n\n`
    );
    tooltip.appendMarkdown(`> **${label}**\n\n`);
    tooltip.appendMarkdown(`---\n\n`);
    tooltip.appendMarkdown(`📅 ${date || ""}  \n`);
    tooltip.appendMarkdown(`🆔 \`${hash.substring(0, 7)}\`  \n`);
    if (email) {
      tooltip.appendMarkdown(`📧 \`${email}\`  \n`);
    }
    tooltip.appendMarkdown(`\n*Click to view changes*`);

    return tooltip;
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
    const items: (CommitItem | vscode.TreeItem)[] = log.all.map(
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

    if (log.all.length >= this.limit) {
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
