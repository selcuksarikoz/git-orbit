import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileBlameDecorator } from '../../decorators/FileBlameDecorator';

vi.mock('vscode', () => ({
  window: {
    createTextEditorDecorationType: vi.fn(() => ({})),
    onDidChangeActiveTextEditor: vi.fn(),
    activeTextEditor: undefined,
  },
  workspace: {
    onDidChangeConfiguration: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn(() => ({
      getBlame: vi.fn(),
      getRepositoryForPath: vi.fn(),
    })),
  },
}));

vi.mock('../../services/ConfigService', () => ({
  ConfigService: {
    getInstance: vi.fn(() => ({
      isFileBlameEnabled: true,
    })),
  },
}));

vi.mock('../../utils/BlameUtils', () => ({
  formatRelativeTime: vi.fn(() => '2 days ago'),
}));

describe('FileBlameDecorator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (FileBlameDecorator as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = FileBlameDecorator.getInstance();
      const instance2 = FileBlameDecorator.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  it('should not apply decorations when hidden during the blame lookup', async () => {
    const decorator = FileBlameDecorator.getInstance();
    const editor: any = {
      document: { uri: { fsPath: '/test/file.ts' }, lineCount: 1 },
      setDecorations: vi.fn(),
      selection: { active: { line: 0 } },
    };

    let resolveBlame: (value: string) => void = () => {};
    ((decorator as any).gitService.getBlame as any).mockReturnValue(
      new Promise<string>((resolve) => {
        resolveBlame = resolve;
      })
    );

    const pending = decorator.show(editor);
    decorator.hide();
    resolveBlame(
      '4927f1b74581c7f9999999999999999999999999 1 1 1\n' +
        'author John Doe\n' +
        'author-time 1672531200\n' +
        '\tline content\n'
    );
    await pending;

    expect(editor.setDecorations.mock.calls.every((call: any[]) => call[1].length === 0)).toBe(
      true
    );
  });
});
