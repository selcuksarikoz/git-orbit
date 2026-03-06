import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

export class FullDiffProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'gitorbit-diff';

  provideTextDocumentContent(uri: vscode.Uri): vscode.ProviderResult<string> {
    const params = new URLSearchParams(uri.query);
    const hash = params.get('hash');
    const repoRoot = params.get('repoRoot') || undefined;
    if (!hash) return '';

    const targetRepo = repoRoot ? GitService.getInstance().getRepositoryByRoot(repoRoot) : undefined;
    return GitService.getInstance().getCommitFullDiff(hash, targetRepo);
  }
}
