import * as vscode from 'vscode';
import { GitService } from './services/GitService';
import { GitflowService } from './services/GitflowService';
import { IconService } from './services/IconService';
import { WelcomeView } from './webviews/WelcomeView';

import { BranchTreeProvider } from './providers/BranchTreeProvider';
import { CommitTreeProvider } from './providers/CommitTreeProvider';
import { FileHistoryProvider } from './providers/FileHistoryProvider';
import { StashTreeProvider } from './providers/StashTreeProvider';
import { InlineBlameDecorator } from './decorators/InlineBlameDecorator';
import { GutterBlameDecorator } from './decorators/GutterBlameDecorator';
import { CherryPickCommand } from './commands/CherryPickCommand';
import { BranchCommands } from './commands/BranchCommands';
import { StashCommands } from './commands/StashCommands';
import { AuthorshipCodeLensProvider } from './providers/AuthorshipCodeLensProvider';
import { GitContentProvider } from './providers/GitContentProvider';
import { DiffContentProvider } from './providers/DiffContentProvider';
import { ChangesTreeProvider } from './providers/ChangesTreeProvider';
import { CommitChatPanel } from './panels/CommitChatPanel';

import { GraphTreeProvider } from './providers/GraphTreeProvider';
import { StatusDecorationProvider } from './providers/StatusDecorationProvider';
import { ConfigService } from './services/ConfigService';

