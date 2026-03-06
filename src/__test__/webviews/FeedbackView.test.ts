import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { FeedbackView } from '../../webviews/FeedbackView';

// Mock vscode
vi.mock('vscode', () => {
  return {
    window: {
      activeTextEditor: { viewColumn: 1 },
      createWebviewPanel: vi.fn().mockReturnValue({
        webview: {
          html: '',
        },
        onDidDispose: vi.fn(),
        reveal: vi.fn(),
      }),
    },
    ViewColumn: { One: 1 },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    },
  };
});

describe('FeedbackView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (FeedbackView as any).currentPanel = undefined;
  });

  it('should create and show feedback panel', () => {
    FeedbackView.show({ fsPath: '/extension' } as any);
    
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'gitorbit.feedback',
      'GitOrbit - Support & Feedback',
      1,
      expect.any(Object)
    );
  });

  it('should reveal existing panel', () => {
    const mockPanel = { reveal: vi.fn() };
    (FeedbackView as any).currentPanel = mockPanel;
    
    FeedbackView.show({ fsPath: '/extension' } as any);
    
    expect(mockPanel.reveal).toHaveBeenCalled();
    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
  });
});
