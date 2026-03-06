import * as vscode from 'vscode';
import { GitService, GitRepository } from './GitService';
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

  private async selectRepository(providedRepo?: GitRepository): Promise<GitRepository | undefined> {
    if (providedRepo) return providedRepo;

    const selectedRepo = this.gitService.getSelectedRepository();
    if (selectedRepo) return selectedRepo;

    const repos = this.gitService.getRepositories();

    if (repos.length === 0) {
      vscode.window.showErrorMessage('No repositories found.');
      return undefined;
    }

    if (repos.length === 1) {
      return repos[0];
    }

    const repoOptions = repos.map((r) => ({
      label: r.rootDir.split(/[/\\]/).pop() || r.rootDir,
      description: r.rootDir,
      repo: r,
    }));

    const selected = await vscode.window.showQuickPick(repoOptions, {
      placeHolder: 'Select repository',
      title: 'Select Repository',
    });

    return selected?.repo;
  }

  /**
   * Prompts user for a source branch and new branch name, then creates and pushes it.
   * @param defaultSource - Optional default source branch to pre-select.
   * @param repo - Optional repository to use.
   */
  public async startRemoteBranch(defaultSource?: string, repo?: GitRepository) {
    const targetRepo = await this.selectRepository(repo);
    if (!targetRepo) return;

    const branches = await this.gitService.getBranches(targetRepo);

    let source = defaultSource;
    if (!source) {
      source = await vscode.window.showQuickPick(branches.all, {
        placeHolder: 'Select source branch to branch from',
      });
    }

    if (!source) return;

    // Ensure we have a clean branch name (e.g. remove "remotes/origin/" if it was selected)
    const cleanSource = source.startsWith('remotes/')
      ? source.split('/').slice(2).join('/')
      : source;

    const name = await vscode.window.showInputBox({
      prompt: `Enter branch name to create on remote (branching from '${cleanSource}')`,
      placeHolder: 'my-remote-feature',
    });

    if (name) {
      // Use atomic push to create on remote without local checkout
      await this.createRemoteOnly(name, cleanSource, targetRepo);
    }
  }

  /**
   * Atomic remote branch creation. Creates branch on origin from source
   * without creating a local branch or checking it out.
   */
  private async createRemoteOnly(branchName: string, source: string, repo?: GitRepository) {
    if (!repo) return;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Creating remote branch ${branchName}...`,
          cancellable: false,
        },
        async () => {
          // git push origin <source>:refs/heads/<new_branch>
          // Using full refname for destination to prevent ambiguity
          await this.gitService.push('origin', `${source}:refs/heads/${branchName}`, false, repo);
          await this.gitService.fetch('origin', repo);
          vscode.window.showInformationMessage(
            `Remote branch '${branchName}' created successfully.`
          );
          vscode.commands.executeCommand('gitorbit.refreshViews');
        }
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create remote branch: ${error.message}`);
    }
  }

  /**
   * Prompts user for source and name, then creates a local branch.
   * @param defaultSource - Optional default source branch to pre-select.
   * @param repo - Optional repository to use.
   */
  public async startBranch(defaultSource?: string, repo?: GitRepository) {
    const targetRepo = await this.selectRepository(repo);
    if (!targetRepo) return;

    const branches = await this.gitService.getBranches(targetRepo);

    let source = defaultSource;
    if (!source) {
      source = await vscode.window.showQuickPick(branches.all, {
        placeHolder: 'Select source branch to branch from',
      });
    }

    if (!source) return;

    const name = await vscode.window.showInputBox({
      prompt: `Enter branch name (branching from '${source}')`,
      placeHolder: 'my-new-branch',
    });

    if (name) {
      await this.createAndCheckout(name, source, targetRepo);
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
   * @param node - Optional tree node that triggered the command.
   */
  public async showMenu(node?: any) {
    const repo = node?.repo;
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
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select Git Action',
    });

    if (selected) {
      const source = node?.branchName || node?.label;
      if (selected.label.includes('Feature')) {
        await this.startGitflowBranch('feature', source, false, repo);
      } else if (selected.label.includes('Hotfix')) {
        await this.startGitflowBranch('hotfix', source, false, repo);
      } else if (selected.label.includes('Bugfix')) {
        await this.startGitflowBranch('bugfix', source, false, repo);
      } else if (selected.label.includes('Release')) {
        await this.startGitflowBranch('release', source, false, repo);
      } else if (selected.label.includes('Create Branch')) {
        await this.startBranch(source, repo);
      }
    }
  }

  /**
   * Shows a QuickPick menu for remote branch creation options.
   * @param defaultSource - Optional default source branch.
   * @param repo - Optional repository.
   */
  public async showRemoteMenu(defaultSource?: string, repo?: GitRepository) {
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(cloud-upload) Create Remote Branch',
        description: 'Simple branch without prefix',
      },
      {
        label: '$(cloud-upload) Start Remote Feature',
        description: `Remote branch with prefix '${this.configService.featurePrefix}'`,
      },
      {
        label: '$(cloud-upload) Start Remote Hotfix',
        description: `Remote branch with prefix '${this.configService.hotfixPrefix}'`,
      },
      {
        label: '$(cloud-upload) Start Remote Bugfix',
        description: `Remote branch with prefix '${this.configService.bugfixPrefix}'`,
      },
      {
        label: '$(cloud-upload) Start Remote Release',
        description: `Remote branch with prefix '${this.configService.releasePrefix}'`,
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select Remote Git Action',
    });

    if (selected) {
      if (selected.label.includes('Feature')) {
        await this.startGitflowBranch('feature', defaultSource, true, repo);
      } else if (selected.label.includes('Hotfix')) {
        await this.startGitflowBranch('hotfix', defaultSource, true, repo);
      } else if (selected.label.includes('Bugfix')) {
        await this.startGitflowBranch('bugfix', defaultSource, true, repo);
      } else if (selected.label.includes('Release')) {
        await this.startGitflowBranch('release', defaultSource, true, repo);
      } else if (selected.label.includes('Create Remote Branch')) {
        await this.startRemoteBranch(defaultSource, repo);
      }
    }
  }

  /**
   * Starts a new Gitflow branch (feature, hotfix, bugfix, or release).
   * Automatically uses the base branch from settings if configured.
   * @param type - Gitflow branch type.
   * @param defaultSource - Optional default source branch.
   * @param remoteOnly - Whether to only create on remote.
   * @param repo - Optional repository to use.
   */
  public async startGitflowBranch(
    type: 'feature' | 'hotfix' | 'bugfix' | 'release',
    defaultSource?: string,
    remoteOnly: boolean = false,
    repo?: GitRepository
  ) {
    const targetRepo = await this.selectRepository(repo);
    if (!targetRepo) return;

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

    let source = defaultSource || baseBranch;

    // If base branch isn't set or doesn't exist, ask the user
    const branches = await this.gitService.getBranches(targetRepo);
    if (!source || !branches.all.includes(source)) {
      source =
        (await vscode.window.showQuickPick(branches.all, {
          placeHolder: `Select source branch for ${
            remoteOnly ? 'remote ' : ''
          }${type} (Source: '${source}' not found)`,
        })) || '';
    }

    if (!source) return;

    // Clean source for remote creation
    const cleanSource = source.startsWith('remotes/')
      ? source.split('/').slice(2).join('/')
      : source;

    const name = await vscode.window.showInputBox({
      prompt: `Enter ${type} name (${
        remoteOnly ? 'Remote creation' : 'Branching'
      } from '${cleanSource}', prefix '${prefix}' will be added)`,
      placeHolder: placeholder,
    });

    if (name) {
      const branchName = `${prefix}${name}`;
      if (remoteOnly) {
        await this.createRemoteOnly(branchName, cleanSource, targetRepo);
      } else {
        await this.createAndCheckout(branchName, source, targetRepo);
      }
    }
  }

  /**
   * Starts a new feature branch using the configured feature prefix.
   * @deprecated Use startGitflowBranch('feature')
   */
  public async startFeature(repo?: GitRepository) {
    await this.startGitflowBranch('feature', undefined, false, repo);
  }

  /**
   * Starts a new hotfix branch using the configured hotfix prefix.
   * @deprecated Use startGitflowBranch('hotfix')
   */
  public async startHotfix(repo?: GitRepository) {
    await this.startGitflowBranch('hotfix', undefined, false, repo);
  }

  /**
   * Internal helper to create and checkout a branch.
   * @param branchName - Name of branch to create.
   * @param source - Source branch.
   * @param repo - Repository to use.
   */
  private async createAndCheckout(branchName: string, source?: string, repo?: GitRepository) {
    try {
      await this.gitService.createBranch(branchName, source, repo);
      vscode.window.showInformationMessage(`Started branch: ${branchName}`);
      vscode.commands.executeCommand('gitorbit.refreshViews');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create branch: ${error.message}`);
    }
  }
}
