import * as vscode from "vscode";
import { GitService } from "../services/GitService";

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = "gitorbit-git";

  provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const hash = decodeURIComponent(uri.authority);
    const path = uri.path;
    return GitService.getInstance().showFileContent(hash, path);
  }

  static getUri(hash: string, path: string): vscode.Uri {
    return vscode.Uri.parse(
      `${GitContentProvider.scheme}://${encodeURIComponent(hash)}${
        path.startsWith("/") ? "" : "/"
      }${path}`
    );
  }
}
