import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { PullRequestView } from '../../webviews/PullRequestView';
import { PullRequestService } from '../../services/PullRequestService';

// Mock vscode
vi.mock('vscode', () => {
  return {
    window: {
      activeTextEditor: { viewColumn: 1 },
      createWebviewPanel: vi.fn().mockReturnValue({
        webview: {
          html: '',
          onDidReceiveMessage: vi.fn(),
          postMessage: vi.fn(),
        },
        onDidDispose: vi.fn(),
        reveal: vi.fn(),
      }),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
    },
    ViewColumn: { One: 1 },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file' }),
      parse: (p: string) => ({ fsPath: p, scheme: 'https' }),
    },
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

// Mock PullRequestService
vi.mock('../../services/PullRequestService', () => ({
  PullRequestService: {
    getInstance: vi.fn().mockReturnValue({
      getPRDetails: vi.fn().mockResolvedValue({
        number: 1, title: 'test', author: { login: 'user' }, state: 'open',
        createdAt: new Date().toISOString(), body: '', headRef: 'h', baseRef: 'b',
        additions: 1, deletions: 1, changedFiles: 1, mergeable: true,
        reviewers: [], comments: [], files: []
      }),
      getCollaborators: vi.fn().mockResolvedValue([]),
    }),
  },
}));

describe('PullRequestView', () => {
  let mockContext: any;
  let mockPR: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (PullRequestView as any).panels = new Map();
    
    mockContext = {
      subscriptions: [],
    };
    mockPR = {
      number: 1,
      title: 'Test PR',
      repo: { rootDir: '/test' },
      url: 'https://github.com/test/pr/1',
    };
  });

  it('should create and show PR panel', async () => {
    await PullRequestView.show(mockContext, mockPR);
    
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'gitorbit.prView',
      'PR #1: Test PR',
      1,
      expect.any(Object)
    );
    expect(PullRequestService.getInstance().getPRDetails).toHaveBeenCalled();
  });

  it('should reveal existing panel', async () => {
    const mockPanel = { reveal: vi.fn() };
    (PullRequestView as any).panels.set(1, mockPanel);
    
    await PullRequestView.show(mockContext, mockPR);
    
    expect(mockPanel.reveal).toHaveBeenCalled();
    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
  });
});
