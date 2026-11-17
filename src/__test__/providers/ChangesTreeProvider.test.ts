import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { ChangesTreeProvider } from '../../providers/ChangesTreeProvider';
import { GitService } from '../../services/GitService';

// Mock vscode
vi.mock('vscode', () => ({
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
  },
  TreeItem: class {
    constructor(
      public label: string,
      public collapsibleState: any
    ) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class {
    constructor(
      public id: string,
      public color: any
    ) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    joinPath: (uri: any, ...parts: string[]) => ({
      fsPath: uri.fsPath + '/' + parts.join('/'),
      scheme: 'file',
    }),
  },
  workspace: {
    createFileSystemWatcher: vi.fn().mockReturnValue({
      onDidChange: vi.fn(),
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
    }),
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({}),
    }),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

const mockConfig = vi.hoisted(() => ({ changesViewMode: 'list' as 'list' | 'tree' }));

vi.mock('../../services/ConfigService', () => ({
  ConfigService: { getInstance: () => mockConfig },
}));

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      clearCache: vi.fn(),
      ensureInitialized: vi.fn(),
      getRepositories: vi.fn().mockReturnValue([{ rootDir: '/test/repo' }]),
      getSelectedRepository: vi.fn().mockReturnValue({ rootDir: '/test/repo' }),
      getBranches: vi.fn().mockResolvedValue({ all: [], current: '' }),
      getBranchStatus: vi.fn().mockResolvedValue({ isGone: false }),
      getAllStatus: vi.fn().mockResolvedValue([
        {
          path: 'file1.ts',
          stagedStatus: 'M',
          workingTreeStatus: ' ',
          repo: { rootDir: '/test/repo' },
        },
        {
          path: 'file2.ts',
          stagedStatus: ' ',
          workingTreeStatus: 'M',
          repo: { rootDir: '/test/repo' },
        },
      ]),
    }),
  },
}));

// Mock BisectService
vi.mock('../../services/BisectService', () => ({
  BisectService: {
    getInstance: vi.fn().mockReturnValue({
      currentState: 0, // BisectState.Idle
      getLog: vi.fn().mockResolvedValue([]),
    }),
  },
  BisectState: { Idle: 0, Active: 1, Finished: 2 },
}));

// Mock WorktreeService
vi.mock('../../services/WorktreeService', () => ({
  WorktreeService: {
    getInstance: vi.fn().mockReturnValue({
      promptForWorktree: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('ChangesTreeProvider', () => {
  let provider: ChangesTreeProvider;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.changesViewMode = 'list';
    provider = new ChangesTreeProvider({} as any);
    mockGitService = GitService.getInstance();
  });

  it('should refresh and get status', async () => {
    await provider.refresh();

    expect(mockGitService.getAllStatus).toHaveBeenCalled();
    expect(provider.stagedCount).toBe(1);
    expect(provider.unstagedCount).toBe(1);
  });

  it('should get children for root', async () => {
    await provider.refresh();
    const children = await provider.getChildren();

    expect(children.length).toBeGreaterThan(0);
    // Should contain repo header
    expect((children[0] as any).repo).toBeDefined();
  });

  it('should stage a file', async () => {
    const mockItem = { path: 'file2.ts', repo: { rootDir: '/test/repo' } } as any;
    mockGitService.stage = vi.fn();

    await provider.stage(mockItem);

    expect(mockGitService.stage).toHaveBeenCalledWith('file2.ts', mockItem.repo);
  });

  it('should render flat change items in list mode', async () => {
    mockGitService.getAllStatus.mockResolvedValue([
      {
        path: 'src/nested/file.ts',
        stagedStatus: ' ',
        workingTreeStatus: 'M',
        repo: { rootDir: '/test/repo' },
      },
    ]);
    await provider.refresh();
    const repoHeader = (await provider.getChildren())[0];
    const groups = await provider.getChildren(repoHeader);
    const changesGroup = groups.find((g: any) => g.label === 'Changes');
    const items = await provider.getChildren(changesGroup);

    expect(items[0].label).toBe('file.ts');
    expect(items[0].contextValue).toBe('change');
  });

  it('should group changes into folders in tree mode', async () => {
    mockConfig.changesViewMode = 'tree';
    mockGitService.getAllStatus.mockResolvedValue([
      {
        path: 'src/nested/file.ts',
        stagedStatus: ' ',
        workingTreeStatus: 'M',
        repo: { rootDir: '/test/repo' },
      },
    ]);
    await provider.refresh();
    const repoHeader = (await provider.getChildren())[0];
    const groups = await provider.getChildren(repoHeader);
    const changesGroup = groups.find((g: any) => g.label === 'Changes');
    const items = await provider.getChildren(changesGroup);

    expect(items[0].label).toBe('src');
    expect(items[0].contextValue).toBe('changesFolder');

    const nested = await provider.getChildren(items[0]);
    expect(nested[0].label).toBe('nested');
    const files = await provider.getChildren(nested[0]);
    expect(files[0].label).toBe('file.ts');
    expect(files[0].contextValue).toBe('change');
  });
});
