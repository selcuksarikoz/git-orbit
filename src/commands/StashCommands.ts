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
   * Registers stash commands to the extension context.
   * @param context - The extension context.
   */
  public register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorbit.saveStash', this.saveStash.bind(this)),
      vscode.commands.registerCommand('gitorbit.stashApply', this.stashApply.bind(this)),
      vscode.commands.registerCommand('gitorbit.stashPop', this.stashPop.bind(this)),
      vscode.commands.registerCommand('gitorbit.stashDrop', this.stashDrop.bind(this)),
      vscode.commands.registerCommand('gitorbit.changes.stashFile', this.stashFile.bind(this))
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
    if (message === undefined) return;
    try {
      await this.gitService.stashSave(message, true);
      this.refreshCallback();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to save stash: ${e.message}`);
    }
  }

  /**
   * Applies the selected stash to the working directory.
   * @param item - The stash item from the tree view.
   */
  private async stashApply(item: any) {
    if (!item || item.index === undefined) return;
    try {
      await this.gitService.stashApply(item.index);
      this.refreshCallback();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to apply stash: ${e.message}`);
    }
  }

  /**
   * Pops the selected stash (applies and drops it).
   * @param item - The stash item from the tree view.
   */
  private async stashPop(item: any) {
    if (!item || item.index === undefined) return;
    try {
      await this.gitService.stashPop(item.index);
      this.refreshCallback();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to pop stash: ${e.message}`);
    }
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
    if (confirm !== 'Delete') return;
    try {
      await this.gitService.stashDrop(item.index);
      this.refreshCallback();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to delete stash: ${e.message}`);
    }
  }

  /**
   * Stash a single changed file from the Changes view.
   * @param item - The ChangeItem whose resourceUri points at the file.
   */
  private async stashFile(item: any) {
    const filePath: string | undefined =
      item?.resourceUri?.fsPath ??
      (item?.rootPath && item?.path
        ? vscode.Uri.joinPath(vscode.Uri.file(item.rootPath), item.path).fsPath
        : undefined);
    if (!filePath) return;

    try {
      await this.gitService.stashFile(filePath, item?.repo);
      vscode.window.showInformationMessage(`Stashed ${item.path || filePath}`);
      this.refreshCallback();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to stash file: ${e.message}`);
    }
  }
}
