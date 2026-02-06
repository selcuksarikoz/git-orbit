import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

export class CopyCommands {
  private static instance: CopyCommands;
  private gitService: GitService;

  private constructor() {
    this.gitService = GitService.getInstance();
  }

  public static getInstance(): CopyCommands {
    if (!CopyCommands.instance) {
      CopyCommands.instance = new CopyCommands();
    }
    return CopyCommands.instance;
  }

  public register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand('gitorbit.copy.hash', this.copyHash.bind(this)),
      vscode.commands.registerCommand('gitorbit.copy.message', this.copyMessage.bind(this)),
      vscode.commands.registerCommand('gitorbit.copy.author', this.copyAuthor.bind(this)),
      vscode.commands.registerCommand('gitorbit.copy.email', this.copyEmail.bind(this)),
      vscode.commands.registerCommand('gitorbit.copy.date', this.copyDate.bind(this)),
      vscode.commands.registerCommand('gitorbit.copy.url', this.copyUrl.bind(this))
    );
  }

  private async copyToClipboard(text: string, label: string) {
    if (!text) {
        vscode.window.showWarningMessage(`No ${label} to copy.`);
        return;
    }
    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage(`${label} copied to clipboard.`);
  }

  private getItemDetails(item: any): { hash?: string; message?: string; author?: string; email?: string; date?: string } {


    const hash = item.hash;

    let message = item.label || item.message; // properties vary by item type
    let author = item.authorName; // GraphItem
    let email = item.authorEmail;
    let date = item.dateString; // GraphItem

    // Extract Author/Date from description if fields missing
    if (!author && typeof item.description === 'string') {
        const parts = item.description.split(' • ');
        if (parts.length >= 2) {
            author = parts[0];
            date = parts[1];
        } else {
            author = item.description;
        }
    }

    // If msg is TreeItemLabel, extract label
    if (typeof message !== 'string' && message?.label) {
        message = message.label;
    }

    return { hash, message, author, email, date };
  }

  private async copyHash(item: any) {
    if (!item?.hash) return;
    await this.copyToClipboard(item.hash, 'Commit Hash');
  }

  private async copyMessage(item: any) {
    const { message } = this.getItemDetails(item);
    await this.copyToClipboard(message || '', 'Commit Message');
  }

  private async copyAuthor(item: any) {
    const { author } = this.getItemDetails(item);
    await this.copyToClipboard(author || '', 'Author Name');
  }

  private async copyEmail(item: any) {
     const { email } = this.getItemDetails(item);
    await this.copyToClipboard(email || '', 'Author Email');
  }

  private async copyDate(item: any) {
     const { date } = this.getItemDetails(item);
    await this.copyToClipboard(date || '', 'Commit Date');
  }

  private async copyUrl(item: any) {
    const hash = item?.hash;
    if (!hash) return;

    try {
        const remoteUrl = await this.gitService.getRemoteUrl();
        if (!remoteUrl) {
            vscode.window.showWarningMessage('No remote URL found.');
            return;
        }

        // Convert git@github.com:user/repo.git -> https://github.com/user/repo
        // or https://github.com/user/repo.git -> https://github.com/user/repo
        let httpUrl = remoteUrl
            .trim()
            .replace(/^git@([^:]+):/, 'https://$1/')
            .replace(/\.git$/, '');

        // Transform remote URL to web URL (heuristic for standard interfaces)

        const commitUrl = `${httpUrl}/commit/${hash}`;
        await this.copyToClipboard(commitUrl, 'Commit URL');
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to generate URL: ${e.message}`);
    }
  }
}
