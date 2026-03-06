import * as vscode from 'vscode';
import { GitService } from '../services/GitService';
import { BranchTreeProvider } from '../providers/BranchTreeProvider';

/**
 * Handles all branch-related Git operations such as push, pull, sync, checkout, and deletion.
 * Implements the Singleton pattern.
 */
export class BranchCommands {
  private static instance: BranchCommands;
  private gitService: GitService;
  private refreshCallback: () => void;
  private localBranchProvider: BranchTreeProvider;
  private remoteBranchProvider: BranchTreeProvider;

  private constructor(
    refreshCallback: () => void,
    localBranchProvider: BranchTreeProvider,
    remoteBranchProvider: BranchTreeProvider
  ) {
    this.gitService = GitService.getInstance();
    this.refreshCallback = refreshCallback;
    this.localBranchProvider = localBranchProvider;
    this.remoteBranchProvider = remoteBranchProvider;
  }

  /**
   * Returns the singleton instance of BranchCommands.
   * @param refreshCallback - Callback function to refresh the UI after operations.
   * @returns The singleton instance.
   */
  public static getInstance(
    refreshCallback?: () => void,
    localBranchProvider?: BranchTreeProvider,
    remoteBranchProvider?: BranchTreeProvider
  ): BranchCommands {
    if (!BranchCommands.instance) {
      if (!refreshCallback || !localBranchProvider || !remoteBranchProvider) {
        throw new Error('BranchCommands initialized without refresh callback');
      }
      BranchCommands.instance = new BranchCommands(
        refreshCallback,
        localBranchProvider,
        remoteBranchProvider
      );
    }
    return BranchCommands.instance;
  }

