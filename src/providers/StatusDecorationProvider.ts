import * as vscode from 'vscode';

export class StatusDecorationProvider implements vscode.FileDecorationProvider {
  private static statusMap: Map<string, string> = new Map();
  private static readonly emitter: vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined> =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[] | undefined> =
    StatusDecorationProvider.emitter.event;

  public static updateStatus(statuses: { path: string; status: string; rootDir: string }[]) {
    this.statusMap.clear();
    for (const s of statuses) {
      // Construct absolute path for the key
      const absPath = vscode.Uri.joinPath(vscode.Uri.file(s.rootDir), s.path).fsPath;
      this.statusMap.set(absPath, s.status);
    }
    // An undefined URI makes VS Code re-query every file, clearing stale decorations.
    StatusDecorationProvider.emitter.fire(undefined);
  }

  provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FileDecoration> {
    // Check if we have a status for this file
    const status = StatusDecorationProvider.statusMap.get(uri.fsPath);
    if (!status) return undefined;

    let color: vscode.ThemeColor | undefined;
    let badge: string | undefined;
    let tooltip: string | undefined;
    let strikethrough: boolean | undefined;

    switch (status) {
      case 'A':
        color = new vscode.ThemeColor('gitDecoration.addedResourceForeground');
        // badge = "A"; // Native Git already handles this
        tooltip = 'Added';
        break;
      case 'M':
        color = new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
        // badge = "M"; // Native Git already handles this
        tooltip = 'Modified';
        break;
      case 'D':
        color = new vscode.ThemeColor('gitDecoration.deletedResourceForeground');
        // badge = "D"; // Native Git already handles this
        tooltip = 'Deleted';
        strikethrough = true;
        break;
      case '?':
      case 'U':
        color = new vscode.ThemeColor('gitDecoration.untrackedResourceForeground');
        // badge = "U"; // Native Git already handles this
        tooltip = 'Untracked';
        break;
    }

    return {
      badge,
      color,
      tooltip,
      propagate: false,
      // @ts-ignore
      strikethrough,
    };
  }
}
