import * as vscode from "vscode";

export class StatusDecorationProvider implements vscode.FileDecorationProvider {
  static scheme = "gitorbit-status";

  private _onDidChangeFileDecorations: vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  > = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations: vscode.Event<
    vscode.Uri | vscode.Uri[] | undefined
  > = this._onDidChangeFileDecorations.event;

  provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FileDecoration> {
    if (uri.scheme !== StatusDecorationProvider.scheme) {
      return undefined;
    }

    const status = uri.query; // We'll pass the status in the query string

    let color: vscode.ThemeColor | undefined;
    let badge: string | undefined;
    let tooltip: string | undefined;

    switch (status) {
      case "A":
        color = new vscode.ThemeColor("gitDecoration.addedResourceForeground");
        badge = "A";
        tooltip = "Added";
        break;
      case "M":
        color = new vscode.ThemeColor(
          "gitDecoration.modifiedResourceForeground"
        );
        badge = "M";
        tooltip = "Modified";
        break;
      case "D":
        color = new vscode.ThemeColor(
          "gitDecoration.deletedResourceForeground"
        );
        badge = "D";
        tooltip = "Deleted";
        break;
      case "?":
      case "U":
        color = new vscode.ThemeColor(
          "gitDecoration.untrackedResourceForeground"
        );
        badge = "U";
        tooltip = "Untracked";
        break;
    }

    return {
      badge,
      color,
      tooltip,
      propagate: false,
    };
  }

  static getUri(filePath: string, status: string): vscode.Uri {
    return vscode.Uri.parse(
      `${StatusDecorationProvider.scheme}:/${filePath.replace(
        /\\/g,
        "/"
      )}?${status}`
    );
  }
}
