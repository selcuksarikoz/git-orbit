import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { FullDiffProvider } from '../../providers/FullDiffProvider';
import { GitService } from '../../services/GitService';

// Mock vscode
vi.mock('vscode', () => ({
  Uri: {
    parse: (u: string) => ({ query: u.split('?')[1] }),
  },
}));

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getCommitFullDiff: vi.fn().mockResolvedValue('test diff content'),
      getRepositoryByRoot: vi.fn().mockReturnValue({ rootDir: '/test/repo' }),
    }),
  },
}));

describe('FullDiffProvider', () => {
  let provider: FullDiffProvider;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new FullDiffProvider();
    mockGitService = GitService.getInstance();
  });

  it('should provide full diff content', async () => {
    const mockUri = {
      query: 'hash=abcdef1&repoRoot=/test/repo',
    } as any;

    const content = await provider.provideTextDocumentContent(mockUri);

    expect(content).toBe('test diff content');
    expect(mockGitService.getCommitFullDiff).toHaveBeenCalledWith('abcdef1', expect.any(Object));
  });

  it('should return empty string if no hash', async () => {
    const mockUri = {
      query: 'repoRoot=/test/repo',
    } as any;

    const content = await provider.provideTextDocumentContent(mockUri);

    expect(content).toBe('');
  });
});
