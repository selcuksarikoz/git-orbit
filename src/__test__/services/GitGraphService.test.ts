import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import {
  GitGraphService,
  GitGraphData,
  GitGraphNode,
  GitGraphEdge,
} from '../../services/GitGraphService';
import { GitService } from '../../services/GitService';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/test/workspace', scheme: 'file' },
        name: 'test-workspace',
        index: 0,
      },
    ],
    fs: {
      readDirectory: vi.fn(),
      stat: vi.fn(),
    },
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
  },
  FileType: {
    Directory: 1,
    File: 2,
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
  },
}));

vi.mock('../../utils/GitExecutor', () => ({
  GitExecutor: vi.fn().mockImplementation(() => ({
    exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  })),
}));

describe('GitGraphService', () => {
  let gitGraphService: GitGraphService;
  let mockExecutorExec: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    (GitService as any).instance = undefined;

    mockExecutorExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    vi.mocked(vscode.workspace.fs.stat).mockImplementation(async (uri: any) => {
      if (uri.fsPath.endsWith('.git')) {
        return { type: vscode.FileType.Directory } as any;
      }
      throw new Error('Not found');
    });

    const gitService = GitService.getInstance();
    await gitService.ensureInitialized();
    Object.defineProperty(gitService, 'executor', {
      get: () => ({ exec: mockExecutorExec }),
      configurable: true,
    });

    gitGraphService = new GitGraphService();
  });

  describe('getGraphData', () => {
    it('should return empty graph data when no commits', async () => {
      mockExecutorExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const result = await gitGraphService.getGraphData(100);
      expect(result).toEqual({
        nodes: [],
        edges: [],
        branches: new Map(),
        maxColumn: 0,
      });
    });

    it('should call git log command', async () => {
      mockExecutorExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await gitGraphService.getGraphData(100);
      expect(mockExecutorExec).toHaveBeenCalledWith(
        expect.arrayContaining(['log', '--graph', '--pretty=format:%H|%h|%P|%an|%ae|%at|%s|%D'])
      );
    });

    it('should throw error when executor not initialized', async () => {
      (GitService as any).instance = undefined;
      const service = new GitGraphService();
      const gitService = GitService.getInstance();
      await gitService.ensureInitialized();
      Object.defineProperty(gitService, 'executor', {
        get: () => null,
        configurable: true,
      });
      await expect(service.getGraphData(100)).rejects.toThrow('Git executor not initialized');
    });
  });

  describe('searchCommits', () => {
    it('should call getGraphData and filter results', async () => {
      mockExecutorExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const results = await gitGraphService.searchCommits('test');
      expect(mockExecutorExec).toHaveBeenCalled();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array when no commits found', async () => {
      mockExecutorExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const results = await gitGraphService.searchCommits('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('GitGraphNode interface', () => {
    it('should have correct structure', () => {
      const node: GitGraphNode = {
        hash: 'abc123',
        shortHash: 'abc123',
        message: 'Test commit',
        author: 'John Doe',
        authorEmail: 'john@example.com',
        date: new Date(),
        timestamp: 1700000000,
        parents: ['parent1', 'parent2'],
        refs: ['main'],
        column: 0,
        row: 0,
      };
      expect(node.hash).toBe('abc123');
      expect(node.parents.length).toBe(2);
      expect(node.column).toBe(0);
    });
  });

  describe('GitGraphEdge interface', () => {
    it('should have correct structure', () => {
      const edge: GitGraphEdge = {
        from: 'abc123',
        to: 'parent1',
        fromColumn: 0,
        toColumn: 1,
        color: '#E06C75',
        type: 'normal',
      };
      expect(edge.from).toBe('abc123');
      expect(edge.type).toBe('normal');
    });

    it('should support merge type', () => {
      const edge: GitGraphEdge = {
        from: 'abc123',
        to: 'parent2',
        fromColumn: 0,
        toColumn: 2,
        color: '#98C379',
        type: 'merge',
      };
      expect(edge.type).toBe('merge');
    });
  });

  describe('GitGraphData interface', () => {
    it('should have correct structure', () => {
      const data: GitGraphData = {
        nodes: [],
        edges: [],
        branches: new Map(),
        maxColumn: 0,
      };
      expect(data.nodes).toEqual([]);
      expect(data.edges).toEqual([]);
      expect(data.branches instanceof Map).toBe(true);
    });
  });
});
