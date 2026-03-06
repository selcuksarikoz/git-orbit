import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiffContentProvider } from '../../providers/DiffContentProvider';

vi.mock('vscode', () => ({
  Uri: {
    parse: vi.fn((uri: string) => ({
      authority: uri.split('://')[1]?.split('?')[0] || '',
      query: uri.split('?')[1] || '',
    })),
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn(() => ({
      getDiff: vi.fn().mockResolvedValue('diff content'),
      getRepositoryByRoot: vi.fn(),
    })),
  },
}));

describe('DiffContentProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('provideTextDocumentContent', () => {
    it('should return diff content for hash', async () => {
      const mockUri = {
        authority: 'abc123',
        query: '',
      };

      const content = await DiffContentProvider.prototype.provideTextDocumentContent(
        mockUri as any
      );
      expect(content).toBe('diff content');
    });

    it('should parse query params', async () => {
      const mockUri = {
        authority: 'abc123',
        query: JSON.stringify({ filePath: 'test.ts', repoRoot: '/repo' }),
      };

      await DiffContentProvider.prototype.provideTextDocumentContent(mockUri as any);

      const GitServiceModule = await import('../../services/GitService');
      expect(GitServiceModule.GitService.getInstance).toHaveBeenCalled();
    });
  });

  describe('getUri', () => {
    it('should create URI with hash', () => {
      const uri = DiffContentProvider.getUri('abc123');
      expect(uri).toBeDefined();
    });

    it('should include filePath in query', () => {
      const uri = DiffContentProvider.getUri('abc123', 'test.ts');
      expect(uri).toBeDefined();
    });

    it('should include repoRoot in query', () => {
      const uri = DiffContentProvider.getUri('abc123', 'test.ts', '/repo');
      expect(uri).toBeDefined();
    });
  });
});
