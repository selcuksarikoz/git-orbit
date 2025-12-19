import * as vscode from "vscode";
import * as path from "path";

export class IconService {
  private static instance: IconService;
  private extensionUri: vscode.Uri;

  private constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  public static getInstance(extensionUri?: vscode.Uri): IconService {
    if (!IconService.instance && extensionUri) {
      IconService.instance = new IconService(extensionUri);
    }
    return IconService.instance;
  }

  public getIcon(
    name: string
  ): { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon {
    // Fallback or specialized icons can be handled here
    const iconPath = path.join(
      this.extensionUri.fsPath,
      "assets",
      "icons",
      `${name}.svg`
    );

    // Return a URI-based icon path for both light and dark themes
    return {
      light: vscode.Uri.file(iconPath),
      dark: vscode.Uri.file(iconPath),
    };
  }
}
