import * as vscode from "vscode";
import { GitService } from "../services/GitService";

export class CherryPickCommand {
  private gitService: GitService;

  constructor() {
    this.gitService = GitService.getInstance();
  }

  public async execute(commitHash: string) {
    if (!commitHash) {
      vscode.window.showErrorMessage(
        "No commit hash provided for cherry-pick."
      );
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `Are you sure you want to cherry-pick commit ${commitHash.substring(
        0,
        7
      )}?`,
      "Yes",
      "No"
    );

    if (confirm !== "Yes") return;

    try {
      await this.gitService.cherryPick(commitHash);
      vscode.window.showInformationMessage(
        `Successfully cherry-picked ${commitHash.substring(0, 7)}`
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(`Cherry-pick failed: ${error.message}`);
      // In a real extension, we would handle conflicts here (e.g. by opening the source control view)
    }
  }
}