  /**
   * Registers branch-related commands to the extension context.
   * @param context - The extension context.
   */
  public register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorbit.pushBranch', this.pushBranch.bind(this)),
      vscode.commands.registerCommand('gitorbit.pullBranch', this.pullBranch.bind(this)),
      vscode.commands.registerCommand('gitorbit.syncBranch', this.syncBranch.bind(this)),
      vscode.commands.registerCommand('gitorbit.checkoutBranch', this.checkoutBranch.bind(this)),
      vscode.commands.registerCommand('gitorbit.deleteBranch', this.deleteBranch.bind(this)),
      vscode.commands.registerCommand(
        'gitorbit.forceDeleteBranch',
        this.forceDeleteBranch.bind(this)
      ),
      vscode.commands.registerCommand(
        'gitorbit.deleteRemoteBranch',
        this.deleteRemoteBranch.bind(this)
      ),
      vscode.commands.registerCommand('gitorbit.forceDeleteRemoteBranch', (item) =>
        this.deleteRemoteBranch(item, true)
      ),
      vscode.commands.registerCommand('gitorbit.deleteBranchMenu', this.deleteBranchMenu.bind(this))
    );
  }

  /**
   * Pushes the specified branch to the origin remote.
   * @param item - The tree item representing the branch.
   */
  private async pushBranch(item: any) {
    const branchName = item.branchName || item.label;
    // Show progress indicator while pushing
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Pushing ${branchName}...`,
        cancellable: false,
      },
      async () => {
        await this.gitService.push('origin', branchName);
        this.refreshCallback();
      }
    );
  }

  /**
   * Pulls changes for the specified branch from the origin remote.
   * Handles safe updates for background branches to avoid merge conflicts on current branch.
   * @param item - The tree item representing the branch.
   */
  private async pullBranch(item: any) {
    const branchName = item.branchName || item.label;
    // Extract actual branch name if it's a remote branch item
    const actualBranch = item.isRemote ? branchName.split('/').slice(1).join('/') : branchName;

    const branches = await this.gitService.getBranches();
    const isCurrent = branches.current === actualBranch;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Pulling ${actualBranch}...`,
        cancellable: false,
      },
      async () => {
        try {
          if (isCurrent) {
            await this.gitService.pull('origin', actualBranch);
          } else {
            await this.gitService.updateLocalBranchFromRemote(actualBranch);
          }
          this.refreshCallback();
        } catch (e: any) {
          vscode.window.showErrorMessage(e.message);
        }
      }
    );
  }

  /**
   * Syncs the branch by pulling changes and then pushing local changes.
   * Ensures safe operations depending on whether the branch is currently checked out.
   * @param item - The tree item representing the branch.
   */
  private async syncBranch(item: any) {
    const branchName = item.branchName || item.label;
    const branches = await this.gitService.getBranches();
    const isCurrent = branches.current === branchName;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Syncing ${branchName}...`,
        cancellable: false,
      },
      async () => {
        try {
          if (isCurrent) {
            await this.gitService.pull('origin', branchName);
            await this.gitService.push('origin', branchName);
          } else {
            // For background sync: Update local from remote (FF only), then push local (if ahead)
            await this.gitService.updateLocalBranchFromRemote(branchName);
            await this.gitService.push('origin', branchName);
          }
          this.refreshCallback();
        } catch (e: any) {
          vscode.window.showErrorMessage(`Sync failed: ${e.message}`);
        }
      }
    );
  }

  /**
   * Checks out to the specified branch.
   * @param item - The tree item representing the branch.
   */
  private async checkoutBranch(item: any) {
    const branchName = item.branchName || item.label;
    const repo = item.repo;
    // Handle remote branch names (e.g., origin/main -> main)
    const actualBranch = item.isRemote ? branchName.split('/').slice(1).join('/') : branchName;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Checking out to ${actualBranch}...`,
        cancellable: false,
      },
      async () => {
        try {
          await this.gitService.checkout(actualBranch, repo);
          this.refreshCallback();
        } catch (e: any) {
          vscode.window.showErrorMessage(`Checkout failed: ${e.message}`);
        }
      }
    );
  }

  /**
   * Deletes a local branch with safety checks.
   * @param item - The tree item representing the branch.
   */
  private async deleteBranch(item: any) {
    await this.handleDeleteBranch(item, false);
  }

  /**
   * Force deletes a local branch.
   * @param item - The tree item representing the branch.
   */
  private async forceDeleteBranch(item: any) {
    await this.handleDeleteBranch(item, true);
  }

  /**
   * Internal helper to handle branch deletion logic.
   * @param item - The tree item.
   * @param force - Whether to force delete.
   * @param isRemote - Whether to delete remote branch.
   */
  private async handleDeleteBranch(item: any, force: boolean, isRemote: boolean = false) {
    const repo = item.repo;
    if (isRemote) {
      const branchName = item.branchName || item.label;
      const remote = 'origin'; // Defaulting to origin for now
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to ${
          force ? 'FORCE ' : ''
        }delete remote branch '${remote}/${branchName}'?`,
        'Delete Remote',
        'Cancel'
      );
      if (confirm === 'Delete Remote') {
        await this.gitService.deleteRemoteBranch(remote, branchName, force, repo);
        vscode.window.showInformationMessage(
          `Remote branch '${branchName}' ${force ? 'FORCE ' : ''}deleted from '${remote}'.`
        );
        this.refreshCallback();
      }
      return;
    }

    const name = item.branchName || item.label;
    const branches = await this.gitService.getBranches(repo);

    const confirm = await vscode.window.showWarningMessage(
      `${force ? 'FORCE ' : ''}Delete branch ${name}?`,
      force ? 'Force Delete' : 'Delete',
      'Cancel'
    );
    if (confirm !== (force ? 'Force Delete' : 'Delete')) return;

    if (branches.current === name) {
      const main = await this.gitService.findMainBranch(repo);
      if (main && main !== name) {
        try {
          await this.gitService.checkout(main, repo);
        } catch (e: any) {
          vscode.window.showErrorMessage(
            `Cannot delete the current branch because switching to '${main}' failed: ${e.message}`
          );
          return;
        }
      } else {
        vscode.window.showErrorMessage(
          'Cannot delete the current branch because no other branch was found to switch to.'
        );
        return;
      }
    }

    await this.gitService.deleteBranch(name, force, repo);
    this.localBranchProvider.hideBranch(name, repo);
    vscode.window.showInformationMessage(`Branch '${name}' deleted successfully.`);
    this.refreshCallback();
  }

  /**
   * Deletes a remote branch.
   * @param item - The tree item representing the remote branch.
   * @param force - Whether to force delete.
   */
  private async deleteRemoteBranch(item: any, force: boolean = false) {
    const fullName = item.branchName || item.label; // e.g. origin/feature/x
    const repo = item.repo;
    const parts = fullName.split('/');
    const remote = parts[0];
    const branchName = parts.slice(1).join('/');

    if (force) {
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to FORCE delete remote branch '${branchName}' from '${remote}'?`,
        { modal: true },
        'Force Delete'
      );
      if (confirm === 'Force Delete') {
        await this.gitService.deleteRemoteBranch(remote, branchName, true, repo);
        this.remoteBranchProvider.hideBranch(`${remote}/${branchName}`, repo);
        vscode.window.showInformationMessage(
          `Remote branch '${branchName}' FORCE deleted from '${remote}'.`
        );
        this.refreshCallback();
      }
      return;
    }

    const selection = await vscode.window.showWarningMessage(
      `Delete remote branch '${branchName}' from '${remote}'?`,
      'Delete',
      'Force Delete',
      'Cancel'
    );

    if (selection === 'Delete') {
      await this.gitService.deleteRemoteBranch(remote, branchName, false, repo);
      this.remoteBranchProvider.hideBranch(`${remote}/${branchName}`, repo);
      vscode.window.showInformationMessage(
        `Remote branch '${branchName}' deleted from '${remote}'.`
      );
      this.refreshCallback();
    } else if (selection === 'Force Delete') {
      await this.gitService.deleteRemoteBranch(remote, branchName, true, repo);
      this.remoteBranchProvider.hideBranch(`${remote}/${branchName}`, repo);
      vscode.window.showInformationMessage(
        `Remote branch '${branchName}' FORCE deleted from '${remote}'.`
      );
      this.refreshCallback();
    }
  }

  /**
   * Shows a menu with delete options for a branch.
   * @param item - The tree item representing the branch.
   */
  private async deleteBranchMenu(item: any) {
    if (!item) {
      vscode.window.showErrorMessage('No branch selected for deletion.');
      return;
    }
    const branchName = item.branchName || item.label;
    const repo = item.repo;

    const items: vscode.QuickPickItem[] = [
      {
        label: 'Delete Local Branch',
        description: `git branch -d ${branchName}`,
        detail: 'Safe delete',
      },
      {
        label: 'Force Delete Local Branch',
        description: `git branch -D ${branchName}`,
        detail: 'Force delete (even if unmerged)',
      },
      {
        label: 'Delete Remote Branch',
        description: `git push origin --delete ${branchName}`,
        detail: 'Delete from remote',
      },
      {
        label: 'Force Delete Remote Branch',
        description: `git push origin --delete ${branchName}`,
        detail: 'Force delete from remote (using reference)',
      },
    ];

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: `Select delete action for '${branchName}'`,
    });

    if (!selection) return;

    if (selection.label === 'Delete Local Branch') {
      await this.handleDeleteBranch(item, false);
    } else if (selection.label === 'Force Delete Local Branch') {
      await this.handleDeleteBranch(item, true);
    } else if (selection.label === 'Delete Remote Branch') {
      // We reuse handleDeleteBranch with isRemote=true
      // But the item in 'Local Branches' view usually has a simple name e.g. "main"
      // handleDeleteBranch for remote handles "origin/main".
      // Let's call GitService directly or adapt.

      // Actually, deleteRemoteBranch expects (remote, branchName).
      // We can just reuse logic.
      const confirm = await vscode.window.showWarningMessage(
        `Delete remote branch 'origin/${branchName}'?`,
        'Delete Remote',
        'Cancel'
      );
      if (confirm === 'Delete Remote') {
        await this.gitService.deleteRemoteBranch('origin', branchName, false, repo);
        this.remoteBranchProvider.hideBranch(`origin/${branchName}`, repo);
        vscode.window.showInformationMessage(
          `Remote branch '${branchName}' deleted from 'origin'.`
        );
        this.refreshCallback();
      }
    } else if (selection.label === 'Force Delete Remote Branch') {
      const confirm = await vscode.window.showWarningMessage(
        `FORCE Delete remote branch 'origin/${branchName}'?`,
        'Force Delete Remote',
        'Cancel'
      );
      if (confirm === 'Force Delete Remote') {
        await this.gitService.deleteRemoteBranch('origin', branchName, true, repo);
        this.remoteBranchProvider.hideBranch(`origin/${branchName}`, repo);
        vscode.window.showInformationMessage(
          `Remote branch '${branchName}' FORCE deleted from 'origin'.`
        );
        this.refreshCallback();
      }
    }
  }
}
