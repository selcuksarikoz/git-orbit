import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { ContributorTreeProvider } from '../../providers/ContributorTreeProvider';
import { GitService } from '../../services/GitService';

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
    constructor(public id: string) {}
  },
  MarkdownString: class {
    appendMarkdown = vi.fn();
    isTrusted = false;
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
      getSelectedRepository: vi.fn().mockReturnValue({ rootDir: '/test/repo' }),
      getContributors: vi.fn().mockResolvedValue([
        { name: 'John Doe', email: 'john@test.com', count: 10 },
        { name: 'Jane Smith', email: 'jane@test.com', count: 5 },
      ]),
    }),
  },
}));

describe('ContributorTreeProvider', () => {
  let provider: ContributorTreeProvider;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ContributorTreeProvider();
    mockGitService = GitService.getInstance();
  });

  it('should get contributors', async () => {
    const children = await provider.getChildren();

    expect(children.length).toBe(2);
    expect(children[0].name).toBe('John Doe');
    expect(children[0].commitCount).toBe(10);
  });

  it('should handle errors in getContributors', async () => {
    mockGitService.getContributors.mockRejectedValue(new Error('Git error'));
    const children = await provider.getChildren();
    expect(children.length).toBe(0);
  });
});
