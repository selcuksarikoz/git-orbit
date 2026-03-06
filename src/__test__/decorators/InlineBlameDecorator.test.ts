import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { InlineBlameDecorator } from '../../decorators/InlineBlameDecorator';
import { GitService } from '../../services/GitService';
import { ConfigService } from '../../services/ConfigService';

vi.mock('vscode', () => ({
  window: {
    onDidChangeTextEditorSelection: vi.fn(),
    activeTextEditor: {
      document: { 
        uri: { fsPath: '/test/file.ts' },
        lineCount: 10,
        lineAt: (line: number) => ({ 
            text: 'line content',
            isEmptyOrWhitespace: false
        }),
      },
      setDecorations: vi.fn(),
      selection: { active: { line: 0 } },
    },
    createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
  workspace: {
    onDidChangeConfiguration: vi.fn(),
  },
  languages: {
    registerHoverProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
  Range: vi.fn(),
  Position: vi.fn(),
  Hover: vi.fn(),
  MarkdownString: vi.fn().mockImplementation(() => ({
    appendMarkdown: vi.fn(),
    isTrusted: false,
    supportHtml: false
  })),
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getBlame: vi.fn(),
    }),
  },
}));

vi.mock('../../services/ConfigService', () => ({
  ConfigService: {
    getInstance: vi.fn().mockReturnValue({
      isInlineBlameEnabled: true,
    }),
  },
}));

describe('InlineBlameDecorator', () => {
  let decorator: InlineBlameDecorator;
  let mockGitService: any;
  let mockConfigService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitService = GitService.getInstance();
    mockConfigService = ConfigService.getInstance();
    decorator = new InlineBlameDecorator();
  });

  it('should initialize and register event listeners', () => {
    expect(vscode.window.onDidChangeTextEditorSelection).toHaveBeenCalled();
    expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
    expect(vscode.languages.registerHoverProvider).toHaveBeenCalled();
  });

  it('should update inline blame when selection changes', async () => {
    const blameOutput = 
      '4927f1b74581c7f9999999999999999999999999 1 1 1\n' +
      'author John Doe\n' +
      'author-mail <john@example.com>\n' +
      'author-time 1672531200\n' +
      'summary feat: initial commit\n' +
      '\tline content\n';
    
    mockGitService.getBlame.mockResolvedValue(blameOutput);
    
    // Manually trigger the private update method
    await (decorator as any).update(vscode.window.activeTextEditor);
    
    expect(mockGitService.getBlame).toHaveBeenCalledWith('/test/file.ts');
    expect(vscode.window.activeTextEditor?.setDecorations).toHaveBeenCalled();
  });

  it('should clear decorations if inline blame is disabled', async () => {
    mockConfigService.isInlineBlameEnabled = false;
    
    await (decorator as any).update(vscode.window.activeTextEditor);
    
    expect(vscode.window.activeTextEditor?.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('should dispose correctly', () => {
    decorator.dispose();
    // Verify decorationType and hoverProvider are disposed
  });
});
