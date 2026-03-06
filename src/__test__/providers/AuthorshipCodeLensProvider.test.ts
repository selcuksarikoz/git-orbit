import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { AuthorshipCodeLensProvider } from '../../providers/AuthorshipCodeLensProvider';
import { GitService } from '../../services/GitService';

// Mock vscode
vi.mock('vscode', () => ({
  CodeLens: class {
    constructor(public range: any, public command: any) {}
  },
  Range: class {
    constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) {}
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getFileHistory: vi.fn().mockResolvedValue({
        all: [
          { author_name: 'John Doe', hash: 'abcdef1', date: '2023-01-01' },
          { author_name: 'Jane Smith', hash: '1234567', date: '2023-01-02' },
        ],
      }),
    }),
  },
}));

describe('AuthorshipCodeLensProvider', () => {
  let provider: AuthorshipCodeLensProvider;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AuthorshipCodeLensProvider();
    mockGitService = GitService.getInstance();
  });

  it('should provide code lenses with authorship info', async () => {
    const mockDocument = {
      uri: { fsPath: '/test/file.ts' },
    } as any;

    const lenses = await provider.provideCodeLenses(mockDocument, {} as any);

    expect(lenses.length).toBe(1);
    expect(lenses[0].command.title).toContain('2 authors');
    expect(lenses[0].command.title).toContain('Last edit by John Doe');
    expect(mockGitService.getFileHistory).toHaveBeenCalledWith('/test/file.ts', 5);
  });

  it('should handle errors gracefully', async () => {
    mockGitService.getFileHistory.mockRejectedValue(new Error('Git error'));
    const mockDocument = {
      uri: { fsPath: '/test/file.ts' },
    } as any;

    const lenses = await provider.provideCodeLenses(mockDocument, {} as any);

    expect(lenses.length).toBe(0);
  });
});
