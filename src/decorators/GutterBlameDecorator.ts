import * as vscode from 'vscode';
import { GitService } from '../services/GitService';
import { getAgeBasedColor, formatRelativeTime } from '../utils/BlameUtils';
import { BlamePanel } from '../panels/BlamePanel';

interface LineBlameInfo {
  authorTime: number;
  author: string;
  authorEmail: string;
  hash: string;
  shortHash: string;
  summary: string;
}

export class GutterBlameDecorator {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private gitService: GitService;
  private lineBlameMap: Map<string, Map<number, LineBlameInfo>> = new Map(); // filePath -> line -> blame info
  private extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.gitService = GitService.getInstance();
    this.extensionUri = extensionUri;

    vscode.window.onDidChangeActiveTextEditor((e) => this.update(e));
    if (vscode.window.activeTextEditor) {
      this.update(vscode.window.activeTextEditor);
    }

    // Register command to show blame details
    vscode.commands.registerCommand(
      'gitorbit.showBlameDetails',
      (args: { filePath: string; line: number }) => {
        this.showBlameDetails(args.filePath, args.line);
      }
    );
  }

  public dispose() {
    this.decorationTypes.forEach((type) => type.dispose());
    this.decorationTypes.clear();
    this.lineBlameMap.clear();
  }

  private async update(editor: vscode.TextEditor | undefined) {
    if (!editor) return;

    const filePath = editor.document.uri.fsPath;
    try {
      const blameOutput = await this.gitService.getBlame(filePath);
      const decorations = this.generateHeatmapDecorations(
        blameOutput,
        editor.document.lineCount,
        filePath,
        editor
      );

      // Apply decorations grouped by color
      decorations.forEach((decorationGroup, color) => {
        let decorationType = this.decorationTypes.get(color);
        if (!decorationType) {
          decorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: false,
            gutterIconSize: 'contain',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            overviewRulerColor: color,
            gutterIconPath: this.createGutterIcon(color),
          });
          this.decorationTypes.set(color, decorationType);
        }
        editor.setDecorations(decorationType, decorationGroup);
      });
    } catch {
      // Clear all decorations on error
      this.decorationTypes.forEach((type, color) => {
        editor.setDecorations(type, []);
      });
    }
  }

  private generateHeatmapDecorations(
    blameOutput: string,
    lineCount: number,
    filePath: string,
    editor: vscode.TextEditor
  ): Map<string, vscode.DecorationOptions[]> {
    const lines = blameOutput.split('\n');
    const lineInfos: LineBlameInfo[] = [];
    const blameMap = new Map<number, LineBlameInfo>();

    let currentLine = 0;
    let currentInfo: Partial<LineBlameInfo> = {};

    // Parse blame output
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const hashMatch = text.match(/^([0-9a-f]{40})/);

      if (hashMatch) {
        currentInfo = {
          hash: hashMatch[1],
          shortHash: hashMatch[1].substring(0, 7),
        };
      } else if (text.startsWith('author ')) {
        currentInfo.author = text.substring(7);
      } else if (text.startsWith('author-mail ')) {
        currentInfo.authorEmail = text.substring(12).replace(/[<>]/g, '');
      } else if (text.startsWith('author-time ')) {
        currentInfo.authorTime = parseInt(text.substring(12));
      } else if (text.startsWith('summary ')) {
        currentInfo.summary = text.substring(8);
      } else if (text.startsWith('\t')) {
        if (currentInfo.authorTime && currentInfo.author && currentInfo.hash) {
          const info = currentInfo as LineBlameInfo;
          lineInfos.push(info);
          blameMap.set(currentLine, info);
        }
        currentLine++;
      }
    }

    // Store blame info for this file
    this.lineBlameMap.set(filePath, blameMap);

    // Group decorations by color
    const decorationsByColor = new Map<string, vscode.DecorationOptions[]>();

    lineInfos.forEach((info, index) => {
      const colors = getAgeBasedColor(info.authorTime);

      // Create rich hover message similar to inline blame
      const fullDate = new Date(info.authorTime * 1000).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const hoverMessage = new vscode.MarkdownString();
      hoverMessage.appendMarkdown(`### ${info.summary}\n\n`);
      hoverMessage.appendMarkdown(`**Author:** ${info.author}\n\n`);
      hoverMessage.appendMarkdown(
        `**Date:** ${formatRelativeTime(info.authorTime)} (${fullDate})\n\n`
      );
      hoverMessage.appendMarkdown(`**Commit:** \`${info.shortHash}\`\n\n`);
      hoverMessage.appendMarkdown(`---\n\n`);
      hoverMessage.appendMarkdown(
        `[Show Blame Panel](command:gitorbit.showBlameDetails?${encodeURIComponent(JSON.stringify({ filePath, line: index }))}) | `
      );
      hoverMessage.appendMarkdown(
        `[Open on Web](command:gitorbit.openCommitOnWeb?${encodeURIComponent(JSON.stringify(info.hash))}) | `
      );
      hoverMessage.appendMarkdown(
        `[View Diff](command:gitorbit.viewCommitDiff?${encodeURIComponent(JSON.stringify(info.hash))})`
      );
      hoverMessage.isTrusted = true;

      const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(index, 0, index, 0),
        hoverMessage,
      };

      if (!decorationsByColor.has(colors.hex)) {
        decorationsByColor.set(colors.hex, []);
      }
      decorationsByColor.get(colors.hex)!.push(decoration);
    });

    return decorationsByColor;
  }

  private showBlameDetails(filePath: string, line: number) {
    const blameMap = this.lineBlameMap.get(filePath);
    if (!blameMap) {
      vscode.window.showWarningMessage('No blame information available for this file');
      return;
    }

    const blameInfo = blameMap.get(line);
    if (!blameInfo) {
      vscode.window.showWarningMessage(`No blame information for line ${line + 1}`);
      return;
    }

    // Get the line content
    const editor = vscode.window.activeTextEditor;
    const lineContent = editor?.document.lineAt(line).text.trim() || '';

    BlamePanel.createOrShow(this.extensionUri, {
      ...blameInfo,
      lineNumber: line + 1,
      lineContent,
    });
  }

  private createGutterIcon(color: string): vscode.Uri {
    // Create a simple SVG icon with the specified color
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="20" viewBox="0 0 4 20">
      <rect width="4" height="20" fill="${color}" opacity="0.8"/>
    </svg>`;

    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return vscode.Uri.parse(dataUri);
  }
}
