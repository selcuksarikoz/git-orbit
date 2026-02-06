import * as vscode from 'vscode';
import { GitService } from './GitService';

export enum BisectState {
  Idle,
  Active,
  Finished,
}

export class BisectService {
  private static instance: BisectService;
  private state: BisectState = BisectState.Idle;
  private statusBarItem: vscode.StatusBarItem;
  private gitService: GitService;

  private constructor() {
    this.gitService = GitService.getInstance();
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = 'gitorbit.bisect.showMenu';
  }

  public static getInstance(): BisectService {
    if (!BisectService.instance) {
      BisectService.instance = new BisectService();
    }
    return BisectService.instance;
  }

  public get currentState(): BisectState {
    return this.state;
  }

  public dispose() {
    this.statusBarItem.dispose();
  }

  private async updateStatus() {
    if (this.state === BisectState.Idle) {
      this.statusBarItem.hide();
      return;
    }

    // Show generic status
    this.statusBarItem.text = '$(debug-step-into) Git Bisect Active';
    this.statusBarItem.tooltip = 'Click to manage Bisect session';
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );
    this.statusBarItem.show();
  }

  public async start() {
    if (this.state === BisectState.Active) {
      vscode.window.showInformationMessage('Bisect is already active.');
      return;
    }

    try {
      // Prompt for Bad/Good commits

      const badCommit = await vscode.window.showInputBox({
        title: 'Bisect Start',
        prompt: 'Enter the "Bad" commit hash (containing the bug)',
        placeHolder: 'HEAD',
        ignoreFocusOut: true
      });

      if (badCommit === undefined) return; // Cancelled

      const goodCommit = await vscode.window.showInputBox({
        title: 'Bisect Start',
        prompt: 'Enter a "Good" commit hash (where it worked)',
        ignoreFocusOut: true
      });

      if (!goodCommit) return;

      const git = this.gitService.executor;
      if (!git) return;

      // Start bisect
      await git.exec(['bisect', 'start']);
      await git.exec(['bisect', 'bad', badCommit || 'HEAD']);
      await git.exec(['bisect', 'good', goodCommit]);

      this.state = BisectState.Active;
      this.updateStatus();
      vscode.commands.executeCommand('gitorbit.refreshViews');
      vscode.window.showInformationMessage('Bisect started! Check the current version and mark it as Good or Bad.');

    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to start bisect: ${e.message}`);
      this.reset();
    }
  }

  public async markGood() {
    if (this.state !== BisectState.Active) return;
    try {
        const result = await this.runBisectCommand('good');
        this.handleBisectResult(result);
    } catch(e: any) {
        vscode.window.showErrorMessage(`Error: ${e.message}`);
    }
  }

  public async markBad() {
    if (this.state !== BisectState.Active) return;
    try {
        const result = await this.runBisectCommand('bad');
        this.handleBisectResult(result);
    } catch(e: any) {
        vscode.window.showErrorMessage(`Error: ${e.message}`);
    }
  }

  public async skip() {
    if (this.state !== BisectState.Active) return;
    try {
        await this.runBisectCommand('skip');
        vscode.window.showInformationMessage('Commit skipped.');
    } catch(e: any) {
        vscode.window.showErrorMessage(`Error: ${e.message}`);
    }
  }

  public async reset() {
    try {
      const git = this.gitService.executor;
      if (git) {
        await git.exec(['bisect', 'reset']);
      }
    } catch (e) {
      // Ignore if inactive
    } finally {
      this.state = BisectState.Idle;
      this.updateStatus();
      vscode.commands.executeCommand('gitorbit.refreshViews');
    }
  }

  private async runBisectCommand(cmd: 'good' | 'bad' | 'skip'): Promise<string> {
    const git = this.gitService.executor;
    if (!git) throw new Error('Git not initialized');

    const result = await git.exec(['bisect', cmd]);
    vscode.commands.executeCommand('gitorbit.refreshViews');
    return result.stdout;
  }

  private handleBisectResult(stdout: string) {
    if (stdout.includes('is the first bad commit')) {
        this.state = BisectState.Finished;
        this.updateStatus();

        // Extract commit info
        // Format: hash is the first bad commit...
        const lines = stdout.split('\n');
        const firstLine = lines[0];
        const hash = firstLine.split(' ')[0];

        vscode.window.showInformationMessage(
            `Found the culprit! ${hash} is the first bad commit.`,
            'View Details',
            'Reset Bisect'
        ).then(selection => {
            if (selection === 'View Details') {
                vscode.commands.executeCommand('gitorbit.openCommitDiff', { hash });
            } else if (selection === 'Reset Bisect') {
                this.reset();
            }
        });
    } else {
        // Continue if ongoing
        vscode.window.showInformationMessage('Marked. Moving to next commit...');
    }
  }

  public showMenu() {
    const items = [
        { label: '$(check) Mark Good', description: 'Current version works correctly', action: () => this.markGood() },
        { label: '$(x) Mark Bad', description: 'Current version has the bug', action: () => this.markBad() },
        { label: '$(debug-step-over) Skip', description: 'Cannot test this commit', action: () => this.skip() },
        { label: '$(stop) Stop Bisect', description: 'Reset to original state', action: () => this.reset() },
    ];

    if (this.state === BisectState.Idle) {
         // Start if idle
         this.start();
         return;
    }

    vscode.window.showQuickPick(items, {
        placeHolder: 'Git Bisect Actions'
    }).then(selected => {
        if (selected) selected.action();
    });
  }
}
