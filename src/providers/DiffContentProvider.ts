import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'gitorbit-diff';

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const hash = decodeURIComponent(uri.authority);
    let filePath: string | undefined;
    if (uri.query) {
      try {
        const query = JSON.parse(uri.query);
        filePath = query.filePath;
      } catch {}
    }

    return GitService.getInstance().getDiff(hash, filePath, true); // Always compare with parent for readable diff
  }

  static getUri(hash: string, filePath?: string): vscode.Uri {
    const query = filePath ? `?${JSON.stringify({ filePath })}` : '';
    return vscode.Uri.parse(`${DiffContentProvider.scheme}://${encodeURIComponent(hash)}${query}`);
  }
}
