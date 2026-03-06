import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { StashTreeProvider, StashItem } from '../../providers/StashTreeProvider';
import { GitService } from '../../services/GitService';

// Mock vscode
vi.mock('vscode', () => {
  const TreeItem = class {
    constructor(public label: string, public collapsibleState: number) {}
  };
  return {
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class { constructor(public id: string, public color?: any) {} },
    ThemeColor: class { constructor(public id: string) {} },
    EventEmitter: class { event = vi.fn(); fire = vi.fn(); },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    },
  };
});

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      isInitialized: vi.fn().mockReturnValue(true),
      getSelectedRepository: vi.fn().mockReturnValue({ rootDir: '/test/repo' }),
      getStashes: vi.fn().mockResolvedValue({ all: [{ message: 'stash1', index: 0 }] }),
      getStashFiles: vi.fn().mockResolvedValue(['file1.ts']),
    }),
  },
}));

describe('StashTreeProvider', () => {
  let provider: StashTreeProvider;
  let gitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new StashTreeProvider();
    gitService = GitService.getInstance();
  });

  it('should list stashes at root', async () => {
    const children = await provider.getChildren();
    
    expect(children.length).toBe(1);
    expect(children[0].label).toBe('stash1');
    expect(children[0].type).toBe('stash');
  });

  it('should list stash files for a stash item', async () => {
    const stashItem = new StashItem('stash1', 'stash', 0);
    const children = await provider.getChildren(stashItem);
    
    expect(children.length).toBe(1);
    expect(children[0].label).toBe('file1.ts');
    expect(children[0].type).toBe('file');
  });
});
