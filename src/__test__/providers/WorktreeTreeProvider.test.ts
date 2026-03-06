import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { WorktreeTreeProvider } from '../../providers/WorktreeTreeProvider';
import { GitService } from '../../services/GitService';
import { WorktreeService } from '../../services/WorktreeService';

vi.mock('vscode', () => ({
  TreeItem: class {
    constructor(
      public label: string,
      public collapsibleState: number,
      public description?: string,
      public iconPath?: any,
      public contextValue?: string,
      public command?: any,
      public tooltip?: string
    ) {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(
      public id: string,
      public color?: any
    ) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('../../services/WorktreeService', () => ({
  WorktreeService: {
    getInstance: vi.fn(),
  },
}));

describe('WorktreeTreeProvider', () => {
  let provider: WorktreeTreeProvider;
  let gitService: any;
  let worktreeService: any;

  const mockMainRepo = {
    rootDir: '/test/main-repo',
    executor: {},
    isWorktree: false,
    branch: 'main',
  };

  const mockWorktree = {
    path: '/test/main-repo-feature',
    branch: 'feature',
    head: 'abc123',
    isBare: false,
    isLocked: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    gitService = {
      ensureInitialized: vi.fn().mockResolvedValue(undefined),
      getMainRepositories: vi.fn().mockReturnValue([mockMainRepo]),
      getSelectedRepository: vi.fn().mockReturnValue(null),
      getRepositories: vi.fn().mockReturnValue([
        mockMainRepo,
        {
          ...mockMainRepo,
          rootDir: '/test/main-repo-feature',
          isWorktree: true,
          branch: 'feature',
        },
      ]),
    };

    worktreeService = {
      listWorktrees: vi.fn().mockResolvedValue([mockWorktree]),
    };

    (GitService.getInstance as any).mockReturnValue(gitService);
    (WorktreeService.getInstance as any).mockReturnValue(worktreeService);

    provider = new WorktreeTreeProvider();
  });

  it('should return empty message when no repos exist', async () => {
    gitService.getMainRepositories.mockReturnValue([]);
    const children = await provider.getChildren();
    expect(children[0].label).toBe('No repositories found');
  });

  it('should return no worktrees message when no worktrees exist', async () => {
    worktreeService.listWorktrees.mockResolvedValue([]);
    const children = await provider.getChildren();
    expect(children[0].label).toBe('No worktrees found');
  });

  it('should list worktree groups when worktrees exist', async () => {
    const children = await provider.getChildren();
    expect(children.length).toBe(1);
    expect(children[0]?.label).toBe('main-repo');
    expect(children[0]?.contextValue).toBe('worktreeGroup');
  });

  it('should mark current worktree with (current) label', async () => {
    gitService.getSelectedRepository.mockReturnValue({
      rootDir: '/test/main-repo-feature',
    });

    const children = await provider.getChildren();
    expect(children.length).toBe(1);

    const groupChildren = await provider.getChildren(children[0]);
    expect(groupChildren[0].label).toBe('main-repo-feature (current)');
  });

  it('should have switch command on worktree item', async () => {
    const children = await provider.getChildren();
    const groupChildren = await provider.getChildren(children[0]);

    expect(groupChildren[0]?.command).toBeDefined();
    expect(groupChildren[0]?.command?.command).toBe('gitorbit.worktree.switch');
  });
});
