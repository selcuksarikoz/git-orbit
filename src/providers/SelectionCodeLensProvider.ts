import * as vscode from 'vscode';

export class SelectionCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    vscode.window.onDidChangeTextEditorSelection(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return [];
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      return [];
    }

    // Place the CodeLens at the start of the selection
    const range = new vscode.Range(selection.start.line, 0, selection.start.line, 0);
    const command: vscode.Command = {
      title: '$(sparkle) Improve this with Kuulto AI',
      command: 'gitorbit.chatWithSelection',
      tooltip: 'Send this selection to AI for improvement suggestions',
    };

    return [new vscode.CodeLens(range, command)];
  }
}
