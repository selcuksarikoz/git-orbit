import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { BisectService, BisectState } from '../../services/BisectService';
import { GitService } from '../../services/GitService';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn().mockReturnValue({
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      command: '',
      text: '',
      tooltip: '',
      backgroundColor: undefined,
    }),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  StatusBarAlignment: {
    Left: 1,
  },
  ThemeColor: vi.fn(),
  QuickPickItemKind: {
    Separator: -1,
  },
}));

// Mock GitService
vi.mock('../../services/GitService', () => {
  const defaultExecutor = {
    exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  };
  return {
    GitService: {
      getInstance: vi.fn().mockReturnValue({
        executor: defaultExecutor,
        getDefaultRepository: vi.fn(() => ({ rootDir: '/default', executor: defaultExecutor })),
        getRepositoryByRoot: vi.fn(),
        getStatus: vi.fn().mockResolvedValue([]),
        getBranches: vi.fn().mockResolvedValue({ all: ['main', 'develop'], current: 'main' }),
      }),
    },
  };
});

describe('BisectService', () => {
  let bisectService: BisectService;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (BisectService as any).instance = undefined;
    bisectService = BisectService.getInstance();
    mockGitService = GitService.getInstance();
  });

  it('should be a singleton', () => {
    const instance2 = BisectService.getInstance();
    expect(bisectService).toBe(instance2);
  });

  it('should start with Idle state', () => {
    expect(bisectService.currentState).toBe(BisectState.Idle);
  });

  it('should start bisect session', async () => {
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: 'main' } as any);
    vi.mocked(vscode.window.showQuickPick)
      .mockResolvedValueOnce({ label: 'main' } as any)
      .mockResolvedValueOnce({ label: 'develop' } as any);

    await bisectService.start();

    expect(bisectService.currentState).toBe(BisectState.Active);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'gitorbit.ctx.bisectActive',
      true
    );
  });

  it('should mark as good and handle result', async () => {
    // Manually set state for test
    (bisectService as any).state = BisectState.Active;

    mockGitService.executor.exec.mockResolvedValue({
      stdout: 'some output',
      stderr: '',
      exitCode: 0,
    });

    await bisectService.markGood();

    expect(mockGitService.executor.exec).toHaveBeenCalledWith(['bisect', 'good']);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Marked. Moving to next commit...'
    );
  });

  it('should find the culprit', async () => {
    (bisectService as any).state = BisectState.Active;

    mockGitService.executor.exec.mockResolvedValue({
      stdout: 'abcdef123 is the first bad commit\n',
      stderr: '',
      exitCode: 0,
    });

    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Reset Bisect' as any);

    await bisectService.markBad();

    expect(bisectService.currentState).toBe(BisectState.Finished);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Found the culprit!'),
      'View Details',
      'Reset Bisect'
    );
  });

  it('should reset bisect session', async () => {
    (bisectService as any).state = BisectState.Active;
    mockGitService.executor.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await bisectService.reset();

    expect(bisectService.currentState).toBe(BisectState.Idle);
    expect(mockGitService.executor.exec).toHaveBeenCalledWith(['bisect', 'reset']);
  });

  it('should get bisect log', async () => {
    (bisectService as any).state = BisectState.Active;
    mockGitService.executor.exec.mockResolvedValue({
      stdout: 'git bisect bad abcdef1\ngit bisect good 1234567\n',
      stderr: '',
      exitCode: 0,
    });

    const log = await bisectService.getLog();

    expect(log.length).toBe(2);
    expect(log[0].hash).toBe('1234567'); // reversed
    expect(log[1].hash).toBe('abcdef1');
  });

  describe('active repository', () => {
    it('should set and get the active repo', () => {
      const repo = { rootDir: '/repo-b', executor: { exec: vi.fn() } } as any;
      bisectService.setActiveRepo(repo);
      expect(bisectService.getActiveRepo()).toBe(repo);
    });

    it('should run bisect commands against the active repo', async () => {
      const activeExec = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
      bisectService.setActiveRepo({ rootDir: '/repo-b', executor: { exec: activeExec } } as any);
      (bisectService as any).state = BisectState.Active;

      await bisectService.markGood();

      expect(activeExec).toHaveBeenCalledWith(['bisect', 'good']);
      expect(mockGitService.executor.exec).not.toHaveBeenCalledWith(['bisect', 'good']);
    });

    it('should honour the repository passed via the tree item on start', async () => {
      const activeExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const repo = { rootDir: '/repo-b', executor: { exec: activeExec } };
      mockGitService.getRepositoryByRoot.mockReturnValue(repo);
      vi.mocked(vscode.window.showQuickPick)
        .mockResolvedValueOnce({ label: 'main' } as any)
        .mockResolvedValueOnce({ label: 'develop' } as any);

      await bisectService.start({ repoRoot: '/repo-b' });

      expect(bisectService.getActiveRepo()).toBe(repo);
      expect(activeExec).toHaveBeenCalledWith(['bisect', 'start']);
    });
  });

  describe('auto-stash restoration', () => {
    it('should pop only the exact stash ref recorded at start', async () => {
      const exec = vi.fn().mockImplementation((args: string[]) => {
        if (args[0] === 'rev-parse' && args.includes('--verify')) {
          return Promise.resolve({ stdout: 'deadbeefstash\n', stderr: '', exitCode: 0 });
        }
        if (args[0] === 'stash' && args[1] === 'list') {
          return Promise.resolve({
            stdout: 'stash@{0}: GitOrbit: Auto-stash before bisect\n',
            stderr: '',
            exitCode: 0,
          });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });
      bisectService.setActiveRepo({ rootDir: '/repo-b', executor: { exec } } as any);

      mockGitService.getStatus.mockResolvedValueOnce([{ path: 'file.ts' }]);
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        'Stash Changes & Continue' as any
      );
      vi.mocked(vscode.window.showQuickPick)
        .mockResolvedValueOnce({ label: 'main' } as any)
        .mockResolvedValueOnce({ label: 'develop' } as any);

      await bisectService.start();

      expect(exec).toHaveBeenCalledWith([
        'stash',
        'push',
        '-m',
        'GitOrbit: Auto-stash before bisect',
      ]);
      expect(exec).toHaveBeenCalledWith(['rev-parse', '--verify', 'refs/stash']);

      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Restore' as any);
      await bisectService.reset();

      expect(exec).toHaveBeenCalledWith(['stash', 'pop', 'deadbeefstash']);
      expect(exec).not.toHaveBeenCalledWith(['stash', 'pop']);
    });
  });
});
