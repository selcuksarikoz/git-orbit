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
    // Update context key for menu visibility
    await vscode.commands.executeCommand('setContext', 'gitorbit.ctx.bisectActive', this.state === BisectState.Active);

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

  public async start(item?: any) {
    if (this.state === BisectState.Active) {
      vscode.window.showInformationMessage('Bisect is already active.');
      return;
    }

    try {
      // Pre-fill if item provided (from context menu)
      const initialBad = item?.hash; // undefined if not from context menu

      let badCommit = initialBad;
      if (!badCommit) {
          badCommit = await this.pickCommit('Select "Bad" Commit (Bug Exists)', 'Select the commit/branch where the bug is present');
      }

      if (!badCommit) return; // Cancelled

      const goodCommit = await this.pickCommit('Select "Good" Commit (Bug Absent)', 'Select a commit/branch where it worked correctly');

      if (!goodCommit) return;

      const git = this.gitService.executor;
      if (!git) return;

      // Check for uncommitted changes
      const status = await this.gitService.getStatus();
      const hasChanges = status.length > 0;

      if (hasChanges) {
        const choice = await vscode.window.showWarningMessage(
          'You have uncommitted changes. Bisect requires a clean working tree.',
          'Stash Changes & Continue',
          'Cancel'
        );

        if (choice === 'Stash Changes & Continue') {
          await git.exec(['stash', 'push', '-m', 'GitOrbit: Auto-stash before bisect']);
          vscode.window.showInformationMessage('Changes stashed. Will be restored after bisect reset.');
        } else {
          return;
        }
      }

      // Start bisect

      // Safety: Reset any pending bisect state
      try { await git.exec(['bisect', 'reset']); } catch {}

      try {
        await git.exec(['bisect', 'start']);
      } catch (e: any) {
        throw new Error(`Could not initialize bisect: ${e.message}`);
      }

      try {
        await git.exec(['bisect', 'bad', badCommit]);
      } catch (e: any) {
        throw new Error(`Failed to set bad commit '${badCommit}': ${e.message}`);
      }

      try {
        await git.exec(['bisect', 'good', goodCommit]);
      } catch (e: any) {
        throw new Error(`Failed to set good commit '${goodCommit}': ${e.message}`);
      }

      this.state = BisectState.Active;
      this.updateStatus();
      vscode.commands.executeCommand('gitorbit.refreshViews');
      vscode.window.showInformationMessage('Bisect started! Check the current version and mark it as Good or Bad.');

    } catch (e: any) {
      vscode.window.showErrorMessage(`Bisect Error: ${e.message}`);
      this.reset();
    }
  }

  private async pickCommit(title: string, placeholder: string): Promise<string | undefined> {
      try {
        const branches = await this.gitService.getBranches();

        const items: vscode.QuickPickItem[] = [];

        // Option 1: Manual Input
        items.push({
            label: '$(edit) Enter Custom Hash/Ref...',
            description: 'Type a hash, tag, or reference manually'
        });

        // Option 2: HEAD
        items.push({
            label: 'HEAD',
            description: 'Current Checked Out Commit'
        });

        // Option 3: Branches
        if (branches.all && branches.all.length > 0) {
            items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
            branches.all.forEach(b => {
                const isRemote = b.startsWith('remotes/');
                const icon = isRemote ? '$(cloud)' : '$(git-branch)';
                items.push({
                    label: `${icon} ${b}`,
                    description: isRemote ? 'Remote Branch' : 'Local Branch',
                    detail: b // store raw name if needed, but label has icon
                });
            });
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: placeholder,
            title: title,
            ignoreFocusOut: true
        });

        if (!selected) return undefined;

        if (selected.label.includes('Enter Custom Hash')) {
            return await vscode.window.showInputBox({
                prompt: 'Enter commit hash, tag, or branch name',
                placeHolder: 'e.g. v1.0, main, <hash>',
                ignoreFocusOut: true
            });
        }

        // Clean label from icon
        // "HEAD" -> "HEAD"
        // "$(git-branch) main" -> "main"
        const cleanRef = selected.label.replace(/\$\([a-z-]+\)\s*/, '').trim();
        return cleanRef;

      } catch (e) {
          // Fallback to simpler input if branch fetch fails
          return await vscode.window.showInputBox({
              title: title,
              prompt: placeholder,
              ignoreFocusOut: true
          });
      }
  }

  public async markGood(item?: any) {
    if (this.state !== BisectState.Active) {
        // Optional: Allow implicit start? For now, just warn.
        vscode.window.showWarningMessage('Bisect is not active. Please start a bisect session first.');
        return;
    }
    try {
        const hash = item?.hash; // Get hash from tree item if available
        const result = await this.runBisectCommand('good', hash);
        this.handleBisectResult(result);
    } catch(e: any) {
        vscode.window.showErrorMessage(`Error: ${e.message}`);
    }
  }

  public async markBad(item?: any) {
    if (this.state !== BisectState.Active) {
        vscode.window.showWarningMessage('Bisect is not active. Please start a bisect session first.');
        return;
    }
    try {
        const hash = item?.hash;
        const result = await this.runBisectCommand('bad', hash);
        this.handleBisectResult(result);
    } catch(e: any) {
        vscode.window.showErrorMessage(`Error: ${e.message}`);
    }
  }

  public async skip(item?: any) {
    if (this.state !== BisectState.Active) return;
    try {
        const hash = item?.hash;
        await this.runBisectCommand('skip', hash);
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

        // Check for auto-stashed changes
        const stashList = await git.exec(['stash', 'list']);
        if (stashList.stdout.includes('GitOrbit: Auto-stash before bisect')) {
          const restore = await vscode.window.showInformationMessage(
            'Bisect ended. Restore your stashed changes?',
            'Restore',
            'Keep Stashed'
          );
          if (restore === 'Restore') {
            await git.exec(['stash', 'pop']);
            vscode.window.showInformationMessage('Changes restored.');
          }
        }
      }
    } catch (e) {
      // Ignore if inactive
    } finally {
      this.state = BisectState.Idle;
      this.updateStatus();
      vscode.commands.executeCommand('gitorbit.refreshViews');
    }
  }

  public async getLog(): Promise<{ status: 'bad' | 'good' | 'skip'; hash: string; subject?: string }[]> {
      const git = this.gitService.executor;
      if (!git || (this.state === BisectState.Idle)) return [];

      try {
          const result = await git.exec(['bisect', 'log']);
          const lines = result.stdout.split('\n');
          const entries: { status: 'bad' | 'good' | 'skip'; hash: string; subject?: string }[] = [];

          // Parse 'git bisect (bad|good|skip) <hash>'
          // Also handle the initial start if needed, but usually we care about the steps.
          // Example output:
          // git bisect start
          // # bad: [hash] msg
          // git bisect bad hash
          // # good: [hash] msg
          // git bisect good hash

          for (const line of lines) {
              const match = line.match(/^git bisect (bad|good|skip) ([a-f0-9]+)/);
              if (match) {
                  entries.push({
                      status: match[1] as 'bad' | 'good' | 'skip',
                      hash: match[2]
                  });
              }
          }
          return entries.reverse(); // Show newest first? Or keeps chronological? Usually logs are chronological. Let's keep as is or reverse based on UI pref. Reverse is better for "Latest actions".
      } catch (e) {
          return [];
      }
  }

  private async runBisectCommand(cmd: 'good' | 'bad' | 'skip', hash?: string): Promise<string> {
    const git = this.gitService.executor;
    if (!git) throw new Error('Git not initialized');

    const args = ['bisect', cmd];
    if (hash) {
        args.push(hash);
    }

    const result = await git.exec(args);
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
