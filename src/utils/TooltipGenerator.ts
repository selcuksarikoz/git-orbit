import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * Utility to generate standardized tooltips for commit items.
 */
export class TooltipGenerator {
  private static avatarCache = new Map<string, string>();

  /**
   * Generates a MarkdownString for a commit tooltip.
   * Layout:
   * - Avatar (Left)
   * - Gap
   * - Container (Right):
   *    - Author Name (Bold)
   *    - Commit Message (Wrapped)
   * @param name - Author name
   * @param email - Author email
   * @param message - Commit message
   * @param date - Commit date
   * @param hash - Commit hash
   * @param refs - Optional refs (branches/tags)
   * @returns vscode.MarkdownString
   */
  public static generateCommitTooltip(
    name: string,
    email: string,
    message: string,
    date: string,
    hash: string,
    refs?: string
  ): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.supportHtml = true;

    const avatarUrl = this.getAvatarUrl(email);

    // Note: VS Code Markdown tooltips do NOT support CSS styles (like display: flex).
    // They maintain a strict security policy.
    // To achieve the requested layout (Avatar left, gap, Content right), we MUST use an HTML Table.
    // We simulate 'gap' with an empty table cell.
    tooltip.appendMarkdown(
      `<table width="100%">
        <tr>
          <td valign="top" width="40">
             <img src="${avatarUrl}" width="40" height="40" alt="Avatar" style="border-radius: 50%;"/>
          </td>
          <td width="10">&nbsp;</td>
          <td valign="top">
            <strong>${name}</strong><br/>
            ${message}
          </td>
        </tr>
       </table>\n\n`
    );

    tooltip.appendMarkdown(`---\n`);
    tooltip.appendMarkdown(`📅 ${date}  \n`);
    tooltip.appendMarkdown(`🆔 \`${hash.substring(0, 7)}\`  \n`);
    if (email) {
      tooltip.appendMarkdown(`📧 \`${email}\`  \n`);
    }
    if (refs) {
      tooltip.appendMarkdown(`🌿 \`${refs}\`  \n`);
    }

    return tooltip;
  }

  /**
   * Computes and caches the Gravatar URL for a given email.
   * Uses MD5 hash of the email.
   * @param email - User's email address.
   */
  private static getAvatarUrl(email: string): string {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (this.avatarCache.has(cleanEmail)) {
      return this.avatarCache.get(cleanEmail)!;
    }

    const emailHash = crypto.createHash('md5').update(cleanEmail).digest('hex');
    const url = `https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=64`;

    this.avatarCache.set(cleanEmail, url);
    return url;
  }
}
