import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import { GitExecutor } from '../utils/GitExecutor';
import { clearMemoizedCache, memoize } from '../utils/Memoize';

export interface CommitInfo {
  hash: string;
  author_name: string;
  author_email: string;
  date: string;
  message: string;
  refs?: string;
}

/**
 * Singleton service class that handles all low-level Git operations.
 * Uses GitExecutor to run commands and Memoize to cache expensive calls.
 */
export class GitService {
  private static instance: GitService;
  public rootDir: string = '';
  public executor: GitExecutor | undefined;
  private _initializePromise: Promise<void> | undefined;

  /**
   * Clears the memoized cache for this instance.
   * Useful after operations that modify the git state (push, pull, commit, etc.).
   */
  public clearCache() {
    clearMemoizedCache(this);
  }

  private constructor() {
    this._initializePromise = this.initialize();
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

  private async _ensureInitialized() {
    return this._initializePromise;
  }

  private async initialize() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      // Start with workspace root
      this.rootDir = workspaceRoot;
      this.executor = new GitExecutor(this.rootDir);

      try {
        // Try to find the actual git root
        const result = await this.executor.exec(['rev-parse', '--show-toplevel']);
        if (result.stdout) {
          this.rootDir = result.stdout.trim();
          this.executor = new GitExecutor(this.rootDir);
        }
      } catch (e) {
        // Not a git repo or other error, stick with workspace root
      }
    }
  }

  public getRelativePath(inputPath: string | undefined): string {
    if (!inputPath) return '';

    const root = this.rootDir || (vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '');
    let normalizedInput = inputPath.replace(/\\/g, '/');
    const normalizedRoot = root.replace(/\\/g, '/');

    if (normalizedRoot && normalizedInput.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
      normalizedInput = normalizedInput.substring(normalizedRoot.length);
    }

    // Aggressively strip any leading slashes
    while (normalizedInput.startsWith('/')) {
      normalizedInput = normalizedInput.substring(1);
    }

    return normalizedInput;
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
    await this._ensureInitialized();
    if (!this.executor) return { all: [], current: '', currentUpstream: '' };

    const result = await this.executor.exec(['branch', '-a', '--format=%(refname)']);
    const lines = result.stdout.trim().split('\n');

    const all: string[] = [];
    let current = '';

    lines.forEach((ref) => {
      if (ref.startsWith('refs/heads/')) {
        const name = ref.replace('refs/heads/', '');
        all.push(name);
      } else if (ref.startsWith('refs/remotes/')) {
        // Keep as it was for our tree provider logic which expects "remotes/..."
        all.push(ref.replace('refs/', ''));
      }
    });

    const currentResult = await this.executor.exec(['branch', '--show-current']);
    current = currentResult.stdout.trim();

    let currentUpstream = '';
    try {
      const upstreamResult = await this.executor.exec(['rev-parse', '--abbrev-ref', '@{u}']);
      currentUpstream = upstreamResult.stdout.trim();
    } catch (e) {
      // No upstream configured
    }

    return { all, current, currentUpstream };
  }

  public async findMainBranch(): Promise<string> {
    const branches = await this.getBranches();
    const candidates = ['main', 'master', 'develop', 'dev'];
    for (const c of candidates) {
      if (branches.all.includes(c)) return c;
    }
    return branches.all.length > 0 ? branches.all[0] : '';
  }

  private parseLogOutput(output: string): CommitInfo[] {
    return output
      .split('--END--\n')
      .filter(Boolean)
      .map((block) => {
        const lines = block.trim().split('\n');
        return {
          hash: lines[0],
          author_name: lines[1],
          author_email: lines[2],
          date: lines[3],
          message: lines[4],
          refs: lines[5] || '',
        };
      });
  }

  /**
   * Retrieves the commit log.
   */
  @memoize
  public async getLog(limit: number = 20, filePath?: string) {
    await this._ensureInitialized();
    if (!this.executor) return { all: [] };

    const args = ['log', `-n${limit}`, '--pretty=format:%H%n%an%n%ae%n%ad%n%s%n--END--'];
    if (filePath) {
      args.push('--', this.getRelativePath(filePath));
    }

    const result = await this.executor.exec(args);
    return { all: this.parseLogOutput(result.stdout) };
  }

  /**
   * Retrieves the current commit list for the explorer.
   */
  @memoize
  public async getCommits(limit: number = 50) {
    await this._ensureInitialized();
    if (!this.executor) return { all: [] };

    const args = ['log', `-n${limit}`, '--pretty=format:%H%n%an%n%ae%n%ad%n%s%n--END--'];
    const result = await this.executor.exec(args);
    return { all: this.parseLogOutput(result.stdout) };
  }

  /**
   * Retrieves the list of stash entries.
   */
  @memoize
  public async getStashes() {
    await this._ensureInitialized();
    if (!this.executor) return { all: [] };
    const result = await this.executor.exec(['stash', 'list']);
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const stashes = lines.map((line, index) => ({
      message: line,
      index,
    }));
    return { all: stashes };
  }

  public async getStashFiles(index: number): Promise<string[]> {
    await this._ensureInitialized();
    if (!this.executor) return [];
    const result = await this.executor.exec([
      'stash',
      'show',
      '--name-only',
      '-u',
      `stash@{${index}}`,
    ]);
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  public async stashSave(message?: string, includeUntracked: boolean = false) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const args = ['stash', 'push'];
    if (includeUntracked) args.push('-u');
    if (message) args.push('-m', message);

    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  private async execStashCommand(command: 'apply' | 'drop' | 'pop', index: number) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const result = await this.executor.exec(['stash', command, `stash@{${index}}`]);
    this.clearCache();
    return result;
  }

  public async stashApply(index: number) {
    return this.execStashCommand('apply', index);
  }

  public async stashDrop(index: number) {
    return this.execStashCommand('drop', index);
  }

  public async stashPop(index: number) {
    return this.execStashCommand('pop', index);
  }

  public async checkout(branchName: string) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const result = await this.executor.exec(['checkout', branchName]);
    this.clearCache();
    return result;
  }

  public async createBranch(branchName: string, startPoint?: string) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const args = ['checkout', '-b', branchName];
    if (startPoint) {
      args.push(startPoint);
    }
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async commit(options: string[] = []) {
    await this._ensureInitialized();
    if (!this.executor) return;
    try {
      const result = await this.executor.exec(['commit', ...options]);
      this.clearCache();
      return result;
    } catch (error: any) {
      throw new Error(`Commit failed: ${error.message}`);
    }
  }

  @memoize
  public async getStatus() {
    await this._ensureInitialized();
    if (!this.executor) return [];
    try {
      const result = await this.executor.exec(['status', '--porcelain', '-z', '-u']);
      const stdout = result.stdout;
      const entries = [];
      const parts = stdout.split('\0');

      for (let i = 0; i < parts.length; i++) {
        const line = parts[i];
        if (!line) continue;

        const stagedStatus = line.substring(0, 1);
        const workingTreeStatus = line.substring(1, 2);

        // In -z format, the path starts at index 2.
        // Some git versions/configs might add a space, so we handle it.
        let path = line.substring(2);
        if (path.startsWith(' ')) {
          path = path.substring(1);
        }

        if (stagedStatus === 'R') {
          i++; // Skip original path
        }

        entries.push({ stagedStatus, workingTreeStatus, path });
      }
      return entries;
    } catch (error: any) {
      return [];
    }
  }

  public async stage(path: string) {
    await this._ensureInitialized();
    if (!this.executor) return;
    await this.executor.exec(['add', this.getRelativePath(path)]);
    this.clearCache();
  }

  public async unstage(path: string) {
    await this._ensureInitialized();
    if (!this.executor) return;
    await this.executor.exec(['restore', '--staged', this.getRelativePath(path)]);
    this.clearCache();
  }

  public async stageAll() {
    await this._ensureInitialized();
    if (!this.executor) return;
    await this.executor.exec(['add', '.']);
    this.clearCache();
  }

  public async unstageAll() {
    await this._ensureInitialized();
    if (!this.executor) return;
    await this.executor.exec(['restore', '--staged', '.']);
    this.clearCache();
  }

  public async skipCherryPick() {
    await this._ensureInitialized();
    if (!this.executor) return;
    const result = await this.executor.exec(['cherry-pick', '--skip']);
    this.clearCache();
    return result;
  }

  public async cherryPick(commitHash: string, options: string[] = []) {
    await this._ensureInitialized();
    if (!this.executor) return;
    try {
      const result = await this.executor.exec(['cherry-pick', ...options, commitHash]);
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
    await this._ensureInitialized();
    if (!this.executor) return '';
    const result = await this.executor.exec([
      'blame',
      '--line-porcelain',
      this.getRelativePath(filePath),
    ]);
    return result.stdout;
  }

  public async push(remote: string = 'origin', branch?: string, setUpstream: boolean = false) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const args = ['push', remote];
    if (setUpstream) {
      args.push('-u');
    }
    if (branch) {
      args.push(branch);
    }
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async pull(remote: string = 'origin', branch?: string) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const args = ['pull', remote];
    if (branch) {
      args.push(branch);
    }
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async fetch(remote: string = 'origin') {
    await this._ensureInitialized();
    if (!this.executor) return;
    const result = await this.executor.exec(['fetch', '--prune', remote]);
    this.clearCache();
    return result;
  }

  public async updateLocalBranchFromRemote(branch: string, remote: string = 'origin') {
    await this._ensureInitialized();
    if (!this.executor) return;
    await this.executor.exec(['fetch', remote, branch]);
    try {
      await this.executor.exec(['fetch', remote, `${branch}:${branch}`]);
    } catch (e) {
      throw new Error('Cannot update branch safely (non-fast-forward). Please checkout and pull.');
    }
    this.clearCache();
  }

  @memoize
  public async getBranchStatus(
    branchName: string
  ): Promise<{ ahead: number; behind: number; isGone: boolean }> {
    await this._ensureInitialized();
    if (!this.executor) return { ahead: 0, behind: 0, isGone: false };
    try {
      // Use branch --format to get upstream and track status (including [gone])
      const result = await this.executor.exec([
        'branch',
        '--list',
        branchName,
        '--format=%(upstream:track)',
      ]);
      const output = result.stdout.trim();
      const isGone = output.includes('[gone]');

      const upstreamResult = await this.executor.exec([
        'rev-parse',
        '--abbrev-ref',
        `${branchName}@{u}`,
      ]);
      const upstream = upstreamResult.stdout.trim();
      if (!upstream) return { ahead: 0, behind: 0, isGone };

      const listResult = await this.executor.exec([
        'rev-list',
        '--left-right',
        '--count',
        `${branchName}...${upstream}`,
      ]);
      const counts = listResult.stdout.trim().split(/\s+/).map(Number);
      return { ahead: counts[0] || 0, behind: counts[1] || 0, isGone };
    } catch {
      return { ahead: 0, behind: 0, isGone: false };
    }
  }

  public async showFileContent(hash: string, filePath: string): Promise<string> {
    await this._ensureInitialized();
    if (!this.executor) return '';
    const relativePath = this.getRelativePath(filePath);
    const args = ['show', `${hash}:${relativePath}`];
    try {
      const result = await this.executor.exec(args);
      return result.stdout;
    } catch {
      return '';
    }
  }

  public async showFileContentRaw(ref: string): Promise<string> {
    await this._ensureInitialized();
    if (!this.executor) return '';
    try {
      const result = await this.executor.exec(['show', ref]);
      return result.stdout;
    } catch {
      return '';
    }
  }

  @memoize
  public async getAllLog(limit: number = 50) {
    await this._ensureInitialized();
    if (!this.executor) return { all: [] };

    const args = [
      'log',
      '--all',
      `-n${limit}`,
      '--pretty=format:%H%n%an%n%ae%n%ad%n%s%n%d%n--END--',
    ];

    const result = await this.executor.exec(args);
    // getAllLog has an extra field 'refs', but parseLogOutput handles the 6th line gracefully as standard Log doesn't have it.
    // However, the standard format in getLog is 5 lines + END.
    // getAllLog format is 6 lines + END.
    return { all: this.parseLogOutput(result.stdout) };
  }

  @memoize
  public async getCommitStats(hash: string) {
    await this._ensureInitialized();
    if (!this.executor) return '';
    const result = await this.executor.exec(['show', '--stat', '--format=%b', hash]);
    return result.stdout.trim();
  }

  @memoize
  public async getChangedFilesWithStatus(
    hash: string
  ): Promise<{ path: string; status: string }[]> {
    await this._ensureInitialized();
    if (!this.executor) return [];

    if (hash.startsWith('stash@')) {
      try {
        const result = await this.executor.exec(['stash', 'show', '--name-status', '-u', hash]);
        return result.stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const parts = line.trim().split(/\s+/);
            const status = parts[0];
            const path = parts.slice(1).join(' ');
            return { path, status };
          });
      } catch (e) {
        return [];
      }
    }

    const result = await this.executor.exec([
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '-r',
      hash,
    ]);
    return result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, path] = line.split(/\s+/);
        return { path, status };
      });
  }

  @memoize
  public async getChangedFiles(hash: string): Promise<string[]> {
    await this._ensureInitialized();
    if (!this.executor) return [];
    const result = await this.executor.exec(['show', '--name-only', '--format=', hash]);
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  public async getCommitFullDiff(hash: string): Promise<string> {
    await this._ensureInitialized();
    if (!this.executor) return '';
    const result = await this.executor.exec(['show', hash]);
    return result.stdout;
  }

  @memoize
  public async getDiff(
    hash: string,
    filePath?: string,
    compareWithParent: boolean = false
  ): Promise<string> {
    await this._ensureInitialized();
    if (!this.executor) return '';
    const target = compareWithParent ? `${hash}^..${hash}` : hash;
    const args = ['show', '--format=', target];
    if (filePath) {
      args.push('--', this.getRelativePath(filePath));
    }
    const result = await this.executor.exec(args);
    return result.stdout;
  }

  public async getStagedDiff(): Promise<string> {
    await this._ensureInitialized();
    if (!this.executor) return '';
    const result = await this.executor.exec(['diff', '--staged']);
    return result.stdout;
  }

  public async getWorkingDiff(): Promise<string> {
    await this._ensureInitialized();
    if (!this.executor) return '';
    const result = await this.executor.exec(['diff']);
    return result.stdout;
  }

  /**
   * Get a truncated diff suitable for AI commit message generation.
   * Includes stat summary and limited diff content per file.
   */
  public async getTruncatedDiff(staged: boolean, maxChars: number = 4000): Promise<string> {
    await this._ensureInitialized();
    if (!this.executor) return '';

    const diffArg = staged ? ['diff', '--staged'] : ['diff'];

    // Get stat summary first
    const statResult = await this.executor.exec([...diffArg, '--stat']);
    const stat = statResult.stdout;

    // Get full diff
    const diffResult = await this.executor.exec(diffArg);
    let diff = diffResult.stdout;

    // If diff is small enough, return as-is with stat
    if (diff.length <= maxChars) {
      return diff;
    }

    // Truncate intelligently: keep file headers and limit content per file
    const lines = diff.split('\n');
    const truncatedLines: string[] = [];
    let currentFileLines = 0;
    const maxLinesPerFile = 30;
    let totalChars = 0;

    for (const line of lines) {
      // File header - always include
      if (
        line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('---') ||
        line.startsWith('+++')
      ) {
        truncatedLines.push(line);
        currentFileLines = 0;
        totalChars += line.length + 1;
        continue;
      }

      // Hunk header - always include
      if (line.startsWith('@@')) {
        truncatedLines.push(line);
        currentFileLines = 0;
        totalChars += line.length + 1;
        continue;
      }

      // Content lines - limit per file
      if (currentFileLines < maxLinesPerFile && totalChars < maxChars) {
        truncatedLines.push(line);
        currentFileLines++;
        totalChars += line.length + 1;
      } else if (currentFileLines === maxLinesPerFile) {
        truncatedLines.push('... (truncated)');
        currentFileLines++;
        totalChars += 20;
      }
    }

    return `${stat}\n${truncatedLines.join('\n')}`;
  }

  public async getUntrackedDiff(): Promise<string> {
    await this._ensureInitialized();
    if (!this.executor) return '';

    const status = await this.getStatus();
    const untracked = status.filter((s) => s.workingTreeStatus === '?' || s.stagedStatus === '?');

    let diff = '';
    for (const file of untracked) {
      try {
        const content = await vscode.workspace.fs.readFile(
          vscode.Uri.file(path.join(this.rootDir, file.path))
        );
        const text = Buffer.from(content).toString('utf-8');
        diff += `\n--- /dev/null\n+++ b/${file.path}\n@@ -0,0 +1,${text.split('\n').length} @@\n`;
        diff +=
          text
            .split('\n')
            .map((l) => '+' + l)
            .join('\n') + '\n';
      } catch (e) {
        // Skip files that can't be read (e.g. binary or locked)
      }
    }
    return diff;
  }

  public async deleteBranch(branchName: string, force: boolean = false) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const args = ['branch', force ? '-D' : '-d', branchName];
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async undoCommit() {
    await this._ensureInitialized();
    if (!this.executor) return;
    const result = await this.executor.exec(['reset', '--soft', 'HEAD~1']);
    this.clearCache();
    return result;
  }

  public async abortRebase() {
    await this._ensureInitialized();
    if (!this.executor) return;
    const result = await this.executor.exec(['rebase', '--abort']);
    this.clearCache();
    return result;
  }

  public async abortMerge() {
    await this._ensureInitialized();
    if (!this.executor) return;
    const result = await this.executor.exec(['merge', '--abort']);
    this.clearCache();
    return result;
  }

  public async discardAllChanges() {
    await this._ensureInitialized();
    if (!this.executor) return;
    // Discard unstaged changes only (keep staged intact)
    await this.executor.exec(['checkout', '--', '.']);
    // Remove untracked files and directories
    await this.executor.exec(['clean', '-fd']);
    this.clearCache();
  }

  public async discardChanges(filePath: string) {
    await this._ensureInitialized();
    if (!this.executor) return;
    try {
      // Unstage first just in case?
      // No, "Discard Changes" usually targets working tree.
      // If user wants to discard staged, they unstage first.
      await this.executor.exec(['restore', this.getRelativePath(filePath)]);
    } catch (e) {
      // Fallback for older git or other issues
      await this.executor.exec(['checkout', '--', this.getRelativePath(filePath)]);
    }
    this.clearCache();
  }

  public async reset(mode: 'soft' | 'mixed' | 'hard', target: string) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const result = await this.executor.exec(['reset', `--${mode}`, target]);
    this.clearCache();
    return result;
  }

  public async revert(commitHash: string) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const result = await this.executor.exec(['revert', '--no-edit', commitHash]);
    this.clearCache();
    return result;
  }

  public async createTag(tagName: string, target?: string) {
    await this._ensureInitialized();
    if (!this.executor) return;
    const args = ['tag', tagName];
    if (target) args.push(target);
    const result = await this.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async getRemoteUrl(): Promise<string> {
    await this._ensureInitialized();
    if (!this.executor) return '';
    try {
      const result = await this.executor.exec(['remote', 'get-url', 'origin']);
      return result.stdout.trim();
    } catch {
      return '';
    }
  }

  @memoize
  public async getCommitDetails(hash: string) {
    await this._ensureInitialized();
    if (!this.executor) return { message: '', author: '', date: '' };
    const result = await this.executor.exec([
      'show',
      '--format=%an%n%ae%n%ad%n%B',
      '--no-patch',
      hash,
    ]);
    const lines = result.stdout.split('\n');
    return {
      author: lines[0],
      email: lines[1],
      date: lines[2],
      message: lines.slice(3).join('\n').trim(),
    };
  }
}
