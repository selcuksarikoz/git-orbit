import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitExecutor } from '../../utils/GitExecutor';
import * as cp from 'child_process';
import { EventEmitter } from 'events';

vi.mock('child_process');

describe('GitExecutor', () => {
  const baseDir = '/test/dir';
  let executor: GitExecutor;

  beforeEach(() => {
    executor = new GitExecutor(baseDir);
    vi.clearAllMocks();

    vi.mocked(cp.spawn).mockImplementation(() => {
      const mockStdout = new EventEmitter();
      const mockStderr = new EventEmitter();
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = mockStdout;
      mockProcess.stderr = mockStderr;
      return mockProcess;
    });
  });

  it('should execute git command successfully', async () => {
    const execPromise = executor.exec(['status']);
    const mockProcess = vi.mocked(cp.spawn).mock.results[0].value;

    mockProcess.stdout.emit('data', Buffer.from('On branch main'));
    mockProcess.emit('close', 0);

    const result = await execPromise;

    expect(result.stdout).toBe('On branch main');
    expect(result.exitCode).toBe(0);
    expect(cp.spawn).toHaveBeenCalledWith('git', ['status'], { cwd: baseDir });
  });

  it('should reject if git command fails with non-zero exit code', async () => {
    const execPromise = executor.exec(['invalid']);
    const mockProcess = vi.mocked(cp.spawn).mock.results[0].value;

    mockProcess.stderr.emit('data', Buffer.from('fatal: unknown command'));
    mockProcess.emit('close', 1);

    await expect(execPromise).rejects.toThrow('Git command failed with exit code 1: fatal: unknown command');
  });

  it('should reject if spawn throws an error', async () => {
    const execPromise = executor.exec(['status']);
    const mockProcess = vi.mocked(cp.spawn).mock.results[0].value;

    mockProcess.emit('error', new Error('Spawn error'));

    await expect(execPromise).rejects.toThrow('Spawn error');
  });
});
