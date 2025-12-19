import * as vscode from "vscode";
import { GitService } from "../services/GitService";

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = "gitorbit-git";

  provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const authority = decodeURIComponent(uri.authority);
    const hash = authority === "INDEX" ? "" : authority;
    const path = uri.path.startsWith("/") ? uri.path.substring(1) : uri.path;
    // For index content, we use :0:path to specify the stage clearly
    const ref = authority === "INDEX" ? `:0:${path}` : `${hash}:${path}`;

    return GitService.getInstance().showFileContentRaw(ref);
  }

  static getUri(hash: string, path: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: GitContentProvider.scheme,
      authority: hash,
      path: path.startsWith("/") ? path : `/${path}`,
    });
  }
}
