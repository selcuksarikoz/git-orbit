import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { CherryPickCommand } from '../../commands/CherryPickCommand';
import { GitService } from '../../services/GitService';

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
  },
}));

vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      cherryPick: vi.fn(),
      commit: vi.fn(),
      skipCherryPick: vi.fn(),
    }),
  },
}));

describe('CherryPickCommand', () => {
  let cherryPickCommand: CherryPickCommand;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitService = GitService.getInstance();
    cherryPickCommand = new CherryPickCommand();
  });

  it('should show error if no commit hash', async () => {
    await cherryPickCommand.execute('');
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'No commit hash provided for cherry-pick.'
    );
  });

  it('should cherry-pick with selected options', async () => {
    const hash = 'abc123';
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: 'Standard',
      value: [],
    } as any);

    await cherryPickCommand.execute(hash);

    expect(mockGitService.cherryPick).toHaveBeenCalledWith(hash, []);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Successfully cherry-picked')
    );
  });

  it('should handle empty cherry-pick and allow commit', async () => {
    const hash = 'abc123';
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: 'Standard',
      value: [],
    } as any);
    mockGitService.cherryPick.mockRejectedValue(new Error('cherry-pick is now empty'));
    vi.mocked(vscode.window.showErrorMessage).mockResolvedValue('Commit --allow-empty' as any);

    await cherryPickCommand.execute(hash);

    expect(mockGitService.commit).toHaveBeenCalledWith(['--allow-empty', '--no-edit']);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('as empty commit')
    );
  });

  it('should handle empty cherry-pick and skip', async () => {
    const hash = 'abc123';
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: 'Standard',
      value: [],
    } as any);
    mockGitService.cherryPick.mockRejectedValue(new Error('cherry-pick is now empty'));
    vi.mocked(vscode.window.showErrorMessage).mockResolvedValue('Skip commit' as any);

    await cherryPickCommand.execute(hash);

    expect(mockGitService.skipCherryPick).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Skipped empty cherry-pick.');
  });
});
