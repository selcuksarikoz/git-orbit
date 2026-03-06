import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { WelcomeView } from '../../webviews/WelcomeView';

// Mock vscode
vi.mock('vscode', () => {
  return {
    window: {
      activeTextEditor: { viewColumn: 1 },
      createWebviewPanel: vi.fn().mockReturnValue({
        webview: {
          asWebviewUri: vi.fn((uri) => uri),
          onDidReceiveMessage: vi.fn(),
          html: '',
        },
        onDidDispose: vi.fn(),
        reveal: vi.fn(),
      }),
    },
    ViewColumn: { One: 1 },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file' }),
      joinPath: (base: any, ...parts: string[]) => ({ fsPath: `${base.fsPath}/${parts.join('/')}`, scheme: 'file' }),
    },
    extensions: {
      getExtension: vi.fn().mockReturnValue({
        packageJSON: { version: '1.2.1' },
      }),
    },
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

describe('WelcomeView', () => {
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (WelcomeView as any).currentPanel = undefined;
    
    mockContext = {
      globalState: {
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
      extensionUri: { fsPath: '/extension' },
      subscriptions: [],
    };
  });

  it('should create and show welcome panel if version changed', () => {
    mockContext.globalState.get.mockReturnValue('1.0.0');
    
    WelcomeView.show(mockContext);
    
    expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    expect(mockContext.globalState.update).toHaveBeenCalledWith('welcomeVersion', '1.2.1');
  });

  it('should not show welcome panel if version is the same', () => {
    mockContext.globalState.get.mockReturnValue('1.2.1');
    
    WelcomeView.show(mockContext);
    
    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
  });

  it('should show welcome panel if forced even if version is the same', () => {
    mockContext.globalState.get.mockReturnValue('1.2.1');
    
    WelcomeView.show(mockContext, true);
    
    expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
  });
});
