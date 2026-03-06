import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { FileHistoryProvider } from '../../providers/FileHistoryProvider';
import { GitService } from '../../services/GitService';
import { ConfigService } from '../../services/ConfigService';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    activeTextEditor: {
      document: {
        uri: { fsPath: '/test/file.ts', scheme: 'file' },
      },
    },
    visibleTextEditors: [{}],
    onDidChangeActiveTextEditor: vi.fn(),
  },
  workspace: {
    onDidChangeConfiguration: vi.fn(),
  },
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
      getFileHistory: vi.fn().mockResolvedValue({
        all: [
          { hash: 'abcdef1', message: 'feat: add stuff', author_name: 'John', author_email: 'john@test.com', date: '2023-01-01' },
        ],
      }),
    }),
  },
}));

// Mock ConfigService
vi.mock('../../services/ConfigService', () => ({
  ConfigService: {
    getInstance: vi.fn().mockReturnValue({
      commitLimit: 20,
    }),
  },
}));

describe('FileHistoryProvider', () => {
  let provider: FileHistoryProvider;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new FileHistoryProvider();
    mockGitService = GitService.getInstance();
  });

  it('should get file history', async () => {
    const children = await provider.getChildren();

    expect(children.length).toBe(1);
    expect((children[0] as any).hash).toBe('abcdef1');
    expect(mockGitService.getFileHistory).toHaveBeenCalledWith('/test/file.ts', 20, expect.any(Object));
  });

  it('should update current file when active editor changes', async () => {
    // Simulate editor change
    vi.mocked(vscode.window.activeTextEditor).document.uri.fsPath = '/test/newfile.ts';
    (provider as any).updateCurrentFile();
    
    expect((provider as any).currentFilePath).toBe('/test/newfile.ts');
  });
});
