import * as vscode from 'vscode';
import { GitService } from '../services/GitService';
import { ConfigService } from '../services/ConfigService';
import { getAgeBasedColor, formatRelativeTime } from '../utils/BlameUtils';
import * as crypto from 'crypto';

interface BlameInfo {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  authorTime: number;
  committer: string;
  committerEmail: string;
  committerTime: number;
  summary: string;
  body?: string;
  filename?: string;
}

export class InlineBlameDecorator {
  private decorationType: vscode.TextEditorDecorationType;
  private gitService: GitService;
  private configService: ConfigService;
  private hoverProvider: vscode.Disposable;
  private currentBlameInfo: Map<number, BlameInfo> = new Map();

  constructor() {
    this.gitService = GitService.getInstance();
    this.configService = ConfigService.getInstance();
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 3em',
        fontStyle: 'italic',
      },
    });

    // Register hover provider for enhanced blame details
    this.hoverProvider = vscode.languages.registerHoverProvider('*', {
      provideHover: (document, position) => this.provideHover(document, position),
    });

    vscode.window.onDidChangeTextEditorSelection((e) => this.update(e.textEditor));

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitorbit.blame.inline.enabled')) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          this.update(editor);
        }
      }
    });
  }

  public dispose() {
    this.decorationType.dispose();
    this.hoverProvider.dispose();
  }

  private async update(editor: vscode.TextEditor) {
    if (!this.configService.isInlineBlameEnabled) {
      editor.setDecorations(this.decorationType, []);
      this.currentBlameInfo.clear();
      return;
    }

    const line = editor.selection.active.line;
    const filePath = editor.document.uri.fsPath;

    // Don't show blame on empty lines
    if (editor.document.lineAt(line).isEmptyOrWhitespace) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    try {
      const blameOutput = await this.gitService.getBlame(filePath);

      // If the user has moved to a different line, discard this update
      if (editor.selection.active.line !== line) {
        return;
      }

      const lineBlame = this.parseBlameForLine(blameOutput, line + 1);
      const isUncommitted =
        !lineBlame ||
        lineBlame.hash === '0000000000000000000000000000000000000000' ||
        lineBlame.author === 'Not Committed Yet';

      if (!isUncommitted) {
        // Store blame info for hover provider
        this.currentBlameInfo.set(line, lineBlame);

        // Calculate age-based color
        const color = getAgeBasedColor(lineBlame.authorTime).rgba;

        // Truncate summary if too long
        const maxSummaryLength = 50;
        const summary =
          lineBlame.summary.length > maxSummaryLength
            ? lineBlame.summary.substring(0, maxSummaryLength) + '...'
            : lineBlame.summary;

        const decoration: vscode.DecorationOptions = {
          range: new vscode.Range(line, 1024, line, 1024),
          renderOptions: {
            after: {
              contentText: `${lineBlame.author} • ${formatRelativeTime(lineBlame.authorTime)} • ${summary}`,
              color: color,
            },
          },
        };
        editor.setDecorations(this.decorationType, [decoration]);
      } else {
        editor.setDecorations(this.decorationType, []);
        this.currentBlameInfo.delete(line);
      }
    } catch {
      editor.setDecorations(this.decorationType, []);
      this.currentBlameInfo.clear();
    }
  }

  private async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    if (!this.configService.isInlineBlameEnabled) {
      return undefined;
    }

    const blameInfo = this.currentBlameInfo.get(position.line);
    if (!blameInfo) {
      return undefined;
    }

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    // Header with avatar
    const gravatarUrl = this.getGravatarUrl(blameInfo.authorEmail);
    markdown.appendMarkdown(
      `<img src="${gravatarUrl}" width="50" height="50" style="border-radius: 50%; vertical-align: middle;"/> `
    );
    markdown.appendMarkdown(`**${blameInfo.author}**\n\n`);

    // Commit info
    markdown.appendMarkdown(`---\n\n`);
    markdown.appendMarkdown(
      `**Commit:** \`${blameInfo.shortHash}\` ([copy](command:gitorbit.copyCommitHash?${encodeURIComponent(JSON.stringify(blameInfo.hash))}))\n\n`
    );
    markdown.appendMarkdown(
      `**Date:** ${this.formatFullDate(blameInfo.authorTime)} (${formatRelativeTime(blameInfo.authorTime)})\n\n`
    );
    markdown.appendMarkdown(`**Message:** ${blameInfo.summary}\n\n`);

    if (blameInfo.body) {
      markdown.appendMarkdown(`\n${blameInfo.body}\n\n`);
    }

    // Action buttons
    markdown.appendMarkdown(`---\n\n`);
    markdown.appendMarkdown(
      `[Show Blame Panel](command:gitorbit.showBlameDetails?${encodeURIComponent(JSON.stringify({ filePath: document.uri.fsPath, line: position.line }))}) | `
    );
    markdown.appendMarkdown(
      `[Open on Web](command:gitorbit.openCommitOnWeb?${encodeURIComponent(JSON.stringify(blameInfo.hash))}) | `
    );
    markdown.appendMarkdown(
      `[View Diff](command:gitorbit.viewCommitDiff?${encodeURIComponent(JSON.stringify(blameInfo.hash))}) | `
    );
    markdown.appendMarkdown(
      `[Line History](command:gitorbit.showLineHistory?${encodeURIComponent(JSON.stringify({ file: document.uri.fsPath, line: position.line + 1 }))})`
    );

    return new vscode.Hover(markdown);
  }

  private parseBlameForLine(blameOutput: string, lineNumber: number): BlameInfo | null {
    const lines = blameOutput.split('\n');
    let currentLine = 0;
    let info: Partial<BlameInfo> = {};

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const hashMatch = text.match(/^([0-9a-f]{40})/);

      if (hashMatch) {
        // New commit block
        info = {
          hash: hashMatch[1],
          shortHash: hashMatch[1].substring(0, 7),
        };
      } else if (text.startsWith('author ')) {
        info.author = text.substring(7);
      } else if (text.startsWith('author-mail ')) {
        info.authorEmail = text.substring(12).replace(/[<>]/g, '');
      } else if (text.startsWith('author-time ')) {
        info.authorTime = parseInt(text.substring(12));
      } else if (text.startsWith('committer ')) {
        info.committer = text.substring(10);
      } else if (text.startsWith('committer-mail ')) {
        info.committerEmail = text.substring(15).replace(/[<>]/g, '');
      } else if (text.startsWith('committer-time ')) {
        info.committerTime = parseInt(text.substring(15));
      } else if (text.startsWith('summary ')) {
        info.summary = text.substring(8);
      } else if (text.startsWith('filename ')) {
        info.filename = text.substring(9);
      } else if (text.startsWith('\t')) {
        currentLine++;
        if (currentLine === lineNumber) {
          return info as BlameInfo;
        }
      }
    }
    return null;
  }

  private formatFullDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private getGravatarUrl(email: string): string {
    const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
    return `https://www.gravatar.com/avatar/${hash}?s=50&d=identicon`;
  }
}
