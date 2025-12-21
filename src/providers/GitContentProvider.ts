import * as vscode from "vscode";
import { GitService } from "../services/GitService";

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = "gitorbit-git";

  provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const authority = decodeURIComponent(uri.authority);
    const gitService = GitService.getInstance();
    const relativePath = gitService.getRelativePath(uri.path);

    if (authority === "EMPTY") {
      return Promise.resolve("");
    }

    if (authority.toUpperCase() === "INDEX") {
      // For index content, we use :0:path to specify the stage clearly
      return gitService.showFileContentRaw(`:0:${relativePath}`);
    }

    return gitService.showFileContentRaw(`${authority}:${relativePath}`);
  }

  static getUri(hash: string, path: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: GitContentProvider.scheme,
      authority: hash,
      path: path.startsWith("/") ? path : `/${path}`,
    });
  }
}
