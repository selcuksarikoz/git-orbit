import * as vscode from "vscode";
import * as path from "path";
import { GitService } from "../services/GitService";
import { GitContentProvider } from "./GitContentProvider";
import { StatusDecorationProvider } from "./StatusDecorationProvider";

class ChangeItem extends vscode.TreeItem {
  constructor(
    public readonly path: string,
    public readonly status: string,
    public readonly isStaged: boolean,
    public readonly rootPath: string
  ) {
    super(path.split("/").pop() || path);

    this.resourceUri = vscode.Uri.file(
      vscode.Uri.joinPath(vscode.Uri.file(rootPath), path).fsPath
    );
    // Add status query for DecorationProvider
    this.resourceUri = StatusDecorationProvider.getUri(
      this.resourceUri.fsPath,
      status
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
    this.contextValue = isStaged ? "stagedChange" : "change";
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

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.startWatchers();
  }

  private startWatchers() {
    const debouncedRefresh = () => {
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => {
        this.refresh();
      }, 300);
    };

    const gitWatcher =
      vscode.workspace.createFileSystemWatcher("**/.git/index");
    gitWatcher.onDidChange(debouncedRefresh);
    gitWatcher.onDidCreate(debouncedRefresh);
    gitWatcher.onDidDelete(debouncedRefresh);

    const workspaceWatcher = vscode.workspace.createFileSystemWatcher("**/*");
    workspaceWatcher.onDidChange(debouncedRefresh);
    workspaceWatcher.onDidCreate(debouncedRefresh);
    workspaceWatcher.onDidDelete(debouncedRefresh);

    // Initial refresh
    this.refresh();
  }

  refresh() {
    GitService.getInstance().clearCache();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const gitService = GitService.getInstance();

    if (!element) {
      // Root: Groups
      const status = await gitService.getStatus();
      this._staged = status.filter(
        (s) => s.stagedStatus !== " " && s.stagedStatus !== "?"
      );
      this._unstaged = status.filter(
        (s) => s.workingTreeStatus !== " " || s.stagedStatus === "?"
      );

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

      const confirm = await vscode.window.showInformationMessage(
        "There are no staged changes. Would you like to stage all changes and commit?",
        "Yes",
        "No"
      );
      if (confirm !== "Yes") return;

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
        const headUri = GitContentProvider.getUri("HEAD", relativePath);
        const indexUri = GitContentProvider.getUri("INDEX", relativePath);
        await vscode.commands.executeCommand(
          "vscode.diff",
          headUri,
          indexUri,
          `${relativePath} (Staged)`
        );
      } else {
        // INDEX vs Working Tree
        const indexUri = GitContentProvider.getUri("INDEX", relativePath);
        await vscode.commands.executeCommand(
          "vscode.diff",
          indexUri,
          uri,
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
}
