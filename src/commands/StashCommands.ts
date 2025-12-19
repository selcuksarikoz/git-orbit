import * as vscode from "vscode";
import { GitService } from "../services/GitService";

export class StashCommands {
  private static instance: StashCommands;
  private gitService: GitService;
  private refreshCallback: () => void;

  private constructor(refreshCallback: () => void) {
    this.gitService = GitService.getInstance();
    this.refreshCallback = refreshCallback;
  }

  public static getInstance(refreshCallback?: () => void): StashCommands {
    if (!StashCommands.instance) {
      if (!refreshCallback) {
        throw new Error("StashCommands initialized without refresh callback");
      }
      StashCommands.instance = new StashCommands(refreshCallback);
    }
    return StashCommands.instance;
  }

  public register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "gitorbit.saveStash",
        this.saveStash.bind(this)
      ),
      vscode.commands.registerCommand(
        "gitorbit.stashApply",
        this.stashApply.bind(this)
      ),
      vscode.commands.registerCommand(
        "gitorbit.stashPop",
        this.stashPop.bind(this)
      ),
      vscode.commands.registerCommand(
        "gitorbit.stashDrop",
        this.stashDrop.bind(this)
      )
    );
  }

  private async saveStash() {
    const message = await vscode.window.showInputBox({
      prompt: "Stash message (optional)",
    });
    if (message !== undefined) {
      await this.gitService.stashSave(message, true);
      this.refreshCallback();
    }
  }

  private async stashApply(item: any) {
    if (!item || item.index === undefined) return;
    await this.gitService.stashApply(item.index);
    this.refreshCallback();
  }

  private async stashPop(item: any) {
    if (!item || item.index === undefined) return;
    await this.gitService.stashPop(item.index);
    this.refreshCallback();
  }

  private async stashDrop(item: any) {
    if (!item || item.index === undefined) return;
    const confirm = await vscode.window.showWarningMessage(
      `Delete stash ${item.label}?`,
      "Delete",
      "Cancel"
    );
    if (confirm === "Delete") {
      await this.gitService.stashDrop(item.index);
      this.refreshCallback();
    }
  }
}
