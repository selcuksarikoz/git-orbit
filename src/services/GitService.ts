import * as vscode from "vscode";
import { GitExecutor } from "../utils/GitExecutor";

export class GitService {
  private static instance: GitService;
  private rootDir: string = "";
  private executor: GitExecutor | undefined;

  private constructor() {
    this.initialize();
  }

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

  public async getBranches() {
    if (!this.executor) return { all: [], current: "" };

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

    return { all, current };
  }

  public async findMainBranch(): Promise<string> {
    const branches = await this.getBranches();
    const candidates = ["main", "master", "develop", "dev"];
    for (const c of candidates) {
      if (branches.all.includes(c)) return c;
    }
    return branches.all.length > 0 ? branches.all[0] : "";
  }

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

  public async checkout(branchName: string) {
    if (!this.executor) return;
    return await this.executor.exec(["checkout", branchName]);
  }

  public async createBranch(branchName: string, startPoint?: string) {
    if (!this.executor) return;
    const args = ["checkout", "-b", branchName];
    if (startPoint) {
      args.push(startPoint);
    }
    return await this.executor.exec(args);
  }

  public async cherryPick(commitHash: string) {
    if (!this.executor) return;
    try {
      return await this.executor.exec(["cherry-pick", commitHash]);
    } catch (error: any) {
      throw new Error(`Cherry-pick failed: ${error.message}`);
    }
  }

  public async getFileHistory(filePath: string, limit: number = 20) {
    return this.getLog(limit, filePath);
  }

  public async getBlame(filePath: string) {
    if (!this.executor) return "";
    const result = await this.executor.exec([
      "blame",
      "--line-porcelain",
      filePath,
    ]);
    return result.stdout;
  }

  public async push(remote: string = "origin", branch?: string) {
    if (!this.executor) return;
    const args = ["push", remote];
    if (branch) {
      args.push(branch);
    }
    return await this.executor.exec(args);
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

  public async getChangedFilesWithStatus(
    hash: string
  ): Promise<{ path: string; status: string }[]> {
    if (!this.executor) return [];
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

  public async deleteBranch(branchName: string, force: boolean = false) {
    if (!this.executor) return;
    const args = ["branch", force ? "-D" : "-d", branchName];
    return await this.executor.exec(args);
  }

  public async deleteRemoteBranch(
    remote: string,
    branchName: string,
    force: boolean = false
  ) {
    if (!this.executor) return;
    // git push <remote> --delete <branch>
    const args = ["push", remote, "--delete", branchName];
    return await this.executor.exec(args);
  }
}
