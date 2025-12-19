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

    const options = await vscode.window.showQuickPick(
      [
        {
          label: "$(git-commit) Standard",
          description: "Apply changes and create a new commit",
          value: [],
        },
        {
          label: "$(edit) No Commit (-n)",
          description: "Apply changes to workspace but don't commit",
          value: ["-n"],
        },
        {
          label: "$(check) Allow Empty",
          description: "Allow the cherry-pick if the result is an empty commit",
          value: ["--allow-empty"],
        },
        {
          label: "$(edit) Edit (-e)",
          description: "Edit the commit message before committing",
          value: ["-e"],
        },
      ],
      { placeHolder: `Cherry-pick ${commitHash.substring(0, 7)}...` }
    );

    if (!options) return;

    try {
      await this.gitService.cherryPick(commitHash, options.value);
      vscode.window.showInformationMessage(
        `Successfully cherry-picked ${commitHash.substring(0, 7)}`
      );
    } catch (error: any) {
      const msg = error.message;
      if (msg.includes("cherry-pick is now empty")) {
        const action = await vscode.window.showErrorMessage(
          "Cherry-pick resulted in an empty commit. Do you want to continue by allowing empty commit?",
          "Continue with --allow-empty",
          "Cancel"
        );
        if (action === "Continue with --allow-empty") {
          try {
            await this.gitService.cherryPick(commitHash, [
              ...options.value,
              "--allow-empty",
            ]);
            vscode.window.showInformationMessage(
              `Successfully cherry-picked ${commitHash.substring(0, 7)} (empty)`
            );
            return;
          } catch (retryError: any) {
            vscode.window.showErrorMessage(
              `Follow-up cherry-pick failed: ${retryError.message}`
            );
          }
        }
      } else {
        vscode.window.showErrorMessage(`Cherry-pick failed: ${error.message}`);
      }
    }
  }
}
