import * as vscode from "vscode";
import { BaseTreeProvider } from "./BaseTreeProvider";
import { GitService } from "../services/GitService";
import { CommitItem } from "./CommitTreeProvider";
import { ConfigService } from "../services/ConfigService";

export class FileHistoryProvider extends BaseTreeProvider<
  CommitItem | vscode.TreeItem
> {
  private gitService: GitService;
  private limit: number = 20;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
    this.limit = ConfigService.getInstance().commitLimit;

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.uri.scheme === "file") {
        this.refresh();
      }
    });

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gitorbit.views.commitLimit")) {
        this.limit = ConfigService.getInstance().commitLimit;
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

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return [];

    const filePath = activeEditor.document.uri.fsPath;
    const log = await this.gitService.getFileHistory(filePath, this.limit);

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
          filePath,
          index === 0,
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
  }

  public incrementLimit() {
    this.limit += 20;
    this.refresh();
  }
}
