import * as vscode from 'vscode';
import { GitService } from './GitService';
import { ConfigService } from './ConfigService';

/**
 * Service class handling Gitflow operations and branch creation workflows.
 * Implements Singleton pattern.
 */
export class GitflowService {
  private static instance: GitflowService;
  private gitService: GitService;
  private configService: ConfigService;

  private constructor() {
    this.gitService = GitService.getInstance();
    this.configService = ConfigService.getInstance();
  }

  /**
   * Prompts user for a source branch and new branch name, then creates and pushes it.
   */
  public async startRemoteBranch() {
    const branches = await this.gitService.getBranches();
    const source = await vscode.window.showQuickPick(branches.all, {
      placeHolder: 'Select source branch to branch from',
    });

    if (!source) return;

    const name = await vscode.window.showInputBox({
      prompt: 'Enter branch name to create and push',
      placeHolder: 'my-remote-feature',
    });

    if (name) {
      await this.createAndPush(name, source);
    }
  }

  /**
   * Internal helper to create a branch and push it to origin immediately.
   * @param branchName - The new branch name.
   * @param source - The source branch name.
   */
  private async createAndPush(branchName: string, source?: string) {
    try {
      await this.gitService.createBranch(branchName, source);
      await this.gitService.push('origin', branchName);
      vscode.window.showInformationMessage(`Started and pushed branch: ${branchName}`);
      vscode.commands.executeCommand('gitorbit.refreshViews');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create/push branch: ${error.message}`);
    }
  }

  /**
   * Prompts user for source and name, then creates a local branch.
   */
  public async startBranch() {
    const branches = await this.gitService.getBranches();
    const source = await vscode.window.showQuickPick(branches.all, {
      placeHolder: 'Select source branch to branch from',
    });

    if (!source) return;

    const name = await vscode.window.showInputBox({
      prompt: 'Enter branch name',
      placeHolder: 'my-new-branch',
    });

    if (name) {
      await this.createAndCheckout(name, source);
    }
  }

  /**
   * Returns the singleton instance.
   */
  public static getInstance(): GitflowService {
    if (!GitflowService.instance) {
      GitflowService.instance = new GitflowService();
    }
    return GitflowService.instance;
  }

  /**
   * Shows a QuickPick menu with available branch creation options.
   */
  public async showMenu() {
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(plus) Create Branch',
        description: 'Create a simple branch without prefix',
      },
      {
        label: '$(plus) Start Feature',
        description: `Create a branch with prefix '${this.configService.featurePrefix}'`,
      },
      {
        label: '$(plus) Start Hotfix',
        description: `Create a branch with prefix '${this.configService.hotfixPrefix}'`,
      },
      {
        label: '$(plus) Start Bugfix',
        description: `Create a branch with prefix '${this.configService.bugfixPrefix}'`,
      },
      {
        label: '$(plus) Start Release',
        description: `Create a branch with prefix '${this.configService.releasePrefix}'`,
      },
      {
        label: '$(cloud-upload) Create Remote Branch',
        description: 'Create a branch and push it to origin',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select Git Action',
    });

    if (selected) {
      if (selected.label.includes('Feature')) {
        await this.startGitflowBranch('feature');
      } else if (selected.label.includes('Hotfix')) {
        await this.startGitflowBranch('hotfix');
      } else if (selected.label.includes('Bugfix')) {
        await this.startGitflowBranch('bugfix');
      } else if (selected.label.includes('Release')) {
        await this.startGitflowBranch('release');
      } else if (selected.label.includes('Remote')) {
        await this.startRemoteBranch();
      } else if (selected.label.includes('Create Branch')) {
        await this.startBranch();
      }
    }
  }

  /**
   * Starts a new Gitflow branch (feature, hotfix, bugfix, or release).
   * Automatically uses the base branch from settings if configured.
   */
  public async startGitflowBranch(type: 'feature' | 'hotfix' | 'bugfix' | 'release') {
    let prefix = '';
    let baseBranch = '';
    let placeholder = '';

    switch (type) {
      case 'feature':
        prefix = this.configService.featurePrefix;
        baseBranch = this.configService.featureBase;
        placeholder = 'cool-new-feature';
        break;
      case 'hotfix':
        prefix = this.configService.hotfixPrefix;
        baseBranch = this.configService.hotfixBase;
        placeholder = 'urgent-fix';
        break;
      case 'bugfix':
        prefix = this.configService.bugfixPrefix;
        baseBranch = this.configService.bugfixBase;
        placeholder = 'minor-fix';
        break;
      case 'release':
        prefix = this.configService.releasePrefix;
        baseBranch = this.configService.releaseBase;
        placeholder = 'v1.0.0';
        break;
    }

    let source = baseBranch;

    // If base branch isn't set or doesn't exist, ask the user
    const branches = await this.gitService.getBranches();
    if (!source || !branches.all.includes(source)) {
      source =
        (await vscode.window.showQuickPick(branches.all, {
          placeHolder: `Select source branch to branch from for ${type} (Config: '${baseBranch}' not found)`,
        })) || '';
    }

    if (!source) return;

    const name = await vscode.window.showInputBox({
      prompt: `Enter ${type} name (branching from '${source}', prefix '${prefix}' will be added)`,
      placeHolder: placeholder,
    });

    if (name) {
      const branchName = `${prefix}${name}`;
      await this.createAndCheckout(branchName, source);
    }
  }

  /**
   * Starts a new feature branch using the configured feature prefix.
   * @deprecated Use startGitflowBranch('feature')
   */
  public async startFeature() {
    await this.startGitflowBranch('feature');
  }

  /**
   * Starts a new hotfix branch using the configured hotfix prefix.
   * @deprecated Use startGitflowBranch('hotfix')
   */
  public async startHotfix() {
    await this.startGitflowBranch('hotfix');
  }

  /**
   * Internal helper to create and checkout a branch.
   * @param branchName - Name of branch to create.
   * @param source - Source branch.
   */
  private async createAndCheckout(branchName: string, source?: string) {
    try {
      await this.gitService.createBranch(branchName, source);
      vscode.window.showInformationMessage(`Started branch: ${branchName}`);
      vscode.commands.executeCommand('gitorbit.refreshViews');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create branch: ${error.message}`);
    }
  }
}
