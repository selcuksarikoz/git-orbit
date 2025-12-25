import * as vscode from 'vscode';
import { GitService } from '../services/GitService';
import * as cp from 'child_process';

export class BlameCommands {
  private gitService: GitService;

  constructor(context: vscode.ExtensionContext) {
    this.gitService = GitService.getInstance();

    // Register all blame-related commands
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorbit.copyCommitHash', this.copyCommitHash.bind(this)),
      vscode.commands.registerCommand('gitorbit.openCommitOnWeb', this.openCommitOnWeb.bind(this)),
      vscode.commands.registerCommand('gitorbit.viewCommitDiff', this.viewCommitDiff.bind(this)),
      vscode.commands.registerCommand('gitorbit.showLineHistory', this.showLineHistory.bind(this))
    );
  }

  /**
   * Copy commit hash to clipboard
   */
  private async copyCommitHash(hash: string) {
    try {
      await vscode.env.clipboard.writeText(hash);
      vscode.window.showInformationMessage(
        `Commit hash ${hash.substring(0, 7)} copied to clipboard`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to copy commit hash: ${error}`);
    }
  }

  /**
   * Open commit on web (GitHub, GitLab, Bitbucket)
   */
  private async openCommitOnWeb(hash: string) {
    try {
      const remoteUrl = await this.getRemoteUrl();
      if (!remoteUrl) {
        vscode.window.showWarningMessage('No remote repository found');
        return;
      }

      const webUrl = this.buildCommitWebUrl(remoteUrl, hash);
      if (webUrl) {
        vscode.env.openExternal(vscode.Uri.parse(webUrl));
      } else {
        vscode.window.showWarningMessage('Unable to determine web URL for this repository');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open commit on web: ${error}`);
    }
  }

  /**
   * View commit diff in VS Code
   */
  private async viewCommitDiff(hash: string) {
    try {
      // Use the existing openCommitDiffs command which handles multi-file diffs properly
      await vscode.commands.executeCommand('gitorbit.openCommitDiffs', { hash });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to view commit diff: ${error}`);
    }
  }

  /**
   * Show line history (all commits that modified this line)
   */
  private async showLineHistory(args: { file: string; line: number }) {
    try {
      const { file, line } = args;
      const relativePath = this.gitService.getRelativePath(file);

      // Save the current active editor
      const currentEditor = vscode.window.activeTextEditor;

      // Use git log to get file history
      const historyData = await this.gitService.getFileHistory(relativePath, 50);

      if (!historyData || !historyData.all || historyData.all.length === 0) {
        vscode.window.showInformationMessage('No history found for this file');
        return;
      }

      // Create quick pick items from history
      const items = historyData.all.map((commit: any) => {
        // Parse the date properly - commit.date might be a timestamp or ISO string
        let formattedDate = commit.date;
        try {
          const date = new Date(commit.date);
          if (!isNaN(date.getTime())) {
            formattedDate = date.toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
          }
        } catch (e) {
          // Keep original if parsing fails
        }

        return {
          label: `$(git-commit) ${commit.hash.substring(0, 7)}`,
          description: commit.message,
          detail: `${commit.author_name} • ${formattedDate}`,
          hash: commit.hash,
        };
      });

      if (items.length === 0) {
        vscode.window.showInformationMessage('No history found for this file');
        return;
      }

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Select a commit to view changes for ${relativePath}`,
        matchOnDescription: true,
        matchOnDetail: true,
        title: `Line ${line} History`,
      });

      if (selected && selected.hash) {
        // Restore focus to the original editor before opening diff
        if (currentEditor) {
          await vscode.window.showTextDocument(currentEditor.document, {
            viewColumn: currentEditor.viewColumn,
            preserveFocus: false,
          });
        }

        // Show the diff for the selected commit
        await this.viewCommitDiff(selected.hash);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to show line history: ${error}`);
    }
  }

  /**
   * Get the remote URL for the current repository
   */
  private async getRemoteUrl(): Promise<string | null> {
    try {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        cp.exec(
          'git config --get remote.origin.url',
          { cwd: this.gitService.rootDir },
          (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve({ stdout, stderr });
            }
          }
        );
      });

      return result.stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Build web URL for commit based on remote URL
   */
  private buildCommitWebUrl(remoteUrl: string, hash: string): string | null {
    // Remove .git suffix
    remoteUrl = remoteUrl.replace(/\.git$/, '');

    // Convert SSH to HTTPS
    if (remoteUrl.startsWith('git@')) {
      remoteUrl = remoteUrl.replace(/^git@([^:]+):/, 'https://$1/');
    }

    // GitHub
    if (remoteUrl.includes('github.com')) {
      return `${remoteUrl}/commit/${hash}`;
    }

    // GitLab
    if (remoteUrl.includes('gitlab.com')) {
      return `${remoteUrl}/-/commit/${hash}`;
    }

    // Bitbucket
    if (remoteUrl.includes('bitbucket.org')) {
      return `${remoteUrl}/commits/${hash}`;
    }

    // Azure DevOps
    if (remoteUrl.includes('dev.azure.com') || remoteUrl.includes('visualstudio.com')) {
      return `${remoteUrl}/commit/${hash}`;
    }

    return null;
  }
}
