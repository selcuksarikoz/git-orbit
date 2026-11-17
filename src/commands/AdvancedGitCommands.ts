import * as vscode from 'vscode';
import { GitRepository, GitService } from '../services/GitService';

/**
 * Handles advanced Git operations (merge, rebase/cherry-pick continuation,
 * tags and fetch) in a repository-aware way. Implements the Singleton pattern.
 */
export class AdvancedGitCommands {
  private static instance: AdvancedGitCommands;
  private gitService: GitService;
  private refreshCallback: () => void;

  private constructor(refreshCallback: () => void) {
    this.gitService = GitService.getInstance();
    this.refreshCallback = refreshCallback;
  }

  public static getInstance(refreshCallback?: () => void): AdvancedGitCommands {
    if (!AdvancedGitCommands.instance) {
      AdvancedGitCommands.instance = new AdvancedGitCommands(refreshCallback ?? (() => {}));
    }
    return AdvancedGitCommands.instance;
  }

  public register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorbit.git.merge', this.merge.bind(this)),
      vscode.commands.registerCommand(
        'gitorbit.git.rebaseContinue',
        this.rebaseContinue.bind(this)
      ),
      vscode.commands.registerCommand('gitorbit.git.rebaseSkip', this.rebaseSkip.bind(this)),
      vscode.commands.registerCommand(
        'gitorbit.git.cherryPickContinue',
        this.cherryPickContinue.bind(this)
      ),
      vscode.commands.registerCommand(
        'gitorbit.git.cherryPickAbort',
        this.cherryPickAbort.bind(this)
      ),
      vscode.commands.registerCommand('gitorbit.git.tagCreate', this.tagCreate.bind(this)),
      vscode.commands.registerCommand('gitorbit.git.tagDelete', this.tagDelete.bind(this)),
      vscode.commands.registerCommand('gitorbit.git.tagPush', this.tagPush.bind(this)),
      vscode.commands.registerCommand('gitorbit.git.fetch', this.fetch.bind(this))
    );
  }

  /** Resolve the repository from a tree item argument, when available. */
  private resolveRepo(item?: any): GitRepository | undefined {
    if (!item || typeof item === 'string') return undefined;
    if (item.repo) return item.repo;
    if (item.repoRoot) {
      return this.gitService.getRepositoryByRoot?.(item.repoRoot);
    }
    return undefined;
  }

  /** Run a mutation, surface failures to the user and refresh on success. */
  private async run(action: () => Promise<unknown>, errorMessage: string): Promise<void> {
    try {
      await action();
      this.refreshCallback();
    } catch (e: any) {
      vscode.window.showErrorMessage(`${errorMessage}: ${e.message}`);
    }
  }

  private async merge(arg?: string | any) {
    const branchName = typeof arg === 'string' ? arg : arg?.branchName || arg?.name || arg?.label;
    if (!branchName) {
      vscode.window.showErrorMessage('No branch selected to merge.');
      return;
    }
    await this.run(
      () => this.gitService.mergeBranch(branchName, this.resolveRepo(arg)),
      `Merge of '${branchName}' failed`
    );
  }

  private async rebaseContinue(item?: any) {
    await this.run(
      () => this.gitService.rebaseContinue(this.resolveRepo(item)),
      'Rebase continue failed'
    );
  }

  private async rebaseSkip(item?: any) {
    await this.run(() => this.gitService.rebaseSkip(this.resolveRepo(item)), 'Rebase skip failed');
  }

  private async cherryPickContinue(item?: any) {
    await this.run(
      () => this.gitService.cherryPickContinue(this.resolveRepo(item)),
      'Cherry-pick continue failed'
    );
  }

  private async cherryPickAbort(item?: any) {
    await this.run(
      () => this.gitService.cherryPickAbort(this.resolveRepo(item)),
      'Cherry-pick abort failed'
    );
  }

  private async tagCreate(item?: any) {
    const tagName = await vscode.window.showInputBox({
      prompt: 'Tag name',
      placeHolder: 'v1.0.0',
    });
    if (!tagName) return;

    const hash = typeof item === 'string' ? undefined : item?.hash;
    await this.run(
      () => this.gitService.createTag(tagName, hash, this.resolveRepo(item)),
      `Failed to create tag '${tagName}'`
    );
  }

  private async tagDelete(item?: any) {
    const tagName = typeof item === 'string' ? item : item?.name || item?.label;
    if (!tagName) return;

    const confirm = await vscode.window.showWarningMessage(
      `Delete tag '${tagName}'?`,
      'Delete',
      'Cancel'
    );
    if (confirm !== 'Delete') return;

    await this.run(
      () => this.gitService.deleteTag(tagName, this.resolveRepo(item)),
      `Failed to delete tag '${tagName}'`
    );
  }

  private async tagPush(item?: any) {
    const tagName = typeof item === 'string' ? item : item?.name || item?.label;
    if (!tagName) return;

    const remote = typeof item === 'string' ? undefined : item?.remote;
    await this.run(
      () => this.gitService.pushTag(tagName, remote, this.resolveRepo(item)),
      `Failed to push tag '${tagName}'`
    );
  }

  private async fetch(item?: any) {
    const remote = typeof item === 'string' ? item : item?.remote;
    await this.run(
      () => this.gitService.fetchRemote(remote, this.resolveRepo(item)),
      'Fetch failed'
    );
  }
}
