import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { TagTreeProvider, TagItem } from '../../providers/TagTreeProvider';
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
  };
});

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      isInitialized: vi.fn().mockReturnValue(true),
      getSelectedRepository: vi.fn().mockReturnValue({ rootDir: '/test/repo' }),
      getTags: vi.fn().mockResolvedValue([{ name: 'v1.0.0', hash: 'abc', date: 'now', subject: 'release' }]),
      getBranchesForTag: vi.fn().mockResolvedValue(['main']),
    }),
  },
}));

describe('TagTreeProvider', () => {
  let provider: TagTreeProvider;
  let gitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TagTreeProvider();
    gitService = GitService.getInstance();
  });

  it('should list tags at root', async () => {
    const children = await provider.getChildren();
    
    expect(children.length).toBe(1);
    expect(children[0].label).toBe('v1.0.0');
    expect(children[0].type).toBe('tag');
  });

  it('should list branches for a tag item', async () => {
    const tagItem = new TagItem('v1.0.0', 'abc', 'now', 'release', 'tag', 1);
    const children = await provider.getChildren(tagItem);
    
    expect(children.length).toBe(1);
    expect(children[0].label).toBe('main');
    expect(children[0].type).toBe('branch');
  });
});
