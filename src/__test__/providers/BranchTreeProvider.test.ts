vi.mock('vscode', () => ({
  TreeDataProvider: class MockTreeDataProvider {
    onDidChangeTreeData = vi.fn();
  },
  TreeItem: class MockTreeItem {
    label?: string;
    collapsibleState?: number;
    contextValue?: string;
    iconPath?: any;
    description?: string;
    tooltip?: string;
    command?: any;
    constructor(label?: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class MockThemeIcon {
    constructor(
      public id: string,
      public color?: any
    ) {}
  },
  ThemeColor: class MockThemeColor {
    constructor(public id: string) {}
  },
  EventEmitter: class MockEventEmitter<T = any> {
    event: any;
    private listeners: ((value: T) => void)[] = [];

    constructor() {
      this.event = (listener: (value: T) => void) => {
        this.listeners.push(listener);
        return {
          dispose: () => {
            const index = this.listeners.indexOf(listener);
            if (index > -1) this.listeners.splice(index, 1);
          },
        };
      };
    }

    fire(value?: T) {
      this.listeners.forEach((listener) => listener(value as T));
    }
  },
  workspace: {
    onDidChangeConfiguration: vi.fn(),
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn(),
    }),
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      isInitialized: vi.fn().mockReturnValue(true),
      getMainRepositories: vi.fn().mockReturnValue([]),
      getWorktrees: vi.fn().mockReturnValue([]),
      getBranches: vi.fn().mockResolvedValue({
        all: ['main', 'develop', 'feature/test'],
        current: 'main',
      }),
      getBranchStatus: vi.fn().mockResolvedValue({ ahead: 0, behind: 0, isGone: false }),
    }),
  },
}));

