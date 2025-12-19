import * as vscode from "vscode";
import { GitExecutor } from "../utils/GitExecutor";

import { clearMemoizedCache, memoize } from "../utils/Memoize";

/**
 * Singleton service class that handles all low-level Git operations.
 * Uses GitExecutor to run commands and Memoize to cache expensive calls.
 */
export class GitService {
  private static instance: GitService;
  private rootDir: string = "";
  private executor: GitExecutor | undefined;

  /**
   * Clears the memoized cache for this instance.
   * Useful after operations that modify the git state (push, pull, commit, etc.).
   */
  public clearCache() {
    clearMemoizedCache(this);
  }

  private constructor() {
    this.initialize();
  }

  /**
   * Returns the singleton instance of GitService.
   */
  public static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  private initialize() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.rootDir = workspaceFolders[0].uri.fsPath;
      this.executor = new GitExecutor(this.rootDir);
    }
  }

  public getRelativePath(absolutePath: string): string {
    if (!this.rootDir) return absolutePath;
    return absolutePath.replace(this.rootDir, "").replace(/^[\\\/]/, "");
  }

  public isInitialized(): boolean {
    return !!this.executor;
  }

  /**
   * Retrieves all local and remote branches.
   * Also identifies the current branch and its upstream status.
   * @returns Object containing all branches list, current branch name, and current upstream name.
   */
  @memoize
  public async getBranches() {
    if (!this.executor) return { all: [], current: "", currentUpstream: "" };

    const result = await this.executor.exec([
      "branch",
      "-a",
      "--format=%(refname)",
    ]);
    const lines = result.stdout.trim().split("\n");

    const all: string[] = [];
    let current = "";

    lines.forEach((ref) => {
      if (ref.startsWith("refs/heads/")) {
        const name = ref.replace("refs/heads/", "");
        all.push(name);
      } else if (ref.startsWith("refs/remotes/")) {
        // Keep as it was for our tree provider logic which expects "remotes/..."
        all.push(ref.replace("refs/", ""));
      }
    });

    const currentResult = await this.executor.exec([
      "branch",
      "--show-current",
    ]);
    current = currentResult.stdout.trim();

    current = currentResult.stdout.trim();

    let currentUpstream = "";
    try {
      const upstreamResult = await this.executor.exec([
        "rev-parse",
        "--abbrev-ref",
        "@{u}",
      ]);
      currentUpstream = upstreamResult.stdout.trim();
      // upstream usually comes as "origin/main", but our list has "remotes/origin/main"
      // Let's normalize to match "remotes/..." format if possible, or just keep as is and handle in provider.
      // The provider expects "remotes/origin/main".
      // "git rev-parse --abbrev-ref @{u}" gives "origin/main".
    } catch (e) {
      // No upstream configured
    }

    return { all, current, currentUpstream };
  }

  public async findMainBranch(): Promise<string> {
    const branches = await this.getBranches();
    const candidates = ["main", "master", "develop", "dev"];
    for (const c of candidates) {
      if (branches.all.includes(c)) return c;
    }
    return branches.all.length > 0 ? branches.all[0] : "";
  }

  /**
   * Retrieves the commit log.
   * @param limit - Number of commits to retrieve.
   * @param filePath - Optional file path to filter log by file.
   */
  @memoize
  public async getLog(limit: number = 20, filePath?: string) {
    if (!this.executor) return { all: [] };

    const args = [
      "log",
      `-n${limit}`,
      "--pretty=format:%H%n%an%n%ae%n%ad%n%s%n--END--",
    ];
    if (filePath) {
      args.push("--", filePath);
    }

    const result = await this.executor.exec(args);
    const commits = result.stdout
      .split("--END--\n")
      .filter(Boolean)
      .map((block) => {
        const lines = block.trim().split("\n");
        return {
          hash: lines[0],
          author_name: lines[1],
          author_email: lines[2],
          date: lines[3],
          message: lines[4],
        };
      });

    return { all: commits };
  }

  /**
   * Retrieves the list of stash entries.
   */
  @memoize
  public async getStashes() {
    if (!this.executor) return { all: [] };
    const result = await this.executor.exec(["stash", "list"]);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const stashes = lines.map((line, index) => ({
      message: line,
      index,
    }));
    return { all: stashes };
  }

  /**
   * Retrieves the list of files changed in a specific stash.
   * @param index - The stash index (e.g., 0 for stash@{0}).
   */
  public async getStashFiles(index: number): Promise<string[]> {
    if (!this.executor) return [];
    // git stash show --name-only -u stash@{n}
    const result = await this.executor.exec([
      "stash",
      "show",
      "--name-only",
      "-u",
      `stash@{${index}}`,
    ]);
    return result.stdout.trim().split("\n").filter(Boolean);
  }

  /**
   * Saves current changes to stash.
   * @param message - Optional message for the stash.
   * @param includeUntracked - Whether to include untracked files.
   */
  public async stashSave(message?: string, includeUntracked: boolean = false) {
    if (!this.executor) return;
    const args = ["stash", "push"];
    if (includeUntracked) args.push("-u");
    if (message) args.push("-m", message);

    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async stashApply(index: number) {
    if (!this.executor) return;
    const result = await this.executor.exec([
      "stash",
      "apply",
      `stash@{${index}}`,
    ]);
    this.clearCache();
    return result;
  }

  public async stashDrop(index: number) {
    if (!this.executor) return;
    const result = await this.executor.exec([
      "stash",
      "drop",
      `stash@{${index}}`,
    ]);
    this.clearCache();
    return result;
  }

  public async stashPop(index: number) {
    if (!this.executor) return;
    const result = await this.executor.exec([
      "stash",
      "pop",
      `stash@{${index}}`,
    ]);
    this.clearCache();
    return result;
  }

  public async checkout(branchName: string) {
    if (!this.executor) return;
    const result = await this.executor.exec(["checkout", branchName]);
    this.clearCache();
    return result;
  }

  public async createBranch(branchName: string, startPoint?: string) {
    if (!this.executor) return;
    const args = ["checkout", "-b", branchName];
    if (startPoint) {
      args.push(startPoint);
    }
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async cherryPick(commitHash: string) {
    if (!this.executor) return;
    try {
      const result = await this.executor.exec(["cherry-pick", commitHash]);
      this.clearCache();
      return result;
    } catch (error: any) {
      throw new Error(`Cherry-pick failed: ${error.message}`);
    }
  }

  @memoize
  public async getFileHistory(filePath: string, limit: number = 20) {
    return this.getLog(limit, filePath);
  }

  @memoize
  public async getBlame(filePath: string) {
    if (!this.executor) return "";
    const result = await this.executor.exec([
      "blame",
      "--line-porcelain",
      filePath,
    ]);
    return result.stdout;
  }

  /**
   * Pushes changes to the remote repository.
   * Clears cache after operation.
   * @param remote - Remote name (default: origin).
   * @param branch - Optional branch name.
   */
  public async push(remote: string = "origin", branch?: string) {
    if (!this.executor) return;
    const args = ["push", remote];
    if (branch) {
      args.push(branch);
    }
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  /**
   * Pulls changes from the remote repository.
   * Clears cache after operation.
   * @param remote - Remote name (default: origin).
   * @param branch - Optional branch name.
   */
  public async pull(remote: string = "origin", branch?: string) {
    if (!this.executor) return;
    const args = ["pull", remote];
    if (branch) {
      args.push(branch);
    }
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  /**
   * Updates a local branch from its remote counterpart without checking it out.
   * Uses valid fast-forward fetch logic.
   * Throws error if update is not safe (non-fast-forward).
   * @param branch - The branch name to update.
   * @param remote - The remote name.
   */
  public async updateLocalBranchFromRemote(
    branch: string,
    remote: string = "origin"
  ) {
    // Fetch the specific branch to update remote tracking
    await this.executor?.exec(["fetch", remote, branch]);

    // Check if we can fast-forward the local branch to match remote
    // git fetch origin branch:branch
    try {
      await this.executor?.exec(["fetch", remote, `${branch}:${branch}`]);
    } catch (e) {
      throw new Error(
        "Cannot update branch safely (non-fast-forward). Please checkout and pull."
      );
    }
    this.clearCache();
  }

  /**
   * Fetches latest changes from remote and prunes deleted branches.
   * @param remote - Remote name.
   */
  public async fetch(remote: string = "origin") {
    if (!this.executor) return;
    const result = await this.executor.exec(["fetch", "--prune", remote]);
    this.clearCache();
    return result;
  }

  /**
   * Calculates how many commits ahead and behind a branch is relative to its upstream.
   * @param branchName - The local branch name.
   */
  @memoize
  public async getBranchStatus(
    branchName: string
  ): Promise<{ ahead: number; behind: number }> {
    if (!this.executor) return { ahead: 0, behind: 0 };
    try {
      // Get the upstream branch
      const upstreamResult = await this.executor.exec([
        "rev-parse",
        "--abbrev-ref",
        `${branchName}@{u}`,
      ]);
      const upstream = upstreamResult.stdout.trim();

      if (!upstream) return { ahead: 0, behind: 0 };

      const result = await this.executor.exec([
        "rev-list",
        "--left-right",
        "--count",
        `${branchName}...${upstream}`,
      ]);
      const counts = result.stdout.trim().split(/\s+/).map(Number);
      return { ahead: counts[0] || 0, behind: counts[1] || 0 };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  public async showFileContent(
    hash: string,
    filePath: string
  ): Promise<string> {
    if (!this.executor) return "";
    const relativePath = this.getRelativePath(filePath);
    const args = ["show", `${hash}:${relativePath}`];
    try {
      const result = await this.executor.exec(args);
      return result.stdout;
    } catch {
      // If we are looking for parent of root commit, or file didn't exist
      return "";
    }
  }

  @memoize
  public async getAllLog(limit: number = 50) {
    if (!this.executor) return { all: [] };

    // --all to get all branches, %d to see branch decorations
    const args = [
      "log",
      "--all",
      `-n${limit}`,
      "--pretty=format:%H%n%an%n%ae%n%ad%n%s%n%d%n--END--",
    ];

    const result = await this.executor.exec(args);
    const commits = result.stdout
      .split("--END--\n")
      .filter(Boolean)
      .map((block) => {
        const lines = block.trim().split("\n");
        return {
          hash: lines[0],
          author_name: lines[1],
          author_email: lines[2],
          date: lines[3],
          message: lines[4],
          refs: lines[5] || "", // e.g. (HEAD -> main, origin/main)
        };
      });

    return { all: commits };
  }

  @memoize
  public async getCommitStats(hash: string) {
    if (!this.executor) return "";
    // git show --stat --oneline <hash>
    const result = await this.executor.exec([
      "show",
      "--stat",
      "--format=%b",
      hash,
    ]);
    return result.stdout.trim();
  }

  @memoize
  public async getChangedFilesWithStatus(
    hash: string
  ): Promise<{ path: string; status: string }[]> {
    if (!this.executor) return [];

    if (hash.startsWith("stash@")) {
      // git stash show --name-status -u <hash>
      try {
        const result = await this.executor.exec([
          "stash",
          "show",
          "--name-status",
          "-u",
          hash,
        ]);
        return result.stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            // Output format: Status   Path
            const parts = line.trim().split(/\s+/);
            const status = parts[0];
            const path = parts.slice(1).join(" ");
            return { path, status };
          });
      } catch (e) {
        console.error("Failed to get stash files:", e);
        return [];
      }
    }

    // git diff-tree --no-commit-id --name-status -r <hash>
    const result = await this.executor.exec([
      "diff-tree",
      "--no-commit-id",
      "--name-status",
      "-r",
      hash,
    ]);
    return result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [status, path] = line.split(/\s+/);
        return { path, status };
      });
  }

  @memoize
  public async getChangedFiles(hash: string): Promise<string[]> {
    if (!this.executor) return [];
    // git show --name-only --format= <hash>
    const result = await this.executor.exec([
      "show",
      "--name-only",
      "--format=",
      hash,
    ]);
    return result.stdout.trim().split("\n").filter(Boolean);
  }

  /**
   * Retrieves complete diff for a commit (git show <hash>).
   */
  public async getCommitFullDiff(hash: string): Promise<string> {
    if (!this.executor) return "";
    const result = await this.executor.exec(["show", hash]);
    return result.stdout;
  }

  @memoize
  public async getDiff(
    hash: string,
    filePath?: string,
    compareWithParent: boolean = false
  ): Promise<string> {
    if (!this.executor) return "";
    const target = compareWithParent ? `${hash}^..${hash}` : hash;
    const args = ["show", "--format=", target];
    if (filePath) {
      args.push("--", this.getRelativePath(filePath));
    }
    const result = await this.executor.exec(args);
    return result.stdout;
  }

  /**
   * Deletes a local branch.
   * @param branchName - Name of the branch to delete.
   * @param force - If true, uses -D (force delete), otherwise -d.
   */
  public async deleteBranch(branchName: string, force: boolean = false) {
    if (!this.executor) return;
    const args = ["branch", force ? "-D" : "-d", branchName];
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async deleteRemoteBranch(
    remote: string,
    branchName: string,
    force: boolean = false
  ) {
    if (!this.executor) return;
    // git push <remote> --delete <branch>
    const args = ["push", remote, "--delete", branchName];
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }
}
