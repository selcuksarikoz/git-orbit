import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../extension';
import { GitService } from './services/GitService';
import { AIProviderRegistry } from '@/services/ai/AIProviderRegistry';

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
      showInputBox: vi.fn().mockResolvedValue(undefined),
      showQuickPick: vi.fn().mockResolvedValue(undefined),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
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
          getAPI: vi.fn().mockReturnValue({
            onDidOpenRepository: vi.fn().mockReturnValue({ dispose: vi.fn() }),
            repositories: [],
          }),
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

vi.mock('@/services/ai/AIProviderRegistry', () => ({
  AIProviderRegistry: {
    getInstance: vi.fn().mockReturnValue({
      getProviders: vi
        .fn()
        .mockResolvedValue([{ id: 'openrouter', displayName: 'OpenRouter', configured: true }]),
      setApiKey: vi.fn().mockResolvedValue(undefined),
      clearApiKey: vi.fn().mockResolvedValue(undefined),
      setActiveProvider: vi.fn().mockResolvedValue(undefined),
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
      secrets: {
        get: vi.fn(),
        store: vi.fn(),
        delete: vi.fn(),
      },
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

  it('should register the AI provider and view mode commands', () => {
    activate(mockContext);
    const registered = (vscode.commands.registerCommand as any).mock.calls.map(
      (call: any[]) => call[0]
    );

    expect(registered).toContain('gitorbit.ai.setApiKey');
    expect(registered).toContain('gitorbit.ai.clearApiKey');
    expect(registered).toContain('gitorbit.ai.selectProvider');
    expect(registered).toContain('gitorbit.changes.viewAsList');
    expect(registered).toContain('gitorbit.changes.viewAsTree');
    expect(registered).not.toContain('gitorbit.login');
    expect(registered).not.toContain('gitorbit.logout');
  });

  it('should initialize the registry with the extension SecretStorage', () => {
    activate(mockContext);
    expect(AIProviderRegistry.getInstance).toHaveBeenCalledWith(mockContext.secrets);
  });

  it('should save the OpenRouter API key when provided', async () => {
    (vscode.window.showInputBox as any).mockResolvedValue('sk-or-test');
    activate(mockContext);
    const handler = (vscode.commands.registerCommand as any).mock.calls.find(
      (call: any[]) => call[0] === 'gitorbit.ai.setApiKey'
    )[1];

    await handler();
    expect(
      (AIProviderRegistry.getInstance as any).mock.results[0].value.setApiKey
    ).toHaveBeenCalledWith('openrouter', 'sk-or-test');
    expect(vscode.window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ password: true })
    );
    // The secret must never be echoed back to the user.
    for (const call of vi.mocked(vscode.window.showInformationMessage).mock.calls) {
      expect(String(call[0])).not.toContain('sk-or-test');
    }
  });

  it('should save the OpenRouter model entered by the user', async () => {
    (vscode.window.showInputBox as any).mockResolvedValue('anthropic/claude-3.5-sonnet');
    activate(mockContext);
    const handler = (vscode.commands.registerCommand as any).mock.calls.find(
      (call: any[]) => call[0] === 'gitorbit.ai.setModel'
    )[1];

    await handler();
    expect(vscode.workspace.getConfiguration().update).toHaveBeenCalledWith(
      'model',
      'anthropic/claude-3.5-sonnet',
      1
    );
  });

  it('should persist view mode in globalState instead of User Settings', async () => {
    activate(mockContext);
    const handler = (vscode.commands.registerCommand as any).mock.calls.find(
      (call: any[]) => call[0] === 'gitorbit.changes.viewAsTree'
    )[1];

    await handler();
    expect(mockContext.globalState.update).toHaveBeenCalledWith(
      'gitorbit.views.changesViewMode',
      'tree'
    );
    expect(vscode.workspace.getConfiguration().update).not.toHaveBeenCalledWith(
      'views.changesViewMode',
      'tree',
      expect.anything()
    );
  });

  it('should reject an empty API key without storing it', async () => {
    (vscode.window.showInputBox as any).mockResolvedValue('   ');
    activate(mockContext);
    const handler = (vscode.commands.registerCommand as any).mock.calls.find(
      (call: any[]) => call[0] === 'gitorbit.ai.setApiKey'
    )[1];

    await handler();
    expect(
      (AIProviderRegistry.getInstance as any).mock.results[0].value.setApiKey
    ).not.toHaveBeenCalled();
  });
});
