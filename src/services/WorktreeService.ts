import * as vscode from 'vscode';
import * as path from 'path';
import { GitService, GitRepository } from './GitService';

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  isBare: boolean;
  isLocked: boolean;
  lockReason?: string;
}

export class WorktreeService {
  private static instance: WorktreeService;
  private gitService: GitService;

  private constructor() {
    this.gitService = GitService.getInstance();
  }

  public static getInstance(): WorktreeService {
    if (!WorktreeService.instance) {
      WorktreeService.instance = new WorktreeService();
    }
    return WorktreeService.instance;
  }

  public async listWorktrees(repo?: GitRepository): Promise<WorktreeInfo[]> {
    const targetRepo = repo || this.gitService.getDefaultRepository();
    if (!targetRepo) return [];

    try {
      const result = await targetRepo.executor.exec(['worktree', 'list', '--porcelain']);

      const worktrees: WorktreeInfo[] = [];
      const entries = result.stdout.split('\n\n');

      for (const entry of entries) {
        if (!entry.trim()) continue;

        const worktree: Partial<WorktreeInfo> = {};
        const lines = entry.split('\n');

        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            worktree.path = line.replace('worktree ', '').trim();
          } else if (line.startsWith('HEAD ')) {
            worktree.head = line.replace('HEAD ', '').trim();
          } else if (line.startsWith('branch ')) {
            worktree.branch = line.replace('branch ', '').trim();
          } else if (line.startsWith('bare ')) {
            worktree.isBare = line.replace('bare ', '').trim() === 'true';
          } else if (line.startsWith('locked ')) {
            worktree.isLocked = true;
            worktree.lockReason = line.replace('locked ', '').trim();
          }
        }

        if (worktree.path) {
          worktrees.push(worktree as WorktreeInfo);
        }
      }

      return worktrees;
    } catch (error) {
      console.error('Failed to list worktrees:', error);
      return [];
    }
  }

  public async getCurrentWorktree(repo?: GitRepository): Promise<WorktreeInfo | undefined> {
    const worktrees = await this.listWorktrees(repo);
    return worktrees.find((wt) => !wt.isBare);
  }

  public async addWorktree(
    targetPath: string,
    branch: string,
    createBranch: boolean = false,
    repo?: GitRepository
  ): Promise<boolean> {
    const targetRepo = repo || this.gitService.getDefaultRepository();
    if (!targetRepo) {
      vscode.window.showErrorMessage('No repository selected');
      return false;
    }

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Creating worktree at ${targetPath}...`,
          cancellable: false,
        },
        async () => {
          const args = ['worktree', 'add'];

          if (createBranch) {
            args.push('-b', branch, targetPath);
          } else {
            args.push(targetPath, branch);
          }

          await targetRepo.executor.exec(args);
          vscode.window.showInformationMessage(`Worktree created at: ${targetPath}`);
        }
      );
      return true;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create worktree: ${error.message}`);
      return false;
    }
  }

  public async removeWorktree(
    worktreePath: string,
    force: boolean = false,
    repo?: GitRepository
  ): Promise<boolean> {
    const targetRepo = repo || this.gitService.getDefaultRepository();
    if (!targetRepo) {
      vscode.window.showErrorMessage('No repository selected');
      return false;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove worktree at ${worktreePath}?`,
      { modal: true },
      'Yes',
      'No'
    );

    if (confirm !== 'Yes') return false;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Removing worktree...',
          cancellable: false,
        },
        async () => {
          const args = force
            ? ['worktree', 'remove', '--force', worktreePath]
            : ['worktree', 'remove', worktreePath];

          await targetRepo.executor.exec(args);
          vscode.window.showInformationMessage('Worktree removed successfully');
        }
      );
      return true;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to remove worktree: ${error.message}`);
      return false;
    }
  }

  public async pruneWorktrees(repo?: GitRepository): Promise<boolean> {
    const targetRepo = repo || this.gitService.getDefaultRepository();
    if (!targetRepo) {
      vscode.window.showErrorMessage('No repository selected');
      return false;
    }

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pruning worktrees...',
          cancellable: false,
        },
        async () => {
          await targetRepo.executor.exec(['worktree', 'prune']);
          vscode.window.showInformationMessage('Worktrees pruned successfully');
        }
      );
      return true;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to prune worktrees: ${error.message}`);
      return false;
    }
  }

  public async lockWorktree(
    worktreePath: string,
    reason: string,
    repo?: GitRepository
  ): Promise<boolean> {
    const targetRepo = repo || this.gitService.getDefaultRepository();
    if (!targetRepo) return false;

    try {
      await targetRepo.executor.exec(['worktree', 'lock', worktreePath, '-m', reason]);
      vscode.window.showInformationMessage('Worktree locked');
      return true;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to lock worktree: ${error.message}`);
      return false;
    }
  }

  public async unlockWorktree(worktreePath: string, repo?: GitRepository): Promise<boolean> {
    const targetRepo = repo || this.gitService.getDefaultRepository();
    if (!targetRepo) return false;

    try {
      await targetRepo.executor.exec(['worktree', 'unlock', worktreePath]);
      vscode.window.showInformationMessage('Worktree unlocked');
      return true;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to unlock worktree: ${error.message}`);
      return false;
    }
  }

  public async showWorktreeMenu() {
    const worktrees = await this.listWorktrees();

    if (worktrees.length === 0) {
      vscode.window.showInformationMessage('No worktrees found');
      return;
    }

    const items: vscode.QuickPickItem[] = worktrees.map((wt) => ({
      label: `$(folder) ${path.basename(wt.path)}`,
      description: `Branch: ${wt.branch || wt.head} | Path: ${wt.path}`,
      detail: wt.isLocked ? `Locked: ${wt.lockReason}` : undefined,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select worktree',
    });

    if (selected) {
      const wt = worktrees[items.indexOf(selected)];
      await this.openWorktree(wt.path);
    }
  }

  public async openWorktree(worktreePath: string) {
    const uri = vscode.Uri.file(worktreePath);
    await vscode.commands.executeCommand('vscode.openFolder', uri);
  }

  public async showCreateWorktreeDialog(repo?: GitRepository) {
    const targetRepo = repo || this.gitService.getDefaultRepository();
    if (!targetRepo) {
      vscode.window.showErrorMessage('No repository selected');
      return;
    }

    const branches = await this.gitService.getBranches(targetRepo);
    const currentWorktrees = await this.listWorktrees(targetRepo);
    const usedPaths = new Set(currentWorktrees.map((wt) => wt.path));

    const parentDir = path.dirname(targetRepo.rootDir);
    const parentFolderName = path.basename(targetRepo.rootDir);

    const branch = await vscode.window.showQuickPick(branches.all, {
      placeHolder: 'Select branch for worktree',
      title: 'Create Worktree: Select Branch',
    });

    if (!branch) return;

    const worktreeName = await vscode.window.showInputBox({
      prompt: 'Enter worktree directory name',
      placeHolder: `e.g. ${branch.replace('/', '-')}`,
      value: branch.replace('/', '-'),
    });

    if (!worktreeName) return;

    const targetPath = path.join(parentDir, `${parentFolderName}-${worktreeName}`);

    if (usedPaths.has(targetPath)) {
      vscode.window.showErrorMessage('A worktree already exists at this path');
      return;
    }

    const createBranch = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: `Create new branch '${branch}'?`,
      title: 'Create Worktree: New Branch',
    });

    const shouldCreateBranch = createBranch === 'Yes';

    await this.addWorktree(targetPath, branch, shouldCreateBranch, targetRepo);
  }
}
