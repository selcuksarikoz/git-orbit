import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

export class FullDiffProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'gitorbit-diff';

  provideTextDocumentContent(uri: vscode.Uri): vscode.ProviderResult<string> {
    const params = new URLSearchParams(uri.query);
    const hash = params.get('hash');
    if (!hash) return '';

    return GitService.getInstance().getCommitFullDiff(hash);
  }
}
