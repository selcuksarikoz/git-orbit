import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

export class CherryPickCommand {
  private gitService: GitService;

  constructor() {
    this.gitService = GitService.getInstance();
  }

  public async execute(commitHash: string) {
    if (!commitHash) {
      vscode.window.showErrorMessage('No commit hash provided for cherry-pick.');
      return;
    }

    const options = await vscode.window.showQuickPick(
      [
        {
          label: '$(git-commit) Standard',
          description: 'Apply changes and create a new commit',
          value: [],
        },
        {
          label: '$(edit) No Commit (-n)',
          description: "Apply changes to workspace but don't commit",
          value: ['-n'],
        },
        {
          label: '$(check) Allow Empty',
          description: 'Allow the cherry-pick if the result is an empty commit',
          value: ['--allow-empty'],
        },
        {
          label: '$(edit) Edit (-e)',
          description: 'Edit the commit message before committing',
          value: ['-e'],
        },
      ],
      { placeHolder: `Cherry-pick ${commitHash.substring(0, 7)}...` }
    );

    if (!options) return;

    try {
      await this.gitService.cherryPick(commitHash, options.value);
      vscode.window.showInformationMessage(
        `Successfully cherry-picked ${commitHash.substring(0, 7)}`
      );
    } catch (error: any) {
      const msg = error.message;
      if (msg.includes('cherry-pick is now empty')) {
        const action = await vscode.window.showErrorMessage(
          'Cherry-pick resulted in an empty commit. Do you want to commit it anyway?',
          'Commit --allow-empty',
          'Skip commit',
          'Cancel'
        );
        if (action === 'Commit --allow-empty') {
          try {
            await this.gitService.commit(['--allow-empty', '--no-edit']);
            vscode.window.showInformationMessage(
              `Successfully cherry-picked ${commitHash.substring(0, 7)} (as empty commit)`
            );
          } catch (retryError: any) {
            vscode.window.showErrorMessage(
              `Failed to commit empty cherry-pick: ${retryError.message}`
            );
          }
        } else if (action === 'Skip commit') {
          try {
            await this.gitService.skipCherryPick();
            vscode.window.showInformationMessage('Skipped empty cherry-pick.');
          } catch (skipError: any) {
            vscode.window.showErrorMessage(`Failed to skip cherry-pick: ${skipError.message}`);
          }
        }
      } else {
        vscode.window.showErrorMessage(`Cherry-pick failed: ${error.message}`);
      }
    }
  }
}