vi.mock('../../utils/HtmlUtils', () => ({
  toStrikethrough: (text: string) =>
    text
      .split('')
      .map((char) => char + '\u0336')
      .join(''),
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { BranchItem, BranchTreeProvider } from '../../providers/BranchTreeProvider';

describe('BranchItem', () => {
  describe('constructor', () => {
    it('should create a branch item with correct label', () => {
      const item = new BranchItem(
        'main',
        vscode.TreeItemCollapsibleState.None,
        'branch',
        'main',
        false
      );
      expect(item.label).toBe('main');
    });

    it('should create a folder item with correct properties', () => {
      const item = new BranchItem(
        'feature',
        vscode.TreeItemCollapsibleState.Collapsed,
        'folder',
        undefined,
        false,
        { _test: { _name: 'feature/test', _isBranch: true } }
      );
      expect(item.label).toBe('feature');
      expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
      expect(item.contextValue).toBe('folder');
    });

    it('should set contextValue to localBranchCurrent for current branch', () => {
      const item = new BranchItem(
        'main',
        vscode.TreeItemCollapsibleState.None,
        'branch',
        'main',
        false,
        undefined,
        true
      );
      expect(item.contextValue).toBe('localBranchCurrent');
    });

    it('should set contextValue to localBranchNotCurrent for non-current branch', () => {
      const item = new BranchItem(
        'feature',
        vscode.TreeItemCollapsibleState.None,
        'branch',
        'feature',
        false,
        undefined,
        false
      );
      expect(item.contextValue).toBe('localBranchNotCurrent');
    });

    it('should set contextValue to remoteBranch for remote branch', () => {
      const item = new BranchItem(
        'origin/main',
        vscode.TreeItemCollapsibleState.None,
        'branch',
        'origin/main',
        true
      );
      expect(item.contextValue).toBe('remoteBranch');
    });

    it('should set contextValue to repoGroup for repo type', () => {
      const item = new BranchItem(
        'my-repo',
        vscode.TreeItemCollapsibleState.Expanded,
        'repo',
        undefined,
        false,
        undefined,
        false,
        undefined,
        { rootDir: '/path/to/repo', executor: {} as any, isWorktree: false }
      );
      expect(item.contextValue).toBe('repoGroup');
    });

    it('should set contextValue to worktreeGroup for worktree group', () => {
      const item = new BranchItem(
        'Worktrees',
        vscode.TreeItemCollapsibleState.Expanded,
        'worktreeGroup'
      );
      expect(item.contextValue).toBe('worktreeGroup');
    });

    it('should set contextValue to worktree for individual worktree', () => {
      const item = new BranchItem(
        'main-repo-feature',
        vscode.TreeItemCollapsibleState.None,
        'worktree',
        undefined,
        false,
        undefined,
        false,
        undefined,
        { rootDir: '/path/to/worktree', branch: 'feature', executor: {} as any, isWorktree: true }
      );
      expect(item.contextValue).toBe('worktree');
    });

    it('should apply strikethrough for gone branches', () => {
      const item = new BranchItem(
        'deleted-branch',
        vscode.TreeItemCollapsibleState.None,
        'branch',
        'deleted-branch',
        false,
        undefined,
        false,
        { ahead: 0, behind: 0, isGone: true }
      );
      expect(BranchItem.toStrikethrough('deleted-branch')).toContain('\u0336');
    });

    it('should include ahead/behind in description', () => {
      const item = new BranchItem(
        'feature',
        vscode.TreeItemCollapsibleState.None,
        'branch',
        'feature',
        false,
        undefined,
        false,
        { ahead: 3, behind: 2, isGone: false }
      );
      expect(item.description).toContain('↑3');
      expect(item.description).toContain('↓2');
    });

    it('should include (current) in description for current branch', () => {
      const item = new BranchItem(
        'main',
        vscode.TreeItemCollapsibleState.None,
        'branch',
        'main',
        false,
        undefined,
        true,
        { ahead: 1, behind: 0, isGone: false }
      );
      expect(item.description).toContain('(current)');
      expect(item.description).toContain('↑1');
    });

    it('should set tooltip for branch with status', () => {
      const item = new BranchItem(
        'feature',
        vscode.TreeItemCollapsibleState.None,
        'branch',
        'feature',
        false,
        undefined,
        false,
        { ahead: 5, behind: 3, isGone: false }
      );
      expect(item.tooltip).toContain('Ahead: 5');
      expect(item.tooltip).toContain('Behind: 3');
    });

    it('should set tooltip for gone branch', () => {
      const item = new BranchItem(
        'deleted',
        vscode.TreeItemCollapsibleState.None,
        'branch',
        'deleted',
        false,
        undefined,
        false,
        { ahead: 0, behind: 0, isGone: true }
      );
      expect(item.tooltip).toContain('Gone on Remote');
    });

    it('should set tooltip for repo', () => {
      const item = new BranchItem(
        'my-repo',
        vscode.TreeItemCollapsibleState.Expanded,
        'repo',
        undefined,
        false,
        undefined,
        false,
        undefined,
        { rootDir: '/path/to/repo', executor: {} as any, isWorktree: false }
      );
      expect(item.tooltip).toContain('Repository:');
      expect(item.tooltip).toContain('/path/to/repo');
    });
  });

  describe('toStrikethrough', () => {
    it('should convert text to strikethrough', () => {
      const result = BranchItem.toStrikethrough('test');
      expect(result).toContain('\u0336');
    });
  });
});

describe('BranchTreeProvider', () => {
  let provider: BranchTreeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new BranchTreeProvider(false);
  });

  describe('constructor', () => {
    it('should create provider with isRemote flag', () => {
      const remoteProvider = new BranchTreeProvider(true);
      expect(remoteProvider).toBeDefined();
    });
  });

  describe('hideBranch', () => {
    it('should add branch to hidden set', async () => {
      provider.hideBranch('feature-branch');
      const children = await provider.getChildren();
      expect(children).toEqual([]);
    });

    it('should refresh after hiding branch', () => {
      const callback = vi.fn();
      provider.onDidChangeTreeData(callback);
      provider.hideBranch('test-branch');
      expect(callback).toHaveBeenCalled();
    });

    it('should hide branch for specific repo', () => {
      provider.hideBranch('feature-branch', {
        rootDir: '/test/repo',
        executor: {} as any,
        isWorktree: false,
      } as any);
      const children = provider.getChildren();
      expect(children).resolves.toEqual([]);
    });
  });

  describe('getTreeItem', () => {
    it('should return the element as TreeItem', () => {
      const item = new BranchItem('main', vscode.TreeItemCollapsibleState.None, 'branch', 'main');
      const treeItem = provider.getTreeItem(item);
      expect(treeItem).toBe(item);
    });
  });
});
