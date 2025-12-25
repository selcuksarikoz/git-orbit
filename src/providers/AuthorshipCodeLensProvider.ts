import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

export class AuthorshipCodeLensProvider implements vscode.CodeLensProvider {
  private gitService: GitService;

  constructor() {
    this.gitService = GitService.getInstance();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const lenses: vscode.CodeLens[] = [];
    // For simplicity, we'll just add a lens at the top of the file
    // In a real app, we'd use a parser to find function declarations
    const range = new vscode.Range(0, 0, 0, 0);

    try {
      const history = await this.gitService.getFileHistory(document.uri.fsPath, 5);
      const authors = new Set(history.all.map((c) => c.author_name));
      const lastAuthor = history.all[0]?.author_name || 'Unknown';

      lenses.push(
        new vscode.CodeLens(range, {
          title: `${authors.size} authors • Last edit by ${lastAuthor}`,
          command: 'gitorbit.views.fileHistory.focus',
        })
      );
    } catch {
      // Ignore errors
    }

    return lenses;
  }
}
