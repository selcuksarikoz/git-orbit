import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

/**
 * Handles all stash-related Git operations including save, apply, pop, and drop.
 * Implements the Singleton pattern.
 */
export class StashCommands {
  private static instance: StashCommands;
  private gitService: GitService;
  private refreshCallback: () => void;

  private constructor(refreshCallback: () => void) {
    this.gitService = GitService.getInstance();
    this.refreshCallback = refreshCallback;
  }

  /**
   * Returns the singleton instance of StashCommands.
   * @param refreshCallback - Callback function to refresh all views.
   * @returns The singleton instance.
   */
  public static getInstance(refreshCallback?: () => void): StashCommands {
    if (!StashCommands.instance) {
      if (!refreshCallback) {
        throw new Error('StashCommands initialized without refresh callback');
      }
      StashCommands.instance = new StashCommands(refreshCallback);
    }
    return StashCommands.instance;
  }

  /**
   * Registers stash commands to the extension context. oasiduoia udoiasudoisau
   * @param context - The extension context.
   */
  public register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorbit.saveStash', this.saveStash.bind(this)),
      vscode.commands.registerCommand('gitorbit.stashApply', this.stashApply.bind(this)),
      vscode.commands.registerCommand('gitorbit.stashPop', this.stashPop.bind(this)),
      vscode.commands.registerCommand('gitorbit.stashDrop', this.stashDrop.bind(this))
    );
  }

  /**
   * Saves the current changes to a new stash entry.
   * Prompts the user for an optional message.
   */
  private async saveStash() {
    const message = await vscode.window.showInputBox({
      prompt: 'Stash message (optional)',
    });
    if (message !== undefined) {
      await this.gitService.stashSave(message, true);
      this.refreshCallback();
    }
  }

  /**
   * Applies the selected stash to the working directory.
   * @param item - The stash item from the tree view.
   */
  private async stashApply(item: any) {
    if (!item || item.index === undefined) return;
    await this.gitService.stashApply(item.index);
    this.refreshCallback();
  }

  /**
   * Pops the selected stash (applies and drops it).
   * @param item - The stash item from the tree view.
   */
  private async stashPop(item: any) {
    if (!item || item.index === undefined) return;
    await this.gitService.stashPop(item.index);
    this.refreshCallback();
  }

  /**
   * Deletes (drops) the selected stash.
   * Prompts for confirmation before deleting.
   * @param item - The stash item from the tree view.
   */
  private async stashDrop(item: any) {
    if (!item || item.index === undefined) return;
    const confirm = await vscode.window.showWarningMessage(
      `Delete stash ${item.label}?`,
      'Delete',
      'Cancel'
    );
    if (confirm === 'Delete') {
      await this.gitService.stashDrop(item.index);
      this.refreshCallback();
    }
  }
}