/**
 * Main entry point for the GitOrbit extension.
 * This function is called when the extension is activated.
 * It registers all services, providers, decorators, and commands.
 * @param context - The extension context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('GitOrbit is now active!');

  // Register Decoration Provider
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(new StatusDecorationProvider())
  );

  // Initialize Services
  const gitService = GitService.getInstance();
  IconService.getInstance(context.extensionUri);

  // Initialize filter contexts
  vscode.commands.executeCommand('setContext', 'gitorbit.graph.isFiltered', false);
  vscode.commands.executeCommand('setContext', 'gitorbit.commits.isFiltered', false);
  vscode.commands.executeCommand('setContext', 'gitorbit.fileHistory.isFiltered', false);

  // Register Content Providers
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      GitContentProvider.scheme,
      new GitContentProvider()
    )
  );
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      DiffContentProvider.scheme,
      new DiffContentProvider()
    )
  );

  // Tree Providers
  const localBranchProvider = new BranchTreeProvider(false);
  const remoteBranchProvider = new BranchTreeProvider(true);
  const commitProvider = new CommitTreeProvider();
  const graphProvider = new GraphTreeProvider();
  const fileHistoryProvider = new FileHistoryProvider();
  const stashProvider = new StashTreeProvider();

  vscode.window.registerTreeDataProvider('gitorbit.views.localBranches', localBranchProvider);
  vscode.window.registerTreeDataProvider('gitorbit.views.remoteBranches', remoteBranchProvider);
  vscode.window.registerTreeDataProvider('gitorbit.views.commits', commitProvider);
  vscode.window.registerTreeDataProvider('gitorbit.views.graph', graphProvider);
  vscode.window.registerTreeDataProvider('gitorbit.views.fileHistory', fileHistoryProvider);
  vscode.window.registerTreeDataProvider('gitorbit.views.stashes', stashProvider);

  const changesProvider = new ChangesTreeProvider(context.extensionUri);
  const changesTreeView = vscode.window.createTreeView('gitorbit.views.changes', {
    treeDataProvider: changesProvider,
  });

  const updateBadge = () => {
    const total = changesProvider.stagedCount + changesProvider.unstagedCount;
    changesTreeView.badge =
      total > 0 ? { value: total, tooltip: `${total} pending changes` } : undefined;
  };

  changesProvider.onDidChangeTreeData(() => {
    updateBadge();
  });

  // Initial badge update
  updateBadge();

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.refreshChanges', () => {
      changesProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.openDiff', (item) =>
      changesProvider.openDiff(item)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.stage', (item) => changesProvider.stage(item))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.openFile', (item) =>
      changesProvider.openFile(item)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.discard', (item) =>
      changesProvider.discard(item)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.unstage', (item) =>
      changesProvider.unstage(item)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.openAllChanges', () =>
      changesProvider.openAllChanges()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.openAllStaged', () =>
      changesProvider.openAllStaged()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.commit', () => changesProvider.commit())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.smartCommit', () =>
      changesProvider.smartCommit()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.chatWithCommit', async (node: any) => {
      if (node && node.hash) {
        let author = node.author || node.commit?.author;
        let message = node.message || node.commit?.message;

        if (!author || author === 'Unknown' || !message || message === 'No message') {
          const details = await GitService.getInstance().getCommitDetails(node.hash);
          author = details.author;
          message = details.message;
        }

        CommitChatPanel.createOrShow(
          context.extensionUri,
          node.hash,
          author || 'Unknown',
          message || 'No message'
        );
      } else {
        vscode.window.showErrorMessage('Could not resolve commit details for chat.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.checkCodeSmells', async () => {
      const gitService = GitService.getInstance();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Analyzing changes for code smells...',
          cancellable: false,
        },
        async () => {
          const stagedDiff = await gitService.getStagedDiff();
          const workingDiff = await gitService.getWorkingDiff();
          const untrackedDiff = await gitService.getUntrackedDiff();

          const combinedDiff = [
            stagedDiff ? `--- STAGED CHANGES ---\n${stagedDiff}` : '',
            workingDiff ? `--- UNSTAGED CHANGES ---\n${workingDiff}` : '',
            untrackedDiff ? `--- UNTRACKED FILES ---\n${untrackedDiff}` : '',
          ]
            .filter(Boolean)
            .join('\n\n');

          if (!combinedDiff) {
            vscode.window.showInformationMessage('No changes found to check for code smells.');
            return;
          }

          await CommitChatPanel.createOrShow(
            context.extensionUri,
            'current-changes',
            'You',
            'Workspace Changes',
            combinedDiff,
            'Please check these changes for any code smells, potential bugs, or improvements. Provide a detailed analysis.'
          );
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.commitStaged', () =>
      changesProvider.commitStaged()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.commitAmend', () =>
      changesProvider.commit(true)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.stageAll', () => changesProvider.stageAll())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.unstageAll', () =>
      changesProvider.unstageAll()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.discardAll', () =>
      changesProvider.discardAll()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.pull', () => changesProvider.pull())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.push', () => changesProvider.push())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.sync', () => changesProvider.sync())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.undoCommit', () =>
      changesProvider.undoCommit()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.abortRebase', () =>
      changesProvider.abortRebase()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.changes.abortMerge', () =>
      changesProvider.abortMerge()
    )
  );

  // Decorators
  new InlineBlameDecorator();
  new GutterBlameDecorator();

  // CodeLens
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, new AuthorshipCodeLensProvider())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.openCommitDiff', async (item: any) => {
      if (!item.hash) return;
      try {
        let filePath = item.filePath;

        if (!filePath) {
          // Global Commit History: Find which files changed
          const changedFiles = await GitService.getInstance().getChangedFiles(item.hash);
          if (changedFiles.length === 0) {
            vscode.window.showInformationMessage('No files changed in this commit.');
            return;
          }

          if (changedFiles.length === 1) {
            filePath = changedFiles[0];
          } else {
            const selected = await vscode.window.showQuickPick(changedFiles, {
              placeHolder: 'Select file to view diff',
            });
            if (!selected) return;
            filePath = selected;
          }
        }

        // Side-by-side Diff
        const fileName = filePath.split(/[\\\/]/).pop();
        const rightUri = GitContentProvider.getUri(item.hash, filePath);
        const leftUri = GitContentProvider.getUri(`${item.hash}^`, filePath);

        await vscode.commands.executeCommand(
          'vscode.diff',
          leftUri,
          rightUri,
          `${fileName} (${item.hash.substring(0, 7)} vs Parent)`,
          { preview: true }
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to open diff: ${error.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.openCommitDiffs', async (item: any) => {
      if (!item.hash) return;

      // Multi-diff editor was introduced in 1.86
      const versionParts = vscode.version.split('.');
      const major = parseInt(versionParts[0]);
      const minor = parseInt(versionParts[1]);
      if (major < 1 || (major === 1 && minor < 86)) {
        vscode.window.showErrorMessage(
          `Multi-file diff editor requires VS Code 1.86+. You are on ${vscode.version}.`
        );
        return;
      }

      try {
        const files = await GitService.getInstance().getChangedFilesWithStatus(item.hash);

        if (files.length === 0) {
          vscode.window.showInformationMessage('No changed files in this commit.');
          return;
        }

        const multiDiffResources = files.map((file) => {
          const originalUri =
            file.status === 'A' ? undefined : GitContentProvider.getUri(`${item.hash}^`, file.path);

          const modifiedUri =
            file.status === 'D' ? undefined : GitContentProvider.getUri(item.hash, file.path);

          return {
            originalUri: originalUri,
            modifiedUri: modifiedUri,
            name: file.path, // Optional: might give better label in the diff
            title: file.path, // Optional
          };
        });

        const title = typeof item.label === 'string' ? item.label : 'Commit Changes';

        await vscode.commands.executeCommand('_workbench.openMultiDiffEditor', {
          title: `${title} (${item.hash.substring(0, 7)})`,
          resources: multiDiffResources,
        });
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to open changes: ${error.message}. VS Code Version: ${vscode.version}`
        );
      }
    })
  );

  // Commands
  const cherryPickCmd = new CherryPickCommand();
  // Centralized Refresh Function
  const refreshAll = () => {
    GitService.getInstance().clearCache(); // Ensure we fetch fresh data
    localBranchProvider.refresh();
    remoteBranchProvider.refresh();
    commitProvider.refresh();
    graphProvider.refresh();
    fileHistoryProvider.refresh();
    stashProvider.refresh();
    changesProvider.refresh();
  };

  // Register Centralized Command Classes (Branch & Stash)
  BranchCommands.getInstance(refreshAll).register(context);
  StashCommands.getInstance(refreshAll).register(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.startRemoteBranch', () => {
      GitflowService.getInstance().startRemoteBranch();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.cherryPick', async (item: any) => {
      const hash = item ? item.hash : undefined;
      await cherryPickCmd.execute(hash);
      refreshAll();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.checkoutCommit', async (item: any) => {
      const hash = item ? item.hash : undefined;
      if (!hash) return;

      const confirm = await vscode.window.showInformationMessage(
        `Checkout commit ${hash.substring(0, 7)}? (Detached HEAD)`,
        'Yes',
        'No'
      );
      if (confirm !== 'Yes') return;

      try {
        await gitService.checkout(hash);
        vscode.window.showInformationMessage(`Checked out commit ${hash.substring(0, 7)}`);
        refreshAll();
      } catch (error: any) {
        vscode.window.showErrorMessage(`Checkout failed: ${error.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.startBranch', () => {
      GitflowService.getInstance().startBranch();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.gitflow.menu', () => {
      GitflowService.getInstance().showMenu();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.gitflow.startFeature', () => {
      GitflowService.getInstance().startFeature();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.gitflow.startHotfix', () => {
      GitflowService.getInstance().startHotfix();
    })
  );

  // Deletion Commands

  const setFilterWithContext = (provider: any, viewKey: string, filter: string) => {
    provider.setFilter(filter);
    vscode.commands.executeCommand('setContext', `gitorbit.${viewKey}.isFiltered`, !!filter);
  };

  const handleFilter = async (provider: any, viewName: string, viewKey: string) => {
    const filter = await vscode.window.showInputBox({
      placeHolder: `Filter ${viewName}...`,
      prompt: 'Enter text to filter by message, hash, or author',
    });

    if (filter === undefined) return; // User cancelled
    setFilterWithContext(provider, viewKey, filter);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.filterGraph', () =>
      handleFilter(graphProvider, 'Graph', 'graph')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.clearFilterGraph', () =>
      setFilterWithContext(graphProvider, 'graph', '')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.filterCommits', () =>
      handleFilter(commitProvider, 'Commits', 'commits')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.clearFilterCommits', () =>
      setFilterWithContext(commitProvider, 'commits', '')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.filterFileHistory', () =>
      handleFilter(fileHistoryProvider, 'File History', 'fileHistory')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.clearFilterFileHistory', () =>
      setFilterWithContext(fileHistoryProvider, 'fileHistory', '')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.refreshViews', async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Fetching...',
          cancellable: false,
        },
        async () => {
          try {
            await gitService.fetch();
          } catch (e) {
            console.error('Fetch failed', e);
          }
          refreshAll();
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.loadMoreCommits', () => {
      commitProvider.incrementLimit();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.graph.loadMore', () => {
      graphProvider.incrementLimit();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.fileHistory.loadMore', () => {
      fileHistoryProvider.incrementLimit();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.showWelcome', () => {
      WelcomeView.show(context, true);
    })
  );

  // Sync Commands

  // Auto Sync Logic handles periodic fetching
  let syncInterval: NodeJS.Timeout | undefined;
  const setupAutoSync = () => {
    if (syncInterval) clearInterval(syncInterval);
    const intervalMins = ConfigService.getInstance().autoSyncInterval;
    if (intervalMins > 0) {
      syncInterval = setInterval(
        async () => {
          try {
            await gitService.fetch();
            refreshAll();
          } catch (e) {
            console.error('Auto-sync failed', e);
          }
        },
        intervalMins * 60 * 1000
      );
    }
  };

  setupAutoSync();
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('gitorbit.sync.autoSyncInterval')) {
      setupAutoSync();
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.openSettings', () => {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:selcuksarikoz.gitorbit'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.donate', () => {
      vscode.env.openExternal(
        vscode.Uri.parse(
          'https://www.paypal.com/donate?business=selcuksarikoz%40icloud.com&item_name=selcuk+sarikoz+-+gitorbit-vscode+extension&currency_code=USD'
        )
      );
    })
  );

  // Webview - Show on Update/Install
  WelcomeView.show(context);

  // Real-time Update: Watch .git/HEAD to detect external changes
  // Real-time Update: Watch .git internals to detect external changes
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/.git/{HEAD,index,refs/heads/**,refs/remotes/**}'
  );

  let refreshTimeout: NodeJS.Timeout | undefined;
  const triggerRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => refreshAll(), 1500);
  };

  watcher.onDidChange(triggerRefresh);
  watcher.onDidCreate(triggerRefresh);
  watcher.onDidDelete(triggerRefresh);

  // First Run Experience: Focus main views to ensure they are expanded
  const hasRun = context.globalState.get<boolean>('gitorbit.hasRun');
  if (!hasRun) {
    context.globalState.update('gitorbit.hasRun', true);
    setTimeout(async () => {
      try {
        await vscode.commands.executeCommand('gitorbit.views.changes.focus');
        await vscode.commands.executeCommand('gitorbit.views.localBranches.focus');
        await vscode.commands.executeCommand('gitorbit.views.graph.focus');
      } catch (e) {
        console.error('Failed to focus views on first run', e);
      }
    }, 1000);
  }
}

export function deactivate() {}
