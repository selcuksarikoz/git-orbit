import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/GitService';

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'gitorbit-git';

  provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const authority = decodeURIComponent(uri.authority);
    const gitService = GitService.getInstance();
    const relativePath = gitService.getRelativePath(uri.path);

    if (authority === 'EMPTY') {
      return Promise.resolve('');
    }

    if (authority.toUpperCase() === 'INDEX') {
      // For index content, we use :0:path to specify the stage clearly
      return gitService.showFileContentRaw(`:0:${relativePath}`);
    }

    return gitService.showFileContentRaw(`${authority}:${relativePath}`);
  }

  static getUri(hash: string, path: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: GitContentProvider.scheme,
      authority: hash,
      path: path.startsWith('/') ? path : `/${path}`,
    });
  }

  /**
   * Generates a pair of URIs for diffing purposes based on file status.
   * Useful for Changes View and Multi-Diff Editor.
   */
  static getDiffUris(
    status: string,
    relativePath: string,
    staged: boolean,
    rootDir: string
  ): { original: vscode.Uri | undefined; modified: vscode.Uri | undefined } {
    if (staged) {
      // HEAD vs INDEX
      let original: vscode.Uri | undefined = GitContentProvider.getUri('HEAD', relativePath);
      let modified: vscode.Uri | undefined = GitContentProvider.getUri('INDEX', relativePath);

      if (status === 'A') {
        original = GitContentProvider.getUri('EMPTY', relativePath);
      } else if (status === 'D') {
        // If deleted in staging, modified is basically empty/gone
        modified = GitContentProvider.getUri('EMPTY', relativePath);
      }
      return { original, modified };
    } else {
      // INDEX vs Working Tree
      const isUntracked = status === '?' || status === 'U';
      const original = isUntracked
        ? GitContentProvider.getUri('EMPTY', relativePath)
        : GitContentProvider.getUri('INDEX', relativePath);

      const isDeleted = status === 'D';
      const modified = isDeleted
        ? GitContentProvider.getUri('EMPTY', relativePath)
        : vscode.Uri.file(vscode.Uri.joinPath(vscode.Uri.file(rootDir), relativePath).fsPath);

      return { original, modified };
    }
  }

  static getCommitDiffUris(
    hash: string,
    path: string,
    status: string
  ): { original: vscode.Uri | undefined; modified: vscode.Uri | undefined } {
    const original = status === 'A' ? undefined : GitContentProvider.getUri(`${hash}^`, path);
    const modified = status === 'D' ? undefined : GitContentProvider.getUri(hash, path);

    return { original, modified };
  }
}
