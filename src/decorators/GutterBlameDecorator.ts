import * as vscode from 'vscode';
import { GitService } from '../services/GitService';

export class GutterBlameDecorator {
  private decorationType: vscode.TextEditorDecorationType;
  private gitService: GitService;

  constructor() {
    this.gitService = GitService.getInstance();
    this.decorationType = vscode.window.createTextEditorDecorationType({
      gutterIconSize: 'contain',
      isWholeLine: true,
    });

    vscode.window.onDidChangeActiveTextEditor((e) => this.update(e));
    if (vscode.window.activeTextEditor) {
      this.update(vscode.window.activeTextEditor);
    }
  }

  private async update(editor: vscode.TextEditor | undefined) {
    if (!editor) return;

    const filePath = editor.document.uri.fsPath;
    try {
      const blameOutput = await this.gitService.getBlame(filePath);
      const decorations = this.generateHeatmapDecorations(blameOutput, editor.document.lineCount);
      editor.setDecorations(this.decorationType, decorations);
    } catch {
      editor.setDecorations(this.decorationType, []);
    }
  }

  private generateHeatmapDecorations(
    blameOutput: string,
    lineCount: number
  ): vscode.DecorationOptions[] {
    // Very simplified heatmap logic: newer commits get brighter colors
    // In a real implementation, we'd calculate age based on 'author-time'
    const decorations: vscode.DecorationOptions[] = [];
    // This is a placeholder for the heatmap logic
    return decorations;
  }
}
