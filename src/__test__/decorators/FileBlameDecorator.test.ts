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
});
