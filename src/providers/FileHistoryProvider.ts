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
  private currentFilePath: string | undefined;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
    this.limit = ConfigService.getInstance().commitLimit;

    this.updateCurrentFile();
    vscode.window.onDidChangeActiveTextEditor(() => this.updateCurrentFile());

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gitorbit.views.commitLimit")) {
        this.limit = ConfigService.getInstance().commitLimit;
        this.refresh();
      }
    });
  }

  private updateCurrentFile() {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      // If no editor is open, or focus moved away from editors (e.g. to terminal)
      // We check visible editors to see if we should really clear it.
      if (vscode.window.visibleTextEditors.length === 0) {
        if (this.currentFilePath !== undefined) {
          this.currentFilePath = undefined;
          this.refresh();
        }
      }
      return;
    }

    const uri = editor.document.uri;
    let filePath: string | undefined;

    if (uri.scheme === "file") {
      filePath = uri.fsPath;
    } else if (uri.scheme === "gitorbit-git") {
      // In GitContentProvider, uri.path is the file path
      filePath = uri.path;
    } else if (uri.scheme === "gitorbit-diff") {
      // In DiffContentProvider, path is encoded in query
      try {
        const query = JSON.parse(uri.query);
        filePath = query.filePath;
      } catch {
        filePath = uri.path;
      }
    }

    if (filePath) {
      // Normalize path (Git likes / even on Windows)
      const normalizedPath = filePath.replace(/\\/g, "/");
      if (normalizedPath !== this.currentFilePath) {
        this.currentFilePath = normalizedPath;
        this.refresh();
      }
    }
  }

  getTreeItem(element: CommitItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: CommitItem | vscode.TreeItem
  ): Promise<(CommitItem | vscode.TreeItem)[]> {
    if (!this.gitService.isInitialized()) return [];
    if (element) return [];

    if (!this.currentFilePath) return [];

    const log = await this.gitService.getFileHistory(
      this.currentFilePath,
      this.limit
    );

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
          this.currentFilePath,
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
        command: "gitorbit.fileHistory.loadMore",
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
