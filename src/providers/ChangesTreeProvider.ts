import * as vscode from "vscode";
import * as path from "path";
import { GitService } from "../services/GitService";
import { GitContentProvider } from "./GitContentProvider";
import { StatusDecorationProvider } from "./StatusDecorationProvider";
import { AIService } from "../services/AIService";

class ChangeItem extends vscode.TreeItem {
  constructor(
    public readonly path: string,
    public readonly status: string,
    public readonly isStaged: boolean,
    public readonly rootPath: string
  ) {
    // No more StatusDecorationProvider.getUri calls

    const label = path.split("/").pop() || path;
    super(status === "D" ? ChangeItem.toStrikethrough(label) : label);

    this.resourceUri = vscode.Uri.file(
      vscode.Uri.joinPath(vscode.Uri.file(rootPath), path).fsPath
    );

    this.tooltip = `${path} • ${
      status === "A" ? "A" : status === "M" ? "M" : status === "D" ? "D" : "U"
    }`;

    this.description = path.includes("/")
      ? path.substring(0, path.lastIndexOf("/"))
      : "";

    this.command = {
      command: "gitorbit.changes.openDiff",
      title: "Open Diff",
      arguments: [this],
    };

    // Use Context Value for inline actions (Stage/Unstage)
    if (isStaged) {
      this.contextValue = "stagedChange";
    } else {
      this.contextValue = status === "D" ? "change_deleted" : "change";
    }
  }

  static toStrikethrough(text: string): string {
    return text
      .split("")
      .map((char) => char + "\u0336")
      .join("");
  }
}

class GroupItem extends vscode.TreeItem {
  constructor(label: string, count: number, contextValue: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `(${count})`;
    this.contextValue = contextValue;
  }
}

