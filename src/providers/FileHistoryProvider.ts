import * as vscode from "vscode";
import { BaseTreeProvider } from "./BaseTreeProvider";
import { GitService } from "../services/GitService";
import { CommitItem } from "./CommitTreeProvider";

export class FileHistoryProvider extends BaseTreeProvider<CommitItem> {
  private gitService: GitService;

  constructor() {
    super();
    this.gitService = GitService.getInstance();
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.uri.scheme === "file") {
        this.refresh();
      }
    });
  }

  getTreeItem(element: CommitItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CommitItem): Promise<CommitItem[]> {
    if (!this.gitService.isInitialized()) return [];
    if (element) return [];

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return [];

    const filePath = activeEditor.document.uri.fsPath;
    const log = await this.gitService.getFileHistory(filePath);

    return log.all.map(
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
  }
}
