import * as vscode from "vscode";
import { GitService } from "./services/GitService";
import { GitflowService } from "./services/GitflowService";
import { IconService } from "./services/IconService";
import { WelcomeView } from "./webviews/WelcomeView";
import { BranchTreeProvider } from "./providers/BranchTreeProvider";
import { CommitTreeProvider } from "./providers/CommitTreeProvider";
import { FileHistoryProvider } from "./providers/FileHistoryProvider";
import { StashTreeProvider } from "./providers/StashTreeProvider";
import { InlineBlameDecorator } from "./decorators/InlineBlameDecorator";
import { GutterBlameDecorator } from "./decorators/GutterBlameDecorator";
import { CherryPickCommand } from "./commands/CherryPickCommand";
import { BranchCommands } from "./commands/BranchCommands";
import { StashCommands } from "./commands/StashCommands";
import { AuthorshipCodeLensProvider } from "./providers/AuthorshipCodeLensProvider";
import { GitContentProvider } from "./providers/GitContentProvider";
import { DiffContentProvider } from "./providers/DiffContentProvider";
import { GraphTreeProvider } from "./providers/GraphTreeProvider";
import { StatusDecorationProvider } from "./providers/StatusDecorationProvider";
import { ConfigService } from "./services/ConfigService";

/**
 * Main entry point for the GitOrbit extension.
 * This function is called when the extension is activated.
 * It registers all services, providers, decorators, and commands.
 * @param context - The extension context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("GitOrbit is now active!");

  // Register Decoration Provider
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(new StatusDecorationProvider())
  );

  // Initialize Services
  const gitService = GitService.getInstance();
  IconService.getInstance(context.extensionUri);

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

  vscode.window.registerTreeDataProvider(
    "gitorbit.views.localBranches",
    localBranchProvider
  );
  vscode.window.registerTreeDataProvider(
    "gitorbit.views.remoteBranches",
    remoteBranchProvider
  );
  vscode.window.registerTreeDataProvider(
    "gitorbit.views.commits",
    commitProvider
  );
  vscode.window.registerTreeDataProvider("gitorbit.views.graph", graphProvider);
  vscode.window.registerTreeDataProvider(
    "gitorbit.views.fileHistory",
    fileHistoryProvider
  );
  vscode.window.registerTreeDataProvider(
    "gitorbit.views.stashes",
    stashProvider
  );

  // Decorators
  new InlineBlameDecorator();
  new GutterBlameDecorator();

  // CodeLens
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      new AuthorshipCodeLensProvider()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitorbit.openCommitDiff",
      async (item: any) => {
        if (!item.hash) return;
        try {
          let filePath = item.filePath;

          if (!filePath) {
            // Global Commit History: Find which files changed
            const changedFiles = await GitService.getInstance().getChangedFiles(
              item.hash
            );
            if (changedFiles.length === 0) {
              vscode.window.showInformationMessage(
                "No files changed in this commit."
              );
              return;
            }

            if (changedFiles.length === 1) {
              filePath = changedFiles[0];
            } else {
              const selected = await vscode.window.showQuickPick(changedFiles, {
                placeHolder: "Select file to view diff",
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
            "vscode.diff",
            leftUri,
            rightUri,
            `${fileName} (${item.hash.substring(0, 7)} vs Parent)`,
            { preview: true }
          );
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to open diff: ${error.message}`
          );
        }
      }
    )
  );

  // Commands
  const cherryPickCmd = new CherryPickCommand();
  // Centralized Refresh Function
  const refreshAll = () => {
    localBranchProvider.refresh();
    remoteBranchProvider.refresh();
    commitProvider.refresh();
    graphProvider.refresh();
    fileHistoryProvider.refresh();
    stashProvider.refresh();
  };

  // Register Centralized Command Classes (Branch & Stash)
  BranchCommands.getInstance(refreshAll).register(context);
  StashCommands.getInstance(refreshAll).register(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorbit.startRemoteBranch", () => {
      GitflowService.getInstance().startRemoteBranch();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitorbit.cherryPick",
      async (item: any) => {
        const hash = item ? item.hash : undefined;
        await cherryPickCmd.execute(hash);
        refreshAll();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorbit.startBranch", () => {
      GitflowService.getInstance().startBranch();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorbit.gitflow.menu", () => {
      GitflowService.getInstance().showMenu();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorbit.gitflow.startFeature", () => {
      GitflowService.getInstance().startFeature();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorbit.gitflow.startHotfix", () => {
      GitflowService.getInstance().startHotfix();
    })
  );

  // Deletion Commands

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorbit.refreshViews", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Fetching...",
          cancellable: false,
        },
        async () => {
          try {
            await gitService.fetch();
          } catch (e) {
            console.error("Fetch failed", e);
          }
          refreshAll();
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorbit.loadMoreCommits", () => {
      commitProvider.incrementLimit();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorbit.showWelcome", () => {
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
      syncInterval = setInterval(async () => {
        try {
          await gitService.fetch();
          refreshAll();
        } catch (e) {
          console.error("Auto-sync failed", e);
        }
      }, intervalMins * 60 * 1000);
    }
  };

  setupAutoSync();
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("gitorbit.sync.autoSyncInterval")) {
      setupAutoSync();
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("gitorbit.openSettings", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:selcuksarikoz.gitorbit"
      );
    })
  );

  // Webview - Show on Update/Install
  WelcomeView.show(context);

  // Real-time Update: Watch .git/HEAD to detect external changes
  const gitPath =
    vscode.workspace.workspaceFolders?.[0].uri.fsPath + "/.git/HEAD";
  const watcher = vscode.workspace.createFileSystemWatcher("**/.git/HEAD");
  watcher.onDidChange(() => refreshAll());
  context.subscriptions.push(watcher);
}

export function deactivate() {}
