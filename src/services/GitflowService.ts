import * as vscode from "vscode";
import { GitService } from "./GitService";
import { ConfigService } from "./ConfigService";

export class GitflowService {
  private static instance: GitflowService;
  private gitService: GitService;
  private configService: ConfigService;

  private constructor() {
    this.gitService = GitService.getInstance();
    this.configService = ConfigService.getInstance();
  }

  public async startRemoteBranch() {
    const branches = await this.gitService.getBranches();
    const source = await vscode.window.showQuickPick(branches.all, {
      placeHolder: "Select source branch to branch from",
    });

    if (!source) return;

    const name = await vscode.window.showInputBox({
      prompt: "Enter branch name to create and push",
      placeHolder: "my-remote-feature",
    });

    if (name) {
      await this.createAndPush(name, source);
    }
  }

  private async createAndPush(branchName: string, source?: string) {
    try {
      await this.gitService.createBranch(branchName, source);
      await this.gitService.push("origin", branchName);
      vscode.window.showInformationMessage(
        `Started and pushed branch: ${branchName}`
      );
      vscode.commands.executeCommand("gitorbit.refreshViews");
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to create/push branch: ${error.message}`
      );
    }
  }

  public async startBranch() {
    const branches = await this.gitService.getBranches();
    const source = await vscode.window.showQuickPick(branches.all, {
      placeHolder: "Select source branch to branch from",
    });

    if (!source) return;

    const name = await vscode.window.showInputBox({
      prompt: "Enter branch name",
      placeHolder: "my-new-branch",
    });

    if (name) {
      await this.createAndCheckout(name, source);
    }
  }

  public static getInstance(): GitflowService {
    if (!GitflowService.instance) {
      GitflowService.instance = new GitflowService();
    }
    return GitflowService.instance;
  }

  public async showMenu() {
    const items: vscode.QuickPickItem[] = [
      {
        label: "$(plus) Create Branch",
        description: "Create a simple branch without prefix",
      },
      {
        label: "$(plus) Start Feature",
        description: `Create a branch with prefix '${this.configService.featurePrefix}'`,
      },
      {
        label: "$(plus) Start Hotfix",
        description: `Create a branch with prefix '${this.configService.hotfixPrefix}'`,
      },
      {
        label: "$(cloud-upload) Create Remote Branch",
        description: "Create a branch and push it to origin",
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select Git Action",
    });

    if (selected) {
      if (selected.label.includes("Feature")) {
        await this.startFeature();
      } else if (selected.label.includes("Hotfix")) {
        await this.startHotfix();
      } else if (selected.label.includes("Remote")) {
        await this.startRemoteBranch();
      } else if (selected.label.includes("Create Branch")) {
        await this.startBranch();
      }
    }
  }

  public async startFeature() {
    const branches = await this.gitService.getBranches();
    const source = await vscode.window.showQuickPick(branches.all, {
      placeHolder: "Select source branch to branch from",
    });

    if (!source) return;

    const name = await vscode.window.showInputBox({
      prompt: "Enter feature name",
      placeHolder: "cool-new-feature",
    });

    if (name) {
      const prefix = this.configService.featurePrefix;
      const branchName = `${prefix}${name}`;
      await this.createAndCheckout(branchName, source);
    }
  }

  public async startHotfix() {
    const branches = await this.gitService.getBranches();
    const source = await vscode.window.showQuickPick(branches.all, {
      placeHolder: "Select source branch to branch from",
    });

    if (!source) return;

    const name = await vscode.window.showInputBox({
      prompt: "Enter hotfix name",
      placeHolder: "urgent-fix",
    });

    if (name) {
      const prefix = this.configService.hotfixPrefix;
      const branchName = `${prefix}${name}`;
      await this.createAndCheckout(branchName, source);
    }
  }

  private async createAndCheckout(branchName: string, source?: string) {
    try {
      await this.gitService.createBranch(branchName, source);
      vscode.window.showInformationMessage(`Started branch: ${branchName}`);
      vscode.commands.executeCommand("gitorbit.refreshViews");
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to create branch: ${error.message}`
      );
    }
  }
}
