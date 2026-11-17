import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { GutterBlameDecorator } from '../../decorators/GutterBlameDecorator';
import { GitService } from '../../services/GitService';
import { ConfigService } from '../../services/ConfigService';

vi.mock('vscode', () => {
  const mockSetDecorations = vi.fn();
  return {
    __esModule: true,
    window: {
      onDidChangeActiveTextEditor: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      activeTextEditor: {
        document: {
          uri: { fsPath: '/test/file.ts' },
          lineCount: 10,
          lineAt: (line: number) => ({ text: 'line content' }),
        },
        setDecorations: mockSetDecorations,
        selection: { active: { line: 0 } },
      },
      createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      showWarningMessage: vi.fn(),
      showInformationMessage: vi.fn(),
    },
    workspace: {
      onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    commands: {
      registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    OverviewRulerLane: { Left: 1 },
    Uri: {
      parse: vi.fn((path) => ({ fsPath: path, scheme: 'file' })),
      file: (path: string) => ({ fsPath: path, scheme: 'file' }),
    },
    Range: vi.fn().mockImplementation(() => ({})),
    MarkdownString: vi.fn().mockImplementation(() => ({
      appendMarkdown: vi.fn(),
      isTrusted: false,
    })),
    mockSetDecorations,
  };
});

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getBlame: vi
        .fn()
        .mockResolvedValue(
          '4927b1b74581c7f9999999999999999999999999 1 1 1\n' +
            'author John Doe\n' +
            'author-mail <john@example.com>\n' +
            'author-time 1672531200\n' +
            'summary feat: initial commit\n' +
            '\tline content\n'
        ),
    }),
  },
}));

vi.mock('../../services/ConfigService', () => ({
  ConfigService: {
    getInstance: vi.fn().mockReturnValue({
      isGutterBlameEnabled: true,
    }),
  },
}));

describe('GutterBlameDecorator', () => {
  let decorator: GutterBlameDecorator;
  let mockGitService: any;
  let mockConfigService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitService = GitService.getInstance();
    mockConfigService = ConfigService.getInstance();
    mockConfigService.isGutterBlameEnabled = true;
    decorator = new GutterBlameDecorator(vscode.Uri.file('/extension'));
  });

  it('should initialize and register event listeners', () => {
    expect(vscode.window.onDidChangeActiveTextEditor).toHaveBeenCalled();
    expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'gitorbit.showBlameDetails',
      expect.any(Function)
    );
  });

  it('should update decorations when active editor changes', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockGitService.getBlame).toHaveBeenCalledWith('/test/file.ts');
  });

  it('should clear decorations if disabled in config', async () => {
    mockConfigService.isGutterBlameEnabled = false;

    (decorator as any).update(vscode.window.activeTextEditor);

    expect(vscode.window.activeTextEditor?.setDecorations).toHaveBeenCalledWith(
      expect.anything(),
      []
    );
  });

  it('should clear decorations on the previously active editor when switching', async () => {
    const first = { ...vscode.window.activeTextEditor, setDecorations: vi.fn() };
    const second = { ...vscode.window.activeTextEditor, setDecorations: vi.fn() };

    await (decorator as any).update(first);
    await (decorator as any).update(second);

    expect(first.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('should use parsed line numbers for decoration ranges', async () => {
    mockGitService.getBlame.mockResolvedValue(
      '1111111111111111111111111111111111111111 1 1 2\n' +
        '\tline one\n' +
        '2222222222222222222222222222222222222222 2 2 2\n' +
        'author John Doe\n' +
        'author-mail <john@example.com>\n' +
        'author-time 1672531200\n' +
        'summary feat: x\n' +
        '\tline two\n'
    );

    await (decorator as any).update(vscode.window.activeTextEditor);

    expect(vscode.Range).toHaveBeenCalledWith(1, 0, 1, 0);
  });

  it('should dispose correctly', () => {
    decorator.dispose();
  });
});
