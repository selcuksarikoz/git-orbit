import * as vscode from 'vscode';
import { GitService, GitRepository } from '../services/GitService';

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'gitorbit-git';

  provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const [repoRoot, ...rest] = uri.authority.split('::');
    const hash = rest.join('::') || repoRoot;
    const gitService = GitService.getInstance();

    let targetRepo: GitRepository | undefined;
    if (repoRoot && repoRoot !== hash) {
      const repos = gitService.getRepositories();
      targetRepo = repos.find((r) => r.rootDir === repoRoot);
      if (!targetRepo) {
        const worktrees = gitService.getWorktrees();
        targetRepo = worktrees.find((w) => w.rootDir === repoRoot);
      }
    }

    const relativePath = gitService.getRelativePath(uri.path, targetRepo?.rootDir);

    if (hash === 'EMPTY') {
      return Promise.resolve('');
    }

    if (hash.toUpperCase() === 'INDEX') {
      return gitService.showFileContentRaw(`:0:${relativePath}`, targetRepo);
    }

    return gitService.showFileContentRaw(`${hash}:${relativePath}`, targetRepo);
  }

  static getUri(hash: string, filePath: string, repoRoot?: string): vscode.Uri {
    const authority = repoRoot ? `${repoRoot}::${hash}` : hash;
    return vscode.Uri.from({
      scheme: GitContentProvider.scheme,
      authority: authority,
      path: filePath.startsWith('/') ? filePath : `/${filePath}`,
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
      let original: vscode.Uri | undefined = GitContentProvider.getUri(
        'HEAD',
        relativePath,
        rootDir
      );
      let modified: vscode.Uri | undefined = GitContentProvider.getUri(
        'INDEX',
        relativePath,
        rootDir
      );

      if (status === 'A') {
        original = GitContentProvider.getUri('EMPTY', relativePath, rootDir);
      } else if (status === 'D') {
        modified = GitContentProvider.getUri('EMPTY', relativePath, rootDir);
      }
      return { original, modified };
    } else {
      const isUntracked = status === '?' || status === 'U';
      const original = isUntracked
        ? GitContentProvider.getUri('EMPTY', relativePath, rootDir)
        : GitContentProvider.getUri('INDEX', relativePath, rootDir);

      const isDeleted = status === 'D';
      const modified = isDeleted
        ? GitContentProvider.getUri('EMPTY', relativePath, rootDir)
        : vscode.Uri.file(vscode.Uri.joinPath(vscode.Uri.file(rootDir), relativePath).fsPath);

      return { original, modified };
    }
  }

  static getCommitDiffUris(
    hash: string,
    filePath: string,
    status: string,
    repoRoot?: string
  ): { original: vscode.Uri | undefined; modified: vscode.Uri | undefined } {
    const original =
      status === 'A' ? undefined : GitContentProvider.getUri(`${hash}^`, filePath, repoRoot);
    const modified =
      status === 'D' ? undefined : GitContentProvider.getUri(hash, filePath, repoRoot);

    return { original, modified };
  }
}
