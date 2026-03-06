import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { CommitTreeProvider } from '../../providers/CommitTreeProvider';
import { GitService } from '../../services/GitService';
import { ConfigService } from '../../services/ConfigService';

// Mock vscode
vi.mock('vscode', () => ({
  TreeItem: class {
    constructor(public label: string, public collapsibleState: any) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class {
    constructor(public id: string, public color?: any) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  MarkdownString: class {
    constructor(public value: string) {}
    appendMarkdown = vi.fn().mockReturnThis();
    appendText = vi.fn().mockReturnThis();
    isTrusted = true;
    supportHtml = true;
  },
  workspace: {
    onDidChangeConfiguration: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
  },
}));

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      isInitialized: vi.fn().mockReturnValue(true),
      getMainRepositories: vi.fn().mockReturnValue([{ rootDir: '/test/repo' }]),
      getWorktrees: vi.fn().mockReturnValue([]),
      getLog: vi.fn().mockResolvedValue({
        all: [
          { hash: 'abcdef1', message: 'feat: add stuff', author_name: 'John', author_email: 'john@test.com', date: '2023-01-01' },
          { hash: '1234567', message: 'fix: bug', author_name: 'Jane', author_email: 'jane@test.com', date: '2023-01-02' },
        ],
      }),
    }),
  },
}));

// Mock ConfigService
vi.mock('../../services/ConfigService', () => ({
  ConfigService: {
    getInstance: vi.fn().mockReturnValue({
      commitLimit: 50,
    }),
  },
}));

describe('CommitTreeProvider', () => {
  let provider: CommitTreeProvider;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CommitTreeProvider();
    mockGitService = GitService.getInstance();
  });

  it('should get commits for root', async () => {
    const children = await provider.getChildren();

    expect(children.length).toBe(2);
    expect((children[0] as any).hash).toBe('abcdef1');
    expect(mockGitService.getLog).toHaveBeenCalledWith(50, undefined, expect.any(Object));
  });

  it('should increment limit', () => {
    provider.incrementLimit();
    expect((provider as any).limit).toBe(70);
  });
});
