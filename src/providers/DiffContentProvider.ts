import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'gitorbit-diff';

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const hash = decodeURIComponent(uri.authority);
    let filePath: string | undefined;
    let repoRoot: string | undefined;
    if (uri.query) {
      try {
        const query = JSON.parse(uri.query);
        filePath = query.filePath;
        repoRoot = query.repoRoot;
      } catch {}
    }

    const targetRepo = repoRoot ? GitService.getInstance().getRepositoryByRoot(repoRoot) : undefined;
    return GitService.getInstance().getDiff(hash, filePath, true, targetRepo);
  }

  static getUri(hash: string, filePath?: string, repoRoot?: string): vscode.Uri {
    const queryPayload: { filePath?: string; repoRoot?: string } = {};
    if (filePath) queryPayload.filePath = filePath;
    if (repoRoot) queryPayload.repoRoot = repoRoot;
    const query =
      Object.keys(queryPayload).length > 0 ? `?${JSON.stringify(queryPayload)}` : '';
    return vscode.Uri.parse(`${DiffContentProvider.scheme}://${encodeURIComponent(hash)}${query}`);
  }
}
