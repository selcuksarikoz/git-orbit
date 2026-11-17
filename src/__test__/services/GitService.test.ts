import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../../services/GitService';
import { GitExecutor } from '../../utils/GitExecutor';

// Mock vscode
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

// Mock GitExecutor
vi.mock('../../utils/GitExecutor', () => {
  return {
    GitExecutor: vi.fn().mockImplementation((dir) => ({
      exec: vi.fn().mockImplementation((args) => {
        if (args.includes('rev-parse') && args.includes('--show-toplevel')) {
          return Promise.resolve({ stdout: dir, stderr: '', exitCode: 0 });
        }
        if (args.includes('rev-parse') && args.includes('--git-dir')) {
          return Promise.resolve({ stdout: '.git', stderr: '', exitCode: 0 });
        }
        if (args.includes('rev-parse') && args.includes('--git-common-dir')) {
          return Promise.resolve({ stdout: '.git', stderr: '', exitCode: 0 });
        }
        if (args.includes('branch') && args.includes('--show-current')) {
          return Promise.resolve({ stdout: 'main', stderr: '', exitCode: 0 });
        }
        if (args.includes('remote') && args.includes('get-url')) {
          return Promise.resolve({
            stdout: 'https://github.com/test/repo.git',
            stderr: '',
            exitCode: 0,
          });
        }
        if (args.includes('worktree') && args.includes('list')) {
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      }),
      baseDir: dir,
    })),
  };
});

describe('GitService', () => {
  let gitService: GitService;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset singleton instance for tests
    (GitService as any).instance = undefined;

    // Mock fs.stat to return true for .git directory
    vi.mocked(vscode.workspace.fs.stat).mockImplementation(async (uri: any) => {
      if (uri.fsPath.endsWith('.git')) {
        return { type: vscode.FileType.Directory } as any;
      }
      throw new Error('Not found');
    });

    // Mock fs.readDirectory
    vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue([]);

    gitService = GitService.getInstance();
    await gitService.ensureInitialized();
  });

  it('should be a singleton', () => {
    const instance2 = GitService.getInstance();
    expect(gitService).toBe(instance2);
  });

  it('should discover repositories in workspace folders', () => {
    const repos = gitService.getRepositories();
    expect(repos.length).toBeGreaterThan(0);
    expect(repos[0].rootDir).toBe('/test/workspace');
  });

  it('should return repository for a given path', () => {
    const repo = gitService.getRepositoryForPath('/test/workspace/src/file.ts');
    expect(repo).toBeDefined();
    expect(repo?.rootDir).toBe('/test/workspace');
  });

  it('should get branches for a repository', async () => {
    const repo = gitService.getDefaultRepository();
    const mockExecutor = repo?.executor as any;
    mockExecutor.exec.mockImplementation(async (args: string[]) => {
      if (args.includes('branch') && args.includes('-a')) {
        return {
          stdout: 'refs/heads/main\nrefs/heads/develop\nrefs/remotes/origin/main',
          stderr: '',
          exitCode: 0,
        };
      }
      if (args.includes('branch') && args.includes('--show-current')) {
        return { stdout: 'main', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const branches = await gitService.getBranches(repo);
    expect(branches.all).toContain('main');
    expect(branches.all).toContain('develop');
    expect(branches.all).toContain('remotes/origin/main');
    expect(branches.current).toBe('main');
  });

  it('should get status for a repository', async () => {
    const repo = gitService.getDefaultRepository();
    const mockExecutor = repo?.executor as any;
    mockExecutor.exec.mockResolvedValue({
      stdout: 'M src/file1.ts\0 Msrc/file2.ts\0??newfile.ts\0',
      stderr: '',
      exitCode: 0,
    });

    const status = await gitService.getStatus(repo);
    expect(status.length).toBe(3);
    expect(status[0].path).toBe('src/file1.ts');
    expect(status[0].stagedStatus).toBe('M');
    expect(status[2].path).toBe('newfile.ts');
    expect(status[2].workingTreeStatus).toBe('?');
  });

  it('should clear cache', () => {
    // This just verifies it doesn't throw
    expect(() => gitService.clearCache()).not.toThrow();
  });

  describe('getActiveExecutor', () => {
    it('returns the default repository executor after initialization', async () => {
      const repo = gitService.getDefaultRepository();
      await expect(gitService.getActiveExecutor()).resolves.toBe(repo?.executor);
    });
  });

  describe('advanced multi-repo operations', () => {
    const getExec = () =>
      (gitService.getDefaultRepository()!.executor as any).exec as ReturnType<typeof vi.fn>;

    it('merges a branch', async () => {
      await gitService.mergeBranch('feature/x');
      expect(getExec()).toHaveBeenCalledWith(['merge', 'feature/x']);
    });

    it('continues and skips a rebase', async () => {
      await gitService.rebaseContinue();
      await gitService.rebaseSkip();
      expect(getExec()).toHaveBeenCalledWith(['rebase', '--continue']);
      expect(getExec()).toHaveBeenCalledWith(['rebase', '--skip']);
    });

    it('continues and aborts a cherry-pick', async () => {
      await gitService.cherryPickContinue();
      await gitService.cherryPickAbort();
      expect(getExec()).toHaveBeenCalledWith(['cherry-pick', '--continue']);
      expect(getExec()).toHaveBeenCalledWith(['cherry-pick', '--abort']);
    });

    it('creates, deletes and pushes tags', async () => {
      await gitService.createTag('v1.0.0', 'abc123');
      await gitService.deleteTag('v1.0.0');
      await gitService.pushTag('v1.0.0');
      await gitService.pushTag('v1.0.0', 'upstream');

      expect(getExec()).toHaveBeenCalledWith(['tag', 'v1.0.0', 'abc123']);
      expect(getExec()).toHaveBeenCalledWith(['tag', '-d', 'v1.0.0']);
      expect(getExec()).toHaveBeenCalledWith(['push', 'origin', 'v1.0.0']);
      expect(getExec()).toHaveBeenCalledWith(['push', 'upstream', 'v1.0.0']);
    });

    it('fetches a named remote or all remotes', async () => {
      await gitService.fetchRemote('upstream');
      await gitService.fetchRemote();
      expect(getExec()).toHaveBeenCalledWith(['fetch', 'upstream']);
      expect(getExec()).toHaveBeenCalledWith(['fetch', '--all']);
    });

    it('targets the supplied repository and clears cache after a mutation', async () => {
      const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const otherRepo = { rootDir: '/other/repo', executor: { exec } } as any;
      const clearSpy = vi.spyOn(gitService, 'clearCache');

      await gitService.mergeBranch('develop', otherRepo);

      expect(exec).toHaveBeenCalledWith(['merge', 'develop']);
      expect(getExec()).not.toHaveBeenCalledWith(['merge', 'develop']);
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('refreshRepositories', () => {
    it('reassigns the init promise and clears a stale selected repository', async () => {
      gitService.setSelectedRepository({ rootDir: '/gone', executor: {} } as any);
      const oldPromise = (gitService as any)._initializePromise;

      await gitService.refreshRepositories();

      expect(gitService.getSelectedRepository()).toBeUndefined();
      expect((gitService as any)._initializePromise).not.toBe(oldPromise);
      expect((gitService as any)._onDidChangeSelectedRepo.fire).toHaveBeenCalledWith(undefined);
    });
  });

  describe('repository discovery', () => {
    it('discovers the enclosing repository when a folder is inside a repo', async () => {
      const GitExecutorMock = vi.mocked(GitExecutor);
      const original = GitExecutorMock.getMockImplementation();
      try {
        (GitService as any).instance = undefined;
        vi.mocked(vscode.workspace.fs.stat).mockImplementation(async () => {
          throw new Error('not found');
        });
        vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue([]);
        GitExecutorMock.mockImplementation(
          (dir: string) =>
            ({
              exec: vi.fn().mockImplementation((args: string[]) => {
                if (args.includes('rev-parse') && args.includes('--show-toplevel')) {
                  return Promise.resolve({
                    stdout: dir === '/test/workspace' ? '/enclosing/repo' : dir,
                    stderr: '',
                    exitCode: 0,
                  });
                }
                if (args.includes('rev-parse') && args.includes('--git-dir')) {
                  return Promise.resolve({ stdout: '.git', stderr: '', exitCode: 0 });
                }
                if (args.includes('rev-parse') && args.includes('--git-common-dir')) {
                  return Promise.resolve({ stdout: '.git', stderr: '', exitCode: 0 });
                }
                if (args.includes('branch') && args.includes('--show-current')) {
                  return Promise.resolve({ stdout: 'main', stderr: '', exitCode: 0 });
                }
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
              }),
              baseDir: dir,
            }) as any
        );

        const service = GitService.getInstance();
        await service.ensureInitialized();

        expect(service.getRepositories().some((r) => r.rootDir === '/enclosing/repo')).toBe(true);
      } finally {
        GitExecutorMock.mockImplementation(original!);
        (GitService as any).instance = undefined;
      }
    });
  });
});
