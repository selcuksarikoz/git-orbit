import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { GraphTreeProvider, GraphItem } from '../../providers/GraphTreeProvider';
import { GitService } from '../../services/GitService';
import { ConfigService } from '../../services/ConfigService';

// Mock vscode
vi.mock('vscode', () => {
  const TreeItem = class {
    label: string;
    collapsibleState: number;
    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  };
  return {
    TreeItem,
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
    workspace: {
      onDidChangeConfiguration: vi.fn(),
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    },
    MarkdownString: class {
      value = '';
      appendMarkdown(m: string) {
        this.value += m;
      }
    },
  };
});

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getMainRepositories: vi.fn().mockReturnValue([{ rootDir: '/test/repo' }]),
      getWorktrees: vi.fn().mockReturnValue([]),
      getAllLog: vi.fn().mockResolvedValue({
        all: [
          { hash: 'abc', message: 'test', author_name: 'Alice', date: 'now' },
          { hash: 'def', message: 'other change', author_name: 'Bob', date: 'now' },
        ],
      }),
      getRepositoryByRoot: vi.fn(),
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

describe('GraphTreeProvider', () => {
  let provider: GraphTreeProvider;
  let gitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GraphTreeProvider();
    gitService = GitService.getInstance();
  });

  it('should return commit items when getChildren is called at root', async () => {
    const children = await provider.getChildren();

    // It should have at least the commit from the main repo
    expect(children.length).toBeGreaterThan(0);
    const commit = children.find((c) => c instanceof GraphItem && c.type === 'commit');
    expect(commit).toBeDefined();
    expect((commit as GraphItem).label).toBe('test');
  });

  it('should resolve tooltip for GraphItem', () => {
    const item = new GraphItem('msg', 'author', 'date', 'hash', 0, 'commit');
    provider.resolveTreeItem(new vscode.TreeItem('test', 0), item);
    expect(item.tooltip).toBeDefined();
  });

  describe('root-level filtering', () => {
    const commitsOf = (items: (GraphItem | vscode.TreeItem)[]) =>
      items.filter((c) => c instanceof GraphItem && c.type === 'commit') as GraphItem[];

    it('should filter root commits by message', async () => {
      provider.setFilter('other');
      const commits = commitsOf(await provider.getChildren());

      expect(commits.length).toBe(1);
      expect(commits[0].label).toBe('other change');
    });

    it('should filter root commits by author and hash', async () => {
      provider.setFilter('bob');
      expect(commitsOf(await provider.getChildren()).length).toBe(1);

      provider.setFilter('def');
      const commits = commitsOf(await provider.getChildren());
      expect(commits.length).toBe(1);
      expect(commits[0].label).toBe('other change');
    });

    it('should not produce a dead repo context item at root', async () => {
      const children = await provider.getChildren();
      expect(children.some((c) => (c as any).contextValue === 'repo')).toBe(false);
    });
  });
});
