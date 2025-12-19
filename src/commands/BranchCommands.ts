import * as vscode from "vscode";
import { GitService } from "../services/GitService";

/**
 * Handles all branch-related Git operations such as push, pull, sync, checkout, and deletion.
 * Implements the Singleton pattern.
 */
export class BranchCommands {
  private static instance: BranchCommands;
  private gitService: GitService;
  private refreshCallback: () => void;

  private constructor(refreshCallback: () => void) {
    this.gitService = GitService.getInstance();
    this.refreshCallback = refreshCallback;
  }

  /**
   * Returns the singleton instance of BranchCommands.
   * @param refreshCallback - Callback function to refresh the UI after operations.
   * @returns The singleton instance.
   */
  public static getInstance(refreshCallback?: () => void): BranchCommands {
    if (!BranchCommands.instance) {
      if (!refreshCallback) {
        throw new Error("BranchCommands initialized without refresh callback");
      }
      BranchCommands.instance = new BranchCommands(refreshCallback);
    }
    return BranchCommands.instance;
  }

  /**
   * Registers branch-related commands to the extension context.
   * @param context - The extension context.
   */
  public register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "gitorbit.pushBranch",
        this.pushBranch.bind(this)
      ),
      vscode.commands.registerCommand(
        "gitorbit.pullBranch",
        this.pullBranch.bind(this)
      ),
      vscode.commands.registerCommand(
        "gitorbit.syncBranch",
        this.syncBranch.bind(this)
      ),
      vscode.commands.registerCommand(
        "gitorbit.checkoutBranch",
        this.checkoutBranch.bind(this)
      ),
      vscode.commands.registerCommand(
        "gitorbit.deleteBranch",
        this.deleteBranch.bind(this)
      ),
      vscode.commands.registerCommand(
        "gitorbit.forceDeleteBranch",
        this.forceDeleteBranch.bind(this)
      ),
      vscode.commands.registerCommand(
        "gitorbit.deleteRemoteBranch",
        this.deleteRemoteBranch.bind(this)
      )
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
        await this.gitService.push("origin", branchName);
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
    const actualBranch = item.isRemote
      ? branchName.split("/").slice(1).join("/")
      : branchName;

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
            await this.gitService.pull("origin", actualBranch);
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
            await this.gitService.pull("origin", branchName);
            await this.gitService.push("origin", branchName);
          } else {
            // For background sync: Update local from remote (FF only), then push local (if ahead)
            await this.gitService.updateLocalBranchFromRemote(branchName);
            await this.gitService.push("origin", branchName);
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
    // Handle remote branch names (e.g., origin/main -> main)
    const actualBranch = item.isRemote
      ? branchName.split("/").slice(1).join("/")
      : branchName;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Checking out to ${actualBranch}...`,
        cancellable: false,
      },
      async () => {
        await this.gitService.checkout(actualBranch);
        this.refreshCallback();
      }
    );
  }

  /**
   * Deletes a local branch with safety checks.
   * @param item - The tree item representing the branch.
   */
  private async deleteBranch(item: any) {
    this.handleDeleteBranch(item, false);
  }

  /**
   * Force deletes a local branch.
   * @param item - The tree item representing the branch.
   */
  private async forceDeleteBranch(item: any) {
    this.handleDeleteBranch(item, true);
  }

  /**
   * Internal helper to handle branch deletion logic.
   * @param item - The tree item.
   * @param force - Whether to force delete.
   */
  private async handleDeleteBranch(item: any, force: boolean) {
    const name = item.branchName || item.label;
    const branches = await this.gitService.getBranches();

    const confirm = await vscode.window.showWarningMessage(
      `${force ? "FORCE " : ""}Delete branch ${name}?`,
      force ? "Force Delete" : "Delete",
      "Cancel"
    );
    if (confirm !== (force ? "Force Delete" : "Delete")) return;

    if (branches.current === name) {
      const main = await this.gitService.findMainBranch();
      if (main && main !== name) {
        await this.gitService.checkout(main);
      } else {
        vscode.window.showErrorMessage(
          "Cannot delete the current branch because no other branch was found to switch to."
        );
        return;
      }
    }

    await this.gitService.deleteBranch(name, force);
    this.refreshCallback();
  }

  /**
   * Deletes a remote branch.
   * @param item - The tree item representing the remote branch.
   */
  private async deleteRemoteBranch(item: any) {
    const fullName = item.branchName || item.label; // e.g. origin/feature/x
    const parts = fullName.split("/");
    const remote = parts[0];
    const branchName = parts.slice(1).join("/");
    const confirm = await vscode.window.showWarningMessage(
      `Delete remote branch ${branchName} from ${remote}?`,
      "Delete Remote",
      "Cancel"
    );
    if (confirm === "Delete Remote") {
      await this.gitService.deleteRemoteBranch(remote, branchName, false);
      this.refreshCallback();
    }
  }
}
