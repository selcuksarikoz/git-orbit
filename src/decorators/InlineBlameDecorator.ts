import * as vscode from "vscode";
import { GitService } from "../services/GitService";
import { ConfigService } from "../services/ConfigService";

export class InlineBlameDecorator {
  private decorationType: vscode.TextEditorDecorationType;
  private gitService: GitService;
  private configService: ConfigService;

  constructor() {
    this.gitService = GitService.getInstance();
    this.configService = ConfigService.getInstance();
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 3em",
        color: new vscode.ThemeColor("editorGhostText.foreground"),
        fontStyle: "italic",
      },
    });

    vscode.window.onDidChangeTextEditorSelection((e) =>
      this.update(e.textEditor)
    );

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gitorbit.blame.inline.enabled")) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          this.update(editor);
        }
      }
    });
  }

  private async update(editor: vscode.TextEditor) {
    if (!this.configService.isInlineBlameEnabled) {
      editor.setDecorations(this.decorationType, []);
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

      if (
        lineBlame &&
        lineBlame.author !== "Not Committed Yet" &&
        lineBlame.subject !== "Not Committed Yet"
      ) {
        const decoration: vscode.DecorationOptions = {
          range: new vscode.Range(line, 1024, line, 1024),
          renderOptions: {
            after: {
              contentText: `${lineBlame.author}, ${lineBlame.time} • ${lineBlame.subject}`,
            },
          },
        };
        editor.setDecorations(this.decorationType, [decoration]);
      } else {
        editor.setDecorations(this.decorationType, []);
      }
    } catch {
      editor.setDecorations(this.decorationType, []);
    }
  }

  private parseBlameForLine(blameOutput: string, lineNumber: number) {
    // Simple regex-based parsing of git blame --line-porcelain output
    // This is a simplified version for demonstration
    const lines = blameOutput.split("\n");
    let currentLine = 0;
    let info: any = {};

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (/^[0-9a-f]{40}/.test(text)) {
        // New commit block
        info = {};
      } else if (text.startsWith("author ")) {
        info.author = text.substring(7);
      } else if (text.startsWith("author-time ")) {
        const timestamp = parseInt(text.substring(12));
        info.time = this.timeAgo(timestamp);
      } else if (text.startsWith("summary ")) {
        info.subject = text.substring(8);
      } else if (text.startsWith("\t")) {
        currentLine++;
        if (currentLine === lineNumber) {
          return info;
        }
      }
    }
    return null;
  }

  private timeAgo(timestamp: number): string {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    let interval = Math.floor(seconds / 31536000);
    if (interval > 1) return interval + " years ago";
    interval = Math.floor(seconds / 2592000);
    if (interval > 1) return interval + " months ago";
    interval = Math.floor(seconds / 86400);
    if (interval > 1) return interval + " days ago";
    interval = Math.floor(seconds / 3600);
    if (interval > 1) return interval + " hours ago";
    interval = Math.floor(seconds / 60);
    if (interval > 1) return interval + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  }
}
