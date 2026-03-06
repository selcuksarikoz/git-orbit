import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../extension';
import { AuthService } from './services/AuthService';
import { GitService } from './services/GitService';

// Mock vscode
vi.mock('vscode', () => {
  return {
    window: {
      registerFileDecorationProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      registerTreeDataProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      createTreeView: vi.fn().mockReturnValue({
        dispose: vi.fn(),
        onDidChangeTreeData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      }),
      createStatusBarItem: vi.fn().mockReturnValue({
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      }),
      createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      createWebviewPanel: vi.fn().mockReturnValue({
        reveal: vi.fn(),
        onDidDispose: vi.fn(),
        webview: {
          onDidReceiveMessage: vi.fn(),
          postMessage: vi.fn(),
          asWebviewUri: vi.fn((uri) => uri),
        },
        dispose: vi.fn(),
      }),
      registerUriHandler: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onDidChangeTextEditorSelection: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onDidChangeActiveTextEditor: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      activeTextEditor: undefined,
    },
    ViewColumn: {
      One: 1,
      Two: 2,
      Three: 3,
    },
    commands: {
      registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    workspace: {
      registerTextDocumentContentProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onDidChangeWorkspaceFolders: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      createFileSystemWatcher: vi.fn().mockReturnValue({
        onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onDidCreate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onDidDelete: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        dispose: vi.fn(),
      }),
      workspaceFolders: [],
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      }),
    },
    env: {
      uriScheme: 'vscode',
      openExternal: vi.fn(),
    },
    languages: {
      registerCodeLensProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      registerHoverProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
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
    MarkdownString: class {
      constructor(public value: string) {}
      appendMarkdown = vi.fn().mockReturnThis();
      appendText = vi.fn().mockReturnThis();
      isTrusted = true;
      supportHtml = true;
    },
    ThemeIcon: class {
      constructor(
        public id: string,
        public color?: any
      ) {}
    },
    StatusBarAlignment: { Left: 1 },
    ConfigurationTarget: { Global: 1 },
    extensions: {
      getExtension: vi.fn().mockReturnValue({
        isActive: true,
        exports: {
          getAPI: vi.fn().mockReturnValue({ onDidOpenRepository: vi.fn(), repositories: [] }),
        },
        packageJSON: { version: '1.2.1' },
      }),
    },
    Uri: {
      parse: vi.fn((s) => ({ fsPath: s, scheme: 'https' })),
      file: vi.fn((s) => ({ fsPath: s, scheme: 'file' })),
      joinPath: vi.fn((...args) => ({
        fsPath: args.map((a: any) => a.fsPath || a).join('/'),
        scheme: 'file',
      })),
    },
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
    },
  };
});

// Mock services
vi.mock('./services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      init: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
      getRepositories: vi.fn().mockReturnValue([]),
      getMainRepositories: vi.fn().mockReturnValue([]),
      getWorktrees: vi.fn().mockReturnValue([]),
      onDidChangeSelectedRepo: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      clearCache: vi.fn(),
      ensureInitialized: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('./services/AuthService', () => ({
  AuthService: {
    getInstance: vi.fn().mockReturnValue({
      init: vi.fn(),
      isLoggedIn: vi.fn().mockResolvedValue(true),
    }),
  },
}));

describe('Extension Activation', () => {
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      subscriptions: [],
      extensionUri: { fsPath: '/extension' },
      globalState: {
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  it('should register commands and providers upon activation', () => {
    // Just verify activation doesn't throw
    expect(() => activate(mockContext)).not.toThrow();
  });
});
