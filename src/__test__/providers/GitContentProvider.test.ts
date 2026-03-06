import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { GitContentProvider } from '../../providers/GitContentProvider';
import { GitService } from '../../services/GitService';

// Mock vscode
vi.mock('vscode', () => ({
  Uri: {
    from: vi.fn((data) => ({ ...data, scheme: 'gitorbit-git' })),
    file: vi.fn((path) => ({ fsPath: path, scheme: 'file' })),
    joinPath: vi.fn((base, relative) => ({ fsPath: `${base.fsPath}/${relative}`, scheme: 'file' })),
  },
}));

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getRepositories: vi.fn().mockReturnValue([{ rootDir: '/test/repo' }]),
      getWorktrees: vi.fn().mockReturnValue([]),
      getRelativePath: vi.fn().mockReturnValue('src/file.ts'),
      showFileContentRaw: vi.fn().mockResolvedValue('test content'),
    }),
  },
}));

describe('GitContentProvider', () => {
  let provider: GitContentProvider;
  let gitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GitContentProvider();
    gitService = GitService.getInstance();
  });

  it('should provide text document content for a commit hash', async () => {
    const uri = {
      authority: 'abc1234',
      path: '/src/file.ts',
      scheme: 'gitorbit-git',
    } as any;

    const content = await provider.provideTextDocumentContent(uri);

    expect(content).toBe('test content');
    expect(gitService.showFileContentRaw).toHaveBeenCalledWith('abc1234:src/file.ts', undefined);
  });

  it('should provide empty content for EMPTY hash', async () => {
    const uri = {
      authority: 'EMPTY',
      path: '/src/file.ts',
      scheme: 'gitorbit-git',
    } as any;

    const content = await provider.provideTextDocumentContent(uri);

    expect(content).toBe('');
  });

  it('should handle authority with repoRoot', async () => {
    const uri = {
      authority: '/test/repo::abc1234',
      path: '/src/file.ts',
      scheme: 'gitorbit-git',
    } as any;

    await provider.provideTextDocumentContent(uri);

    expect(gitService.showFileContentRaw).toHaveBeenCalledWith('abc1234:src/file.ts', expect.objectContaining({ rootDir: '/test/repo' }));
  });

  it('should generate URIs for diffing', () => {
    const diff = GitContentProvider.getDiffUris('M', 'src/file.ts', true, '/test/repo');

    expect(diff.original).toBeDefined();
    expect(diff.modified).toBeDefined();
    expect(vscode.Uri.from).toHaveBeenCalledWith(expect.objectContaining({
      authority: '/test/repo::HEAD',
    }));
  });
});
