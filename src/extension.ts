import { URLSearchParams } from 'url';
import * as vscode from 'vscode';
import { AIService } from './services/AIService';
import { AuthService } from './services/AuthService';
import { BisectService } from './services/BisectService';
import { GitflowService } from './services/GitflowService';
import { GitService } from './services/GitService';
import { IconService } from './services/IconService';
import { WorktreeService } from './services/WorktreeService';
import { WorktreeTreeProvider } from './providers/WorktreeTreeProvider';
import { PullRequestTreeProvider } from './providers/PullRequestTreeProvider';
import { WelcomeView } from './webviews/WelcomeView';
import { FeedbackView } from './webviews/FeedbackView';

import { BlameCommands } from './commands/BlameCommands';
import { BranchCommands } from './commands/BranchCommands';
import { CherryPickCommand } from './commands/CherryPickCommand';
import { StashCommands } from './commands/StashCommands';
import { CopyCommands } from './commands/CopyCommands';
import { FileBlameDecorator } from './decorators/FileBlameDecorator';
import { GutterBlameDecorator } from './decorators/GutterBlameDecorator';
import { InlineBlameDecorator } from './decorators/InlineBlameDecorator';
import { CommitChatPanel } from './panels/CommitChatPanel';
import { GitGraphPanel } from './panels/GitGraphPanel';
import { RebasePanel } from './panels/RebasePanel';
import { AuthorshipCodeLensProvider } from './providers/AuthorshipCodeLensProvider';
import { BranchTreeProvider } from './providers/BranchTreeProvider';
import { ChangesTreeProvider } from './providers/ChangesTreeProvider';
import { CommitTreeProvider } from './providers/CommitTreeProvider';
import { ContributorTreeProvider } from './providers/ContributorTreeProvider';
import { DiffContentProvider } from './providers/DiffContentProvider';
import { FileHistoryProvider } from './providers/FileHistoryProvider';
import { GitContentProvider } from './providers/GitContentProvider';
import { SelectionCodeLensProvider } from './providers/SelectionCodeLensProvider';
import { StashTreeProvider } from './providers/StashTreeProvider';
import { TagTreeProvider } from './providers/TagTreeProvider';

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

  // Core Commands
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
      vscode.env.openExternal(vscode.Uri.parse('https://buymeacoffee.com/funnyturkishdude'));
    })
  );

  // Authentication Commands
  AuthService.getInstance().init(context);
  AuthService.getInstance()
    .isLoggedIn()
    .then((loggedIn) => {
      vscode.commands.executeCommand('setContext', 'gitorbit.isLoggedIn', loggedIn);
    });

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.login', () => {
      const appName = vscode.env.uriScheme;
      vscode.env.openExternal(
        vscode.Uri.parse(`https://kuulto.app/signin?app=gitorbit&appname=${appName}`)
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.logout', async () => {
      await AuthService.getInstance().logout();
      vscode.window.showInformationMessage('Logged out from Kuulto AI.');
    })
  );

  // Handle auth callback
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
        if (uri.path === '/auth-callback') {
          const params = new URLSearchParams(uri.query);
          let accessToken = params.get('access_token') || params.get('token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            AuthService.getInstance().storeTokens(accessToken, refreshToken);
            vscode.window.showInformationMessage('Successfully logged into Kuulto AI!');
          } else if (accessToken) {
            AuthService.getInstance().storeTokens(accessToken, '');
            vscode.window.showInformationMessage('Successfully logged into Kuulto AI!');
          }
        }
      },
    })
  );

  // Initialize Services
  const gitService = GitService.getInstance();
  const aiService = AIService.getInstance();
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
  const tagProvider = new TagTreeProvider();
  const contributorProvider = new ContributorTreeProvider();
  const worktreeProvider = new WorktreeTreeProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('gitorbit.views.localBranches', localBranchProvider),
    vscode.window.registerTreeDataProvider('gitorbit.views.remoteBranches', remoteBranchProvider),
    vscode.window.registerTreeDataProvider('gitorbit.views.commits', commitProvider),
    vscode.window.registerTreeDataProvider('gitorbit.views.graph', graphProvider),
    vscode.window.registerTreeDataProvider('gitorbit.views.fileHistory', fileHistoryProvider),
    vscode.window.registerTreeDataProvider('gitorbit.views.stashes', stashProvider),
    vscode.window.registerTreeDataProvider('gitorbit.views.tags', tagProvider),
    vscode.window.registerTreeDataProvider('gitorbit.views.contributors', contributorProvider),
    vscode.window.registerTreeDataProvider('gitorbit.views.worktrees', worktreeProvider)
  );

  // Move refreshAll up so it's available for providers
  const refreshAll = () => {
    GitService.getInstance().clearCache(); // Refresh cache
    localBranchProvider.refresh();
    remoteBranchProvider.refresh();
    commitProvider.refresh();
    graphProvider.refresh();
    fileHistoryProvider.refresh();
    stashProvider.refresh();
    tagProvider.refresh();
    contributorProvider.refresh();
    worktreeProvider.refresh();
    if (changesProvider) {
      changesProvider.refresh();
    }
  };

  const changesProvider = new ChangesTreeProvider(context.extensionUri, refreshAll);
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
        // Handle both CommitItem and GraphItem properties
        let message = node.label || node.message || node.commit?.message;

        if (typeof message !== 'string' && message?.label) {
          message = message.label;
        }

        if (!message || message === 'No message') {
          const targetRepo = node.repoRoot
            ? GitService.getInstance().getRepositoryByRoot(node.repoRoot)
            : undefined;
          const details = await GitService.getInstance().getCommitDetails(node.hash, targetRepo);
          message = details.message;
        }

        const targetRepo = node.repoRoot
          ? GitService.getInstance().getRepositoryByRoot(node.repoRoot)
          : undefined;
        CommitChatPanel.createOrShow(
          context.extensionUri,
          node.hash,
          message || 'No message',
          undefined,
          undefined,
          targetRepo
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
  const inlineBlameDecorator = new InlineBlameDecorator();
  const gutterBlameDecorator = new GutterBlameDecorator(context.extensionUri);
  const fileBlameDecorator = FileBlameDecorator.getInstance();

  context.subscriptions.push(inlineBlameDecorator);
  context.subscriptions.push(gutterBlameDecorator);
  context.subscriptions.push({ dispose: () => fileBlameDecorator.hide() });

  // Blame Commands
  new BlameCommands(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.toggleFileBlame', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await FileBlameDecorator.getInstance().toggle(editor);
      }
    })
  );

  // Show Blame at Cursor command
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.showBlameAtCursor', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const line = editor.selection.active.line;
      const filePath = editor.document.uri.fsPath;

      await vscode.commands.executeCommand('gitorbit.showBlameDetails', { filePath, line });
    })
  );

  // CodeLens
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, new AuthorshipCodeLensProvider())
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, new SelectionCodeLensProvider())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.openCommitDiff', async (item: any) => {
      if (!item.hash) return;
      try {
        const gitService = GitService.getInstance();
        const targetRepo = item.repoRoot
          ? gitService.getRepositoryByRoot(item.repoRoot)
          : undefined;
        let filePath = item.filePath;

        if (!filePath) {
          // Global history
          const changedFiles = await gitService.getChangedFiles(item.hash, targetRepo);
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
        const rightUri = GitContentProvider.getUri(item.hash, filePath, item.repoRoot);
        const leftUri = GitContentProvider.getUri(`${item.hash}^`, filePath, item.repoRoot);

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
        const gitService = GitService.getInstance();
        const repoRoot = item.repoRoot;

        let targetRepo: any;
        if (repoRoot) {
          const repos = gitService.getMainRepositories();
          targetRepo = repos.find((r) => r.rootDir === repoRoot);
          if (!targetRepo) {
            const worktrees = gitService.getWorktrees();
            targetRepo = worktrees.find((w) => w.rootDir === repoRoot);
          }
        }

        const files = await gitService.getChangedFilesWithStatus(item.hash, targetRepo);

        if (files.length === 0) {
          vscode.window.showInformationMessage('No changed files in this commit.');
          return;
        }

        const multiDiffResources = files.map((file) => {
          const { original: originalUri, modified: modifiedUri } =
            GitContentProvider.getCommitDiffUris(item.hash, file.path, file.status, repoRoot);

          return {
            originalUri: originalUri,
            modifiedUri: modifiedUri,
            name: file.path,
            title: file.path,
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

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.openPR', async (pr: any) => {
      if (!pr) return;

      // Import and show the PR webview
      const { PullRequestView } = await import('./webviews/PullRequestView');
      await PullRequestView.show(context, pr);
    })
  );

  // Commands
  const cherryPickCmd = new CherryPickCommand();
  // Centralized Refresh Function

  // Register Centralized Command Classes (Branch & Stash)
  BranchCommands.getInstance(refreshAll, localBranchProvider, remoteBranchProvider).register(
    context
  );
  StashCommands.getInstance(refreshAll).register(context);
  CopyCommands.getInstance().register(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.startRemoteBranch', (node?: any) => {
      const defaultSource = node ? node.branchName || node.label : undefined;
      const repo = node ? node.repo : undefined;
      GitflowService.getInstance().showRemoteMenu(defaultSource, repo);
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
    vscode.commands.registerCommand('gitorbit.startBranch', (node?: any) => {
      const defaultSource = node ? node.branchName || node.label : undefined;
      const repo = node ? node.repo : undefined;
      GitflowService.getInstance().startBranch(defaultSource, repo);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.gitflow.menu', (node?: any) => {
      GitflowService.getInstance().showMenu(node);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.gitflow.startFeature', (node?: any) => {
      const repo = node ? node.repo : undefined;
      GitflowService.getInstance().startFeature(repo);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.gitflow.startHotfix', (node?: any) => {
      const repo = node ? node.repo : undefined;
      GitflowService.getInstance().startHotfix(repo);
    })
  );

  // Worktree Commands
  const worktreeService = WorktreeService.getInstance();

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.worktree.list', async () => {
      await worktreeService.showWorktreeMenu();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.worktree.add', async () => {
      await worktreeService.showCreateWorktreeDialog();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.worktree.remove', async (item?: any) => {
      let worktreesToRemove: { path: string; branch?: string; head?: string }[] = [];

      if (item && item.repo && item.repo.isWorktree) {
        worktreesToRemove = [{ path: item.repo.rootDir, branch: item.repo.branch }];
      } else {
        const worktrees = await worktreeService.listWorktrees();
        if (worktrees.length === 0) {
          vscode.window.showInformationMessage('No worktrees found');
          return;
        }
        worktreesToRemove = worktrees;
      }

      if (worktreesToRemove.length === 1) {
        await worktreeService.removeWorktree(worktreesToRemove[0].path);
        refreshAll();
        return;
      }

      const items = worktreesToRemove.map((wt) => ({
        label: `$(folder) ${wt.path.split(/[/\\]/).pop()}`,
        description: `Branch: ${wt.branch || wt.head}`,
        worktree: wt,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select worktree to remove',
      });

      if (selected) {
        await worktreeService.removeWorktree(selected.worktree.path);
        refreshAll();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.worktree.prune', async () => {
      await worktreeService.pruneWorktrees();
      refreshAll();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.worktree.open', async (item: any) => {
      if (item && item.repo && item.repo.isWorktree) {
        await worktreeService.openWorktree(item.repo.rootDir);
      } else {
        const repos = gitService.getWorktrees();
        if (repos.length === 0) {
          vscode.window.showInformationMessage('No worktrees found');
          return;
        }

        const items = repos.map((wt) => ({
          label: `$(folder) ${wt.rootDir.split(/[/\\]/).pop()}`,
          description: `Branch: ${wt.branch || ''}`,
          repo: wt,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select worktree to open',
        });

        if (selected && selected.repo) {
          await worktreeService.openWorktree(selected.repo.rootDir);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.worktree.switch', async (item: any) => {
      let worktreePath: string | undefined;

      if (item && item.repo && item.repo.isWorktree) {
        worktreePath = item.repo.rootDir;
      } else if (item && item.worktreeInfo && item.worktreeInfo.path) {
        worktreePath = item.worktreeInfo.path;
      }

      if (!worktreePath) {
        const repos = gitService.getWorktrees();
        if (repos.length === 0) {
          vscode.window.showInformationMessage('No worktrees found');
          return;
        }

        const items = repos.map((wt) => ({
          label: `$(folder) ${wt.rootDir.split(/[/\\]/).pop()}`,
          description: `Branch: ${wt.branch || ''}`,
          repo: wt,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select worktree to switch',
        });

        if (selected && selected.repo) {
          worktreePath = selected.repo.rootDir;
        }
      }

      if (worktreePath) {
        gitService.setSelectedRepository(gitService.getRepositoryByRoot(worktreePath));
        vscode.window.showInformationMessage(
          `Switched to worktree: ${worktreePath.split(/[/\\]/).pop()}`
        );
        refreshAll();
      }
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

    if (filter === undefined) return; // Cancelled
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
            await gitService.fetchAll();
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

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.feedback', () => {
      FeedbackView.show(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.showGitGraph', () => {
      GitGraphPanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.chatWithSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showInformationMessage('Please select some code first.');
        return;
      }

      const selectedText = editor.document.getText(selection);
      const filename = editor.document.fileName.split('/').pop() || 'file';

      CommitChatPanel.createOrShow(
        context.extensionUri,
        'selected-code',
        `Analysis of selected code in ${filename}`,
        selectedText,
        'How can I improve this code? Please analyze it for code smells, performance issues, and readability.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.interactiveRebase', () => {
      RebasePanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.graph.tag', async (node: any) => {
      const hash = node ? node.hash : undefined;
      if (!hash) return;

      const tagName = await vscode.window.showInputBox({
        prompt: `Enter tag name for commit ${hash.substring(0, 7)}`,
        placeHolder: 'e.g. v1.0.0',
      });

      if (!tagName) return;

      try {
        await GitService.getInstance().createTag(tagName, hash);
        vscode.window.showInformationMessage(`Tag '${tagName}' created successfully.`);
        refreshAll();
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to create tag: ${e.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.graph.revert', async (node: any) => {
      const hash = node ? node.hash : undefined;
      if (!hash) return;

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to revert commit ${hash.substring(0, 7)}?`,
        'Yes',
        'No'
      );
      if (confirm !== 'Yes') return;

      try {
        await GitService.getInstance().revert(hash);
        vscode.window.showInformationMessage(`Commit ${hash.substring(0, 7)} reverted.`);
        refreshAll();
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to revert commit: ${e.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.graph.reset', async (node: any) => {
      const hash = node ? node.hash : undefined;
      if (!hash) return;

      const mode = await vscode.window.showQuickPick(['soft', 'mixed', 'hard'], {
        placeHolder: `Select reset mode for ${hash.substring(0, 7)}`,
      });

      if (!mode) return;

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to reset current branch to ${hash.substring(0, 7)} (${mode})?`,
        { modal: true },
        'Yes, Reset'
      );
      if (confirm !== 'Yes, Reset') return;

      try {
        await GitService.getInstance().reset(mode as any, hash);
        vscode.window.showInformationMessage(`Reset to ${hash.substring(0, 7)} completed.`);
        refreshAll();
      } catch (e: any) {
        vscode.window.showErrorMessage(`Reset failed: ${e.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.contributors.openProfile', async (item: any) => {
      if (item && (item.email || item.name)) {
        const gitService = GitService.getInstance();
        const remoteUrl = await gitService.getRemoteUrl();

        let baseUrl = 'https://github.com/search?q=';
        let searchSuffix = '&type=users';

        if (remoteUrl) {
          if (remoteUrl.includes('gitlab.com')) {
            baseUrl = 'https://gitlab.com/search?search=';
            searchSuffix = '&group_id=&project_id=&repository_ref=&scope=users';
          } else if (remoteUrl.includes('bitbucket.org')) {
            baseUrl = 'https://bitbucket.org/site/channels/desktop/index.html?search=';
            searchSuffix = '';
          }
        }

        const query = item.name || item.email;
        vscode.env.openExternal(
          vscode.Uri.parse(`${baseUrl}${encodeURIComponent(query)}${searchSuffix}`)
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.tags.refresh', () => {
      tagProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.contributors.refresh', () => {
      contributorProvider.refresh();
    })
  );

  // Sync Commands

  // Auto Sync Logic handles periodic fetching
  let syncInterval: ReturnType<typeof setInterval> | undefined;
  const setupAutoSync = () => {
    if (syncInterval) clearInterval(syncInterval);
    const intervalMins = ConfigService.getInstance().autoSyncInterval;
    if (intervalMins > 0) {
      syncInterval = setInterval(
        async () => {
          try {
            await gitService.fetchAll();
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
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitorbit.sync.autoSyncInterval')) {
        setupAutoSync();
      }
    })
  );

  // Webview - Show on Update/Install
  WelcomeView.show(context);

  // Real-time Update: Watch .git/HEAD to detect external changes
  let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
  const triggerRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => refreshAll(), 1000);
  };

  // 1. Manual File Watcher (Fallback for environments without built-in Git extension)
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/.git/{HEAD,index,refs/heads/**,refs/remotes/**}'
  );
  watcher.onDidChange(triggerRefresh);
  watcher.onDidCreate(triggerRefresh);
  watcher.onDidDelete(triggerRefresh);
  context.subscriptions.push(watcher);

  // 2. Native VS Code Git API Integration (Primary for Cursor/Antigravity/VSCode)
  try {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (gitExtension) {
      const initGitApi = (api: any) => {
        api.onDidOpenRepository((repo: any) => {
          repo.state.onDidChange(() => triggerRefresh());
        });
        api.repositories.forEach((repo: any) => {
          repo.state.onDidChange(() => triggerRefresh());
        });
      };

      if (gitExtension.isActive) {
        initGitApi(gitExtension.exports.getAPI(1));
      } else {
        gitExtension.activate().then((api) => {
          initGitApi(api.getAPI(1));
        });
      }
    }
  } catch (e) {
    console.warn('GitOrbit: Failed to hook into native Git extension', e);
  }

  // Bisect Commands
  const bisectService = BisectService.getInstance();
  context.subscriptions.push(bisectService);

  // ... (previous bisect commands) ...

  // Pull Requests
  const prProvider = new PullRequestTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('gitorbit.views.pullRequests', prProvider)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.pullRequests.refresh', () => prProvider.refresh())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.pullRequests.login', () => prProvider.login())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.pullRequests.create', () => prProvider.createPR())
  );

  // Refresh PRs periodically or on view visibility (not implemented yet, pure manual refresh for now)

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.bisect.start', () => bisectService.start())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.bisect.markGood', () => bisectService.markGood())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.bisect.markBad', () => bisectService.markBad())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.bisect.reset', () => bisectService.reset())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.bisect.skip', () => bisectService.skip())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.bisect.showMenu', () => bisectService.showMenu())
  );

  // Repository Selection - updates all views when selected repo changes
  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.selectRepo', (repo: any) => {
      if (repo && repo.rootDir) {
        GitService.getInstance().setSelectedRepository(repo);
        vscode.window.showInformationMessage(
          `Selected repository: ${repo.rootDir.split(/[/\\]/).pop()}`
        );
      }
    })
  );

  const formatBranchName = (branch?: string): string => {
    if (!branch) return 'unknown';
    return branch.replace(/^refs\/heads\//, '');
  };

  const showRepositorySwitcher = async () => {
    const gitService = GitService.getInstance();
    await gitService.ensureInitialized();
    const repos = gitService.getMainRepositories();
    const worktrees = gitService.getWorktrees();
    const allRepos = [...repos, ...worktrees];

    if (allRepos.length === 0) {
      vscode.window.showWarningMessage('No git repositories found.');
      return;
    }

    if (allRepos.length === 1) {
      vscode.window.showInformationMessage('Only one repository/worktree in workspace.');
      return;
    }

    const selectedRepo = gitService.getSelectedRepository();

    type RepoPickItem = vscode.QuickPickItem & { repo?: (typeof allRepos)[number] };
    const repoOptions: RepoPickItem[] = [];

    if (repos.length > 0) {
      repoOptions.push({
        label: '$(repo) Main Repositories',
        kind: vscode.QuickPickItemKind.Separator,
      });

      repos.forEach((repo) => {
        repoOptions.push({
          label: `$(repo) ${repo.rootDir.split(/[/\\]/).pop() || repo.rootDir}`,
          description: repo.rootDir,
          detail:
            selectedRepo?.rootDir === repo.rootDir
              ? '$(check) Currently selected'
              : `Branch: ${formatBranchName(repo.branch)}`,
          repo,
        });
      });
    }

    if (worktrees.length > 0) {
      repoOptions.push({
        label: '$(files) Worktrees',
        kind: vscode.QuickPickItemKind.Separator,
      });

      worktrees.forEach((worktree) => {
        repoOptions.push({
          label: `$(files) ${worktree.rootDir.split(/[/\\]/).pop() || worktree.rootDir}`,
          description: worktree.rootDir,
          detail:
            selectedRepo?.rootDir === worktree.rootDir
              ? '$(check) Currently selected'
              : `Branch: ${formatBranchName(worktree.branch)}`,
          repo: worktree,
        });
      });
    }

    const picked = await vscode.window.showQuickPick(repoOptions, {
      placeHolder: 'Select repository or worktree',
      title: 'GitOrbit: Switch Repository/Worktree',
    });

    if (picked?.repo) {
      gitService.setSelectedRepository(picked.repo);
      vscode.window.showInformationMessage(
        `Switched to: ${picked.label.replace(/^\$\(.*\)\s/, '')}`
      );
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('gitorbit.switchRepository', showRepositorySwitcher)
  );

  // Status bar item to show active repository
  const repoStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  repoStatusBarItem.command = 'gitorbit.switchRepository';
  context.subscriptions.push(repoStatusBarItem);

  // Update status bar when repo selection changes
  const updateRepoStatusBar = async () => {
    const gitService = GitService.getInstance();
    const allRepos = gitService.getRepositories();
    const mainRepos = gitService.getMainRepositories();
    const selectedRepo = gitService.getSelectedRepository();
    const worktrees = gitService.getWorktrees();

    if (allRepos.length === 0) {
      repoStatusBarItem.hide();
      return;
    }

    const activeRepo = selectedRepo || mainRepos[0] || worktrees[0];
    const isWorktree = !!activeRepo.isWorktree;
    const icon = isWorktree ? '$(files)' : '$(repo)';
    const activeName = activeRepo.rootDir.split(/[/\\]/).pop() || 'Repository';
    let branchInfo = formatBranchName(activeRepo.branch);
    try {
      const branches = await gitService.getBranches(activeRepo);
      branchInfo = formatBranchName(branches.current || activeRepo.branch);
    } catch {
      // Keep the discovered branch if live branch lookup fails.
    }
    const totalRepoOptions = mainRepos.length + worktrees.length;
    const hasSwitchOptions = totalRepoOptions > 1;
    const chevron = hasSwitchOptions ? ' ($(chevron-down))' : '';

    if (!hasSwitchOptions) {
      repoStatusBarItem.text = `${icon} ${activeName} (${branchInfo})`;
      repoStatusBarItem.tooltip = `Active: ${activeRepo.rootDir}\nBranch: ${branchInfo}`;
      repoStatusBarItem.show();
      return;
    }

    repoStatusBarItem.text = `${icon} ${activeName} (${branchInfo})${chevron}`;
    repoStatusBarItem.tooltip = `Active: ${activeRepo.rootDir}\nBranch: ${branchInfo}\nMain repos: ${mainRepos.length}\nWorktrees: ${worktrees.length}\nClick to switch repository/worktree`;
    repoStatusBarItem.show();
  };

  // Initial update
  void updateRepoStatusBar();

  // Listen for repo selection changes and refresh all views
  context.subscriptions.push(
    GitService.getInstance().onDidChangeSelectedRepo(() => {
      refreshAll();
      void updateRepoStatusBar();
    })
  );

  // Update status bar when repos are discovered
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      setTimeout(() => void updateRepoStatusBar(), 1000);
    })
  );

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
