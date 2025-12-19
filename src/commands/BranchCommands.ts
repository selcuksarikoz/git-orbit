import * as vscode from "vscode";
import { GitService } from "../services/GitService";

export class BranchCommands {
  private static instance: BranchCommands;
  private gitService: GitService;
  private refreshCallback: () => void;

  private constructor(refreshCallback: () => void) {
    this.gitService = GitService.getInstance();
    this.refreshCallback = refreshCallback;
  }

  public static getInstance(refreshCallback?: () => void): BranchCommands {
    if (!BranchCommands.instance) {
      if (!refreshCallback) {
        throw new Error("BranchCommands initialized without refresh callback");
      }
      BranchCommands.instance = new BranchCommands(refreshCallback);
    }
    return BranchCommands.instance;
  }

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

  private async pushBranch(item: any) {
    const branchName = item.branchName || item.label;
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

  private async pullBranch(item: any) {
    const branchName = item.branchName || item.label;
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

  private async checkoutBranch(item: any) {
    const branchName = item.branchName || item.label;
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

  private async deleteBranch(item: any) {
    this.handleDeleteBranch(item, false);
  }

  private async forceDeleteBranch(item: any) {
    this.handleDeleteBranch(item, true);
  }

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
