import * as vscode from "vscode";
import { BaseTreeProvider } from "./BaseTreeProvider";
import { GitService } from "../services/GitService";
import { ConfigService } from "../services/ConfigService";
import { StatusDecorationProvider } from "./StatusDecorationProvider";
import { TooltipGenerator } from "../utils/TooltipGenerator";

export class GraphTreeProvider extends BaseTreeProvider<
  GraphItem | vscode.TreeItem
> {
  private gitService: GitService;
  private limit: number = 50;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
    this.limit = ConfigService.getInstance().commitLimit;

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gitorbit.views.commitLimit")) {
        this.limit = ConfigService.getInstance().commitLimit;
        this.refresh();
      }
    });
  }

  getTreeItem(element: GraphItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  resolveTreeItem(
    item: vscode.TreeItem,
    element: GraphItem | vscode.TreeItem
  ): vscode.ProviderResult<vscode.TreeItem> {
    if (element instanceof GraphItem) {
      element.resolveTooltip();
    }
    return element;
  }

  async getChildren(
    element?: GraphItem | vscode.TreeItem
  ): Promise<(GraphItem | vscode.TreeItem)[]> {
    if (element instanceof vscode.TreeItem && !(element instanceof GraphItem)) {
      return [];
    }

    const graphElement = element as GraphItem | undefined;

    if (!graphElement) {
      // Root: All commits
      const log = await this.gitService.getAllLog(this.limit);

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

      const items: (GraphItem | vscode.TreeItem)[] = commits.map(
        (commit, index) =>
          new GraphItem(
            commit.message,
            commit.author_name,
            commit.date,
            commit.hash,
            vscode.TreeItemCollapsibleState.Collapsed,
            "commit",
            index === 0,
            commit.refs,
            commit.author_email
          )
      );

      if (log.all.length >= this.limit && !this.filterText) {
        const loadMoreItem = new vscode.TreeItem(
          "Load More...",
          vscode.TreeItemCollapsibleState.None
        );
        loadMoreItem.command = {
          command: "gitorbit.loadMoreCommits", // Reuse existing command
          title: "Load More",
        };
        loadMoreItem.iconPath = new vscode.ThemeIcon("add");
        items.push(loadMoreItem);
      }

      return items;
    } else if (graphElement.type === "commit") {
      // Expand commit to show changed files (folder structure)
      const files = await this.gitService.getChangedFilesWithStatus(
        graphElement.hash
      );
      const tree = this.buildFileTree(files);
      return this.mapToFileItems(tree, graphElement.hash);
    } else if (graphElement.type === "folder" && graphElement.subItems) {
      return this.mapToFileItems(graphElement.subItems, graphElement.hash);
    }
    return [];
  }

  private buildFileTree(files: { path: string; status: string }[]) {
    const root: any = {};
    files.forEach((file) => {
      const parts = file.path.split(/[\\\/]/);
      let current = root;
      parts.forEach((part, i) => {
        if (i === parts.length - 1) {
          current[part] = {
            _isFile: true,
            _path: file.path,
            _status: file.status,
          };
        } else {
          if (!current[part]) current[part] = {};
          current = current[part];
        }
      });
    });
    return root;
  }

  private mapToFileItems(tree: any, hash: string): GraphItem[] {
    return Object.keys(tree).map((key) => {
      const node = tree[key];
      if (node._isFile) {
        return new GraphItem(
          key,
          "",
          "",
          hash,
          vscode.TreeItemCollapsibleState.None,
          "file",
          false,
          "",
          "",
          node._path,
          node._status
        );
      } else {
        return new GraphItem(
          key,
          "",
          "",
          hash,
          vscode.TreeItemCollapsibleState.Collapsed,
          "folder",
          false,
          "",
          "",
          undefined,
          undefined,
          node
        );
      }
    });
  }

  public incrementLimit() {
    this.limit += 20;
    this.refresh();
  }
}

export class GraphItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly authorName: string,
    public readonly dateString: string,
    public readonly hash: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: "commit" | "folder" | "file",
    public readonly isLatest: boolean = false,
    public readonly refs: string = "",
    public readonly authorEmail: string = "",
    public readonly filePath?: string,
    public readonly status?: string,
    public readonly subItems?: any
  ) {
    super(label, collapsibleState);
    this.contextValue = type;

    if (type === "commit") {
      this.iconPath = this.getCommitIcon(label, isLatest);
      this.description = refs ? `${refs} • ${dateString}` : dateString;
    } else if (type === "file") {
      this.iconPath = vscode.ThemeIcon.File;
      if (this.filePath && this.status) {
        this.resourceUri = StatusDecorationProvider.getUri(
          this.filePath,
          this.status
        );
      } else if (this.filePath) {
        this.resourceUri = vscode.Uri.file(this.filePath);
      }
      this.description = ""; // Removed status from here, now displayed as decoration
      this.command = {
        command: "gitorbit.openCommitDiff",
        title: "Open Diff",
        arguments: [{ hash: this.hash, filePath: this.filePath }],
      };
    } else {
      this.iconPath = vscode.ThemeIcon.Folder;
    }
  }

  public resolveTooltip() {
    if (this.type === "commit" && !this.tooltip) {
      this.tooltip = TooltipGenerator.generateCommitTooltip(
        this.authorName,
        this.authorEmail,
        this.label, // message
        this.dateString,
        this.hash,
        this.refs
      );
    } else if (this.type === "file" && !this.tooltip) {
      this.tooltip = this.getFileTooltip(
        this.label,
        this.status,
        this.filePath
      );
    }
  }

  private getFileTooltip(
    label: string,
    status?: string,
    path?: string
  ): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    let statusText = "Modified";
    if (status === "A") statusText = "Added";
    if (status === "D") statusText = "Deleted";

    tooltip.appendMarkdown(`**${label}**\n\n`);
    tooltip.appendMarkdown(
      `**Status:** ${statusText} (${status || "Unknown"})\n\n`
    );
    if (path) {
      tooltip.appendMarkdown(`**Path:** \`${path}\``);
    }
    return tooltip;
  }

  private getCommitIcon(message: string, isLatest: boolean): vscode.ThemeIcon {
    const msg = message.toLowerCase();
    let colorId = "charts.gray";
    if (msg.startsWith("feat")) colorId = "charts.blue";
    else if (msg.startsWith("fix")) colorId = "charts.red";
    else if (msg.startsWith("refactor")) colorId = "charts.gray";

    return new vscode.ThemeIcon(
      isLatest ? "record" : "primitive-dot",
      new vscode.ThemeColor(colorId)
    );
  }
}