export class ChangesTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private _staged: any[] = [];
  private _unstaged: any[] = [];
  private _refreshTimer: NodeJS.Timeout | undefined;

  public get stagedCount(): number {
    return this._staged.length;
  }

  public get unstagedCount(): number {
    return this._unstaged.length;
  }

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.startWatchers();
  }

  private startWatchers() {
    const debouncedRefresh = () => {
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => {
        this.refresh();
      }, 500); // Increased debounce to 500ms
    };

    // Note: .git/index changes are handled by the global watcher in extension.ts calling refresh()

    // Watch for workspace file changes (Unstaged changes)
    const workspaceWatcher = vscode.workspace.createFileSystemWatcher("**/*");

    const shouldRefresh = (uri: vscode.Uri) => {
      const path = uri.fsPath;

      // Hardcoded exclusions (always critical)
      if (path.includes("/.git/") || path.includes("\\.git\\")) return false;
      if (path.includes("/node_modules/") || path.includes("\\node_modules\\"))
        return false;

      // Check vscode settings for exclusions
      const config = vscode.workspace.getConfiguration();
      const filesExclude =
        config.get<{ [key: string]: boolean }>("files.exclude") || {};
      const searchExclude =
        config.get<{ [key: string]: boolean }>("search.exclude") || {};
      const allExcludes = { ...filesExclude, ...searchExclude };

      for (const [pattern, enabled] of Object.entries(allExcludes)) {
        if (enabled) {
          // Simple Glob Matching:
          // 1. Remove leading/trailing syntax for simple checks
          const cleanPattern = pattern
            .replace(/^\*\*\//, "")
            .replace(/\/$/, "");

          // Directory match inside path
          if (pattern.endsWith("/") || pattern.includes("/")) {
            if (path.includes(cleanPattern)) return false;
          }
          // Extension match
          else if (pattern.startsWith("*.")) {
            if (path.endsWith(pattern.substring(1))) return false;
          }
          // Exact name match (file or folder)
          else {
            if (
              path.includes(`/${cleanPattern}`) ||
              path.includes(`\\${cleanPattern}`)
            )
              return false;
          }
        }
      }

      return true;
    };

    const handleEvent = (uri: vscode.Uri) => {
      if (shouldRefresh(uri)) debouncedRefresh();
    };

    workspaceWatcher.onDidChange(handleEvent);
    workspaceWatcher.onDidCreate(handleEvent);
    workspaceWatcher.onDidDelete(handleEvent);

    // Initial refresh
    this.refresh();
  }

  async refresh() {
    const gitService = GitService.getInstance();
    gitService.clearCache();

    // Pre-calculate counts for badge and UI
    const status = await gitService.getStatus();
    this._staged = status.filter(
      (s) => s.stagedStatus !== " " && s.stagedStatus !== "?"
    );
    this._unstaged = status.filter(
      (s) => s.workingTreeStatus !== " " || s.stagedStatus === "?"
    );

    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const gitService = GitService.getInstance();

    if (!element) {
      // Root: Groups
      // Update Decorations
      const allStatus = [
        ...this._staged.map((s) => ({
          path: s.path,
          status: s.stagedStatus,
          rootDir: gitService.rootDir,
        })),
        ...this._unstaged.map((s) => ({
          path: s.path,
          status: s.workingTreeStatus === " " ? "?" : s.workingTreeStatus,
          rootDir: gitService.rootDir,
        })),
      ];
      StatusDecorationProvider.updateStatus(allStatus);
      new StatusDecorationProvider().fireUpdate();

      const items: GroupItem[] = [];
      if (this._staged.length > 0) {
        items.push(
          new GroupItem("Staged Changes", this._staged.length, "stagedGroup")
        );
      }
      if (this._unstaged.length > 0) {
        items.push(
          new GroupItem("Changes", this._unstaged.length, "changesGroup")
        );
      }
      return items;
    }

    if (element instanceof GroupItem) {
      if (element.label === "Staged Changes") {
        return this._staged.map(
          (s) =>
            new ChangeItem(s.path, s.stagedStatus, true, gitService.rootDir)
        );
      } else {
        return this._unstaged.map(
          (s) =>
            new ChangeItem(
              s.path,
              s.workingTreeStatus !== " " ? s.workingTreeStatus : "?",
              false,
              gitService.rootDir
            )
        );
      }
    }

    return [];
  }

  // --- Commands ---

  public async commit(amend: boolean = false) {
    const gitService = GitService.getInstance();

    // Check if anything is staged
    const status = await gitService.getStatus();
    const staged = status.filter(
      (s) => s.stagedStatus !== " " && s.stagedStatus !== "?"
    );
    const unstaged = status.filter(
      (s) => s.workingTreeStatus !== " " || s.stagedStatus === "?"
    );

    // Auto-stage logic if nothing staged
    if (staged.length === 0 && !amend) {
      if (unstaged.length === 0) {
        vscode.window.showInformationMessage("No changes to commit.");
        return;
      }

      // Auto-stage: If nothing is staged, stage everything automatically without asking
      // This matches the user request "direk staged icine alsin"
      await gitService.stageAll();
    }

    const message = await vscode.window.showInputBox({
      placeHolder: "Commit message",
      prompt: amend ? "Enter commit message (Amend)" : "Enter commit message",
      ignoreFocusOut: true,
    });

    if (message === undefined) return; // Cancelled
    if (!message && !amend) {
      vscode.window.showErrorMessage("Commit message is required.");
      return;
    }

    try {
      const options = message ? ["-m", message] : [];
      if (amend) options.push("--amend");

      await gitService.commit(options);
      vscode.window.showInformationMessage("Commit successful!");
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Commit failed: ${e.message}`);
    }
  }

  public async openDiff(item: ChangeItem) {
    const gitService = GitService.getInstance();
    const relativePath = item.path;
    const uri = vscode.Uri.file(
      vscode.Uri.joinPath(vscode.Uri.file(gitService.rootDir), relativePath)
        .fsPath
    );

    try {
      if (item.isStaged) {
        // HEAD vs INDEX
        let headUri = GitContentProvider.getUri("HEAD", relativePath);
        let indexUri = GitContentProvider.getUri("INDEX", relativePath);

        if (item.status === "A") {
          headUri = GitContentProvider.getUri("EMPTY", relativePath);
        } else if (item.status === "D") {
          indexUri = GitContentProvider.getUri("EMPTY", relativePath);
        }

        await vscode.commands.executeCommand(
          "vscode.diff",
          headUri,
          indexUri,
          `${relativePath} (Staged)`
        );
      } else {
        // INDEX vs Working Tree
        if (item.status === "D") {
          // Deleted: Just open original
          const indexUri = GitContentProvider.getUri("INDEX", relativePath);
          await vscode.commands.executeCommand("vscode.open", indexUri, {
            preview: true,
            label: `${relativePath} (Deleted)`,
          });
          return;
        }

        let indexUri = GitContentProvider.getUri("INDEX", relativePath);
        let workingUri = uri;

        if (item.status === "?" || item.status === "U") {
          // Untracked: EMPTY vs Working Tree
          indexUri = GitContentProvider.getUri("EMPTY", relativePath);
        } else if (item.status === "A") {
          // Treat as Untracked
          indexUri = GitContentProvider.getUri("EMPTY", relativePath);
        }

        await vscode.commands.executeCommand(
          "vscode.diff",
          indexUri,
          workingUri,
          `${relativePath} (Changes)`
        );
      }
    } catch (e) {
      vscode.window.showErrorMessage("Could not open diff: " + e);
    }
  }

  public async stage(item: ChangeItem) {
    await GitService.getInstance().stage(item.path);
    this.refresh();
  }

  public async unstage(item: ChangeItem) {
    await GitService.getInstance().unstage(item.path);
    this.refresh();
  }

  public async stageAll() {
    await GitService.getInstance().stageAll();
    this.refresh();
  }

  public async unstageAll() {
    await GitService.getInstance().unstageAll();
    this.refresh();
  }

  public async commitStaged() {
    // Logic same as commit but ensure something is staged
    const gitService = GitService.getInstance();
    const status = await gitService.getStatus();
    const staged = status.filter(
      (s) => s.stagedStatus !== " " && s.stagedStatus !== "?"
    );
    if (staged.length === 0) {
      vscode.window.showInformationMessage("No staged changes to commit.");
      return;
    }
    this.commit();
  }

  public async undoCommit() {
    const gitService = GitService.getInstance();
    try {
      await gitService.undoCommit();
      vscode.window.showInformationMessage("Last commit undone (soft reset).");
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to undo commit: ${e.message}`);
    }
  }

  public async abortRebase() {
    const gitService = GitService.getInstance();
    try {
      await gitService.abortRebase();
      vscode.window.showInformationMessage("Rebase aborted.");
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to abort rebase: ${e.message}`);
    }
  }

  public async abortMerge() {
    const gitService = GitService.getInstance();
    try {
      await gitService.abortMerge();
      vscode.window.showInformationMessage("Merge aborted.");
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to abort merge: ${e.message}`);
    }
  }

  public async openFile(item: ChangeItem) {
    if (item.status === "D") {
      vscode.window.showWarningMessage("File is deleted.");
      return;
    }
    const gitService = GitService.getInstance();
    const uri = vscode.Uri.file(
      vscode.Uri.joinPath(vscode.Uri.file(gitService.rootDir), item.path).fsPath
    );
    try {
      await vscode.commands.executeCommand("vscode.open", uri);
    } catch (e: any) {
      vscode.window.showErrorMessage("Could not open file: " + e.message);
    }
  }

  public async discard(item: ChangeItem) {
    const gitService = GitService.getInstance();
    const confirm = await vscode.window.showWarningMessage(
      `Discard changes in ${item.label}?`,
      { modal: true },
      "Discard"
    );

    if (confirm !== "Discard") return;

    try {
      if (item.status === "?" || item.status === "U") {
        const uri = vscode.Uri.file(
          vscode.Uri.joinPath(vscode.Uri.file(gitService.rootDir), item.path)
            .fsPath
        );
        await vscode.workspace.fs.delete(uri, {
          recursive: true,
          useTrash: false,
        });
      } else {
        await gitService.discardChanges(item.path);
      }
      this.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to discard: ${e.message}`);
    }
  }

  public async discardAll() {
    const confirm = await vscode.window.showWarningMessage(
      "Are you sure you want to discard ALL changes? This cannot be undone.",
      { modal: true },
      "Discard All"
    );
    if (confirm === "Discard All") {
      await GitService.getInstance().discardAllChanges();
      this.refresh();
    }
  }

  public async sync() {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Syncing..." },
      async () => {
        await GitService.getInstance().pull();
        await GitService.getInstance().push();
        this.refresh();
      }
    );
  }

  public async push() {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Pushing..." },
      async () => {
        await GitService.getInstance().push();
        this.refresh();
      }
    );
  }

  public async openAllStaged() {
    const gitService = GitService.getInstance();
    const status = await gitService.getStatus();
    const staged = status.filter(
      (s) => s.stagedStatus !== " " && s.stagedStatus !== "?"
    );

    if (staged.length === 0) return;

    const resources = staged.map((s) => {
      // Original: HEAD (unless it's new 'A')
      const originalUri =
        s.stagedStatus === "A"
          ? undefined
          : GitContentProvider.getUri("HEAD", s.path);
      // Modified: INDEX (unless it's deleted 'D')
      const modifiedUri =
        s.stagedStatus === "D"
          ? undefined
          : GitContentProvider.getUri("INDEX", s.path);

      return {
        originalUri,
        modifiedUri,
        name: s.path,
        title: s.path,
      };
    });

    await vscode.commands.executeCommand("_workbench.openMultiDiffEditor", {
      title: "Staged Changes",
      resources,
    });
  }

  public async openAllChanges() {
    const gitService = GitService.getInstance();
    const status = await gitService.getStatus();
    const unstaged = status.filter(
      (s) => s.workingTreeStatus !== " " || s.stagedStatus === "?"
    );

    if (unstaged.length === 0) return;

    const resources = unstaged.map((s) => {
      // Original: INDEX (unless it's Untracked '?' or Added in working tree 'A'?? '?' usually means untracked)
      // If untracked, original is undefined.
      // If modified, original is INDEX.
      // If deleted, original is INDEX.
      const isUntracked = s.stagedStatus === "?" || s.workingTreeStatus === "?";
      const originalUri = isUntracked
        ? undefined
        : GitContentProvider.getUri("INDEX", s.path);

      // Modified: Working Tree (file://) - unless deleted
      const isDeleted = s.workingTreeStatus === "D";
      const modifiedUri = isDeleted
        ? undefined
        : vscode.Uri.file(path.join(gitService.rootDir, s.path));

      return {
        originalUri,
        modifiedUri,
        name: s.path,
        title: s.path,
      };
    });

    await vscode.commands.executeCommand("_workbench.openMultiDiffEditor", {
      title: "Changes",
      resources,
    });
  }

  public async pull() {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Pulling..." },
      async () => {
        await GitService.getInstance().pull();
        this.refresh();
      }
    );
  }
  public async smartCommit() {
    const gitService = GitService.getInstance();
    const aiService = AIService.getInstance();

    // 1. Determine what to diff
    const status = await gitService.getStatus();
    const staged = status.filter(
      (s) => s.stagedStatus !== " " && s.stagedStatus !== "?"
    );

    let hasStagedChanges = staged.length > 0;
    let diff = "";

    if (hasStagedChanges) {
      // Get staged diff
      diff = await gitService.getStagedDiff();
    } else {
      // Nothing staged, try regular diff of all tracked changes
      diff = await gitService.getWorkingDiff();

      // If still nothing, maybe untracked files?
      if (!diff) {
        // Auto-stage all to get a diff?
        vscode.window.showInformationMessage(
          "Staging all changes to generate commit message..."
        );
        await gitService.stageAll();
        diff = await gitService.getStagedDiff();
        hasStagedChanges = true;
      }
    }

    if (!diff) {
      vscode.window.showWarningMessage(
        "No changes found to generate commit message."
      );
      return;
    }

    // 2. Call AI
    if (!aiService.validateConfig()) return;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Generating Smart Commit Messages...",
          cancellable: false,
        },
        async () => {
          const messages = await aiService.generateCommitMessages(diff);

          // 3. Show Quick Pick
          const selected = await vscode.window.showQuickPick(messages, {
            placeHolder: "Select a commit message...",
            title: "Smart Commit Recommendations",
          });

          if (selected) {
            // 4. Allow editing the message
            const editedMessage = await vscode.window.showInputBox({
              value: selected,
              placeHolder: "Commit message",
              prompt: "Edit your commit message if needed",
              ignoreFocusOut: true,
            });

            if (editedMessage === undefined) return; // User cancelled editing

            if (!editedMessage) {
              vscode.window.showErrorMessage("Commit message cannot be empty.");
              return;
            }

            // 5. Commit
            // If we generated message from working diff (unstaged), we must stage now
            if (!hasStagedChanges) {
              await gitService.stageAll();
            }
            await gitService.commit(["-m", editedMessage]);
            vscode.window.showInformationMessage("Smart Commit successful!");
            this.refresh();
          }
        }
      );
    } catch (e: any) {
      vscode.window.showErrorMessage(`Smart Commit failed: ${e.message}`);
    }
  }
}
