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

export interface GitRepository {
  rootDir: string;
  executor: GitExecutor;
  remoteUrl?: string;
  isWorktree: boolean;
  worktreePath?: string;
  branch?: string;
}

/**
 * Multi-repository Git service.
 * Supports multiple git repositories in a single workspace.
 */
export class GitService {
  private static instance: GitService;
  private repositories: Map<string, GitRepository> = new Map();
  private _initializePromise: Promise<void> | undefined;

  // Selected repository state
  private _selectedRepo: GitRepository | undefined;
  private _onDidChangeSelectedRepo: vscode.EventEmitter<GitRepository | undefined> =
    new vscode.EventEmitter();
  readonly onDidChangeSelectedRepo: vscode.Event<GitRepository | undefined> =
    this._onDidChangeSelectedRepo.event;

  /**
   * Clear cache for all repositories.
   */
  public clearCache() {
    clearMemoizedCache(this);
  }

  private constructor() {
    this._initializePromise = this.initialize();
  }

  /**
   * Get instance.
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

  public async ensureInitialized(): Promise<void> {
    await this._ensureInitialized();
  }

  private async initialize() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    // Discover all git repositories in workspace
    for (const folder of workspaceFolders) {
      await this.discoverRepositories(folder.uri.fsPath);
    }

    // Discover worktrees for each discovered repository
    await this.discoverWorktrees();
  }

  /**
   * Discover worktrees for all known repositories.
   */
  private async discoverWorktrees(): Promise<void> {
    for (const repo of this.repositories.values()) {
      if (repo.isWorktree) continue;

      try {
        const result = await repo.executor.exec(['worktree', 'list', '--porcelain']);
        const entries = result.stdout.split('\n\n');

        for (const entry of entries) {
          if (!entry.trim()) continue;

          const lines = entry.split('\n');
          let worktreePath = '';
          let branch = '';
          let head = '';

          for (const line of lines) {
            if (line.startsWith('worktree ')) {
              worktreePath = line.replace('worktree ', '').trim();
            } else if (line.startsWith('HEAD ')) {
              head = line.replace('HEAD ', '').trim();
            } else if (line.startsWith('branch ')) {
              branch = line.replace('branch ', '').trim();
            }
          }

          if (worktreePath && worktreePath !== repo.rootDir) {
            const worktreeExecutor = new GitExecutor(worktreePath);
            const remoteResult = await worktreeExecutor
              .exec(['remote', 'get-url', 'origin'])
              .catch(() => ({ stdout: '' }));

            this.repositories.set(worktreePath, {
              rootDir: worktreePath,
              executor: worktreeExecutor,
              remoteUrl: remoteResult.stdout.trim() || undefined,
              isWorktree: true,
              worktreePath: worktreePath,
              branch: branch || head,
            });
          }
        }
      } catch (error) {
        console.error(`Failed to discover worktrees for ${repo.rootDir}:`, error);
      }
    }
  }

  /**
   * Recursively discover git repositories starting from a path.
   * Also searches inside existing git repos for nested repos.
   */
  private async discoverRepositories(startPath: string, maxDepth: number = 3): Promise<void> {
    if (maxDepth <= 0) return;

    // Check if current directory is a git repo
    const isGitRepo = await this.checkIsGitRepo(startPath);
    if (isGitRepo) {
      const repo = await this.createRepository(startPath);
      if (repo) {
        this.repositories.set(startPath, repo);
      }
      // Continue searching subdirectories even if this is a git repo
      // (for nested repos like itchy/itchySDK)
    }

    // Search subdirectories (but skip common non-repo folders)
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(startPath));
      const subdirs = entries
        .filter(([name, type]) => {
          if (type !== vscode.FileType.Directory) return false;
          // Skip common directories that shouldn't contain git repos
          const skipDirs = [
            'node_modules',
            '.git',
            'dist',
            'build',
            'out',
            '.vscode',
            '.idea',
            'vendor',
            '__pycache__',
          ];
          return !skipDirs.includes(name) && !name.startsWith('.');
        })
        .map(([name]) => path.join(startPath, name));

      for (const subdir of subdirs) {
        await this.discoverRepositories(subdir, maxDepth - 1);
      }
    } catch (e) {
      // Permission denied or other error, skip
    }
  }

  /**
   * Check if a directory is a git repository.
   */
  private async checkIsGitRepo(dir: string): Promise<boolean> {
    try {
      const gitDir = path.join(dir, '.git');
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(gitDir));
      return !!(stat.type & vscode.FileType.Directory);
    } catch {
      return false;
    }
  }

  /**
   * Create a GitRepository object for a given root directory.
   */
  private async createRepository(rootDir: string): Promise<GitRepository | null> {
    const executor = new GitExecutor(rootDir);

    try {
      // Verify it's a valid git repo and get the actual root
      const result = await executor.exec(['rev-parse', '--show-toplevel']);
      const actualRoot = result.stdout.trim();

      if (actualRoot && actualRoot !== rootDir) {
        // Use the actual git root (in case of worktrees or submodules)
        const actualExecutor = new GitExecutor(actualRoot);
        const remoteResult = await actualExecutor
          .exec(['remote', 'get-url', 'origin'])
          .catch(() => ({ stdout: '' }));
        return {
          rootDir: actualRoot,
          executor: actualExecutor,
          remoteUrl: remoteResult.stdout.trim() || undefined,
          isWorktree: false,
        };
      }

      const remoteResult = await executor
        .exec(['remote', 'get-url', 'origin'])
        .catch(() => ({ stdout: '' }));
      return {
        rootDir,
        executor,
        remoteUrl: remoteResult.stdout.trim() || undefined,
        isWorktree: false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Refresh repository list - call when new folders might be added.
   */
  public async refreshRepositories(): Promise<void> {
    this.repositories.clear();
    await this.initialize();
  }

  /**
   * Get all discovered repositories.
   */
  public getRepositories(): GitRepository[] {
    return Array.from(this.repositories.values());
  }

  /**
   * Get repository count.
   */
  public getRepositoryCount(): number {
    return this.repositories.size;
  }

  /**
   * Get all worktrees (excluding main repos).
   */
  public getWorktrees(): GitRepository[] {
    return Array.from(this.repositories.values()).filter((repo) => repo.isWorktree);
  }

  /**
   * Get all main repositories (not worktrees).
   */
  public getMainRepositories(): GitRepository[] {
    return Array.from(this.repositories.values()).filter((repo) => !repo.isWorktree);
  }

  /**
   * Get repository for a specific file path.
   * Returns the repository that contains this file.
   */
  public getRepositoryForPath(filePath: string): GitRepository | undefined {
    if (!filePath) return this.getDefaultRepository();

    const normalizedPath = filePath.replace(/\\/g, '/');

    // Find the most specific (longest) matching repository root
    let bestMatch: GitRepository | undefined;
    let bestMatchLength = 0;

    for (const [rootDir, repo] of this.repositories) {
      const normalizedRoot = rootDir.replace(/\\/g, '/');
      if (
        normalizedPath.toLowerCase().startsWith(normalizedRoot.toLowerCase() + '/') ||
        normalizedPath.toLowerCase() === normalizedRoot.toLowerCase()
      ) {
        if (normalizedRoot.length > bestMatchLength) {
          bestMatch = repo;
          bestMatchLength = normalizedRoot.length;
        }
      }
    }

    return bestMatch || this.getDefaultRepository();
  }

  /**
   * Get the selected repository, or default/first if none selected.
   */
  public getDefaultRepository(): GitRepository | undefined {
    if (this._selectedRepo) {
      // Verify selected repo still exists
      if (this.repositories.has(this._selectedRepo.rootDir)) {
        return this._selectedRepo;
      }
    }
    const repos = this.getRepositories();
    return repos[0];
  }

  /**
   * Get the currently selected repository.
   */
  public getSelectedRepository(): GitRepository | undefined {
    return this._selectedRepo;
  }

  /**
   * Set the selected repository.
   */
  public setSelectedRepository(repo: GitRepository | undefined) {
    this._selectedRepo = repo;
    this._onDidChangeSelectedRepo.fire(repo);
  }

  /**
   * Get primary root directory (for backwards compatibility).
   */
  public get rootDir(): string {
    const repo = this.getDefaultRepository();
    return repo?.rootDir || '';
  }

  /**
   * Get primary executor (for backwards compatibility).
   */
  public get executor(): GitExecutor | undefined {
    const repo = this.getDefaultRepository();
    return repo?.executor;
  }

  public getRelativePath(inputPath: string | undefined, repoRoot?: string): string {
    if (!inputPath) return '';

    const root =
      repoRoot || this.rootDir || (vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '');
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
    return this.repositories.size > 0;
  }

  /**
   * Get branches for a specific repository or default.
   */
  @memoize
  public async getBranches(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return { all: [], current: '', currentUpstream: '' };

    const result = await targetRepo.executor.exec(['branch', '-a', '--format=%(refname)']);
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

    const currentResult = await targetRepo.executor.exec(['branch', '--show-current']);
    current = currentResult.stdout.trim();

    let currentUpstream = '';
    try {
      const upstreamResult = await targetRepo.executor.exec(['rev-parse', '--abbrev-ref', '@{u}']);
      currentUpstream = upstreamResult.stdout.trim();
    } catch (e) {
      // No upstream configured
    }

    return { all, current, currentUpstream };
  }

  /**
   * Aggregate branches from all repositories.
   */
  public async getAllBranches() {
    await this._ensureInitialized();
    const allBranches = new Map<string, { repo: GitRepository; branches: string[] }>();

    for (const repo of this.getRepositories()) {
      const branches = await this.getBranches(repo);
      allBranches.set(repo.rootDir, { repo, branches: branches.all });
    }

    return allBranches;
  }

  public async findMainBranch(repo?: GitRepository): Promise<string> {
    const branches = await this.getBranches(repo);
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
   * Get log for a specific repository.
   */
  @memoize
  public async getLog(limit: number = 20, filePath?: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo =
      repo || (filePath ? this.getRepositoryForPath(filePath) : this.getDefaultRepository());
    if (!targetRepo) return { all: [] };

    const args = ['log', `-n${limit}`, '--pretty=format:%H%n%an%n%ae%n%ad%n%s%n--END--'];
    if (filePath) {
      args.push('--', this.getRelativePath(filePath, targetRepo.rootDir));
    }

    const result = await targetRepo.executor.exec(args);
    return { all: this.parseLogOutput(result.stdout) };
  }

  /**
   * Aggregate commits from all repositories.
   */
  public async getCommitsFromAllRepos(
    limit: number = 50
  ): Promise<{ repo: GitRepository; commits: CommitInfo[] }[]> {
    await this._ensureInitialized();
    const results: { repo: GitRepository; commits: CommitInfo[] }[] = [];

    for (const repo of this.getRepositories()) {
      const log = await this.getLog(limit, undefined, repo);
      results.push({ repo, commits: log.all });
    }

    return results;
  }

  /**
   * Get commits for a specific repository or default.
   */
  @memoize
  public async getCommits(limit: number = 50, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return { all: [] };

    const args = ['log', `-n${limit}`, '--pretty=format:%H%n%an%n%ae%n%ad%n%s%n--END--'];
    const result = await targetRepo.executor.exec(args);
    return { all: this.parseLogOutput(result.stdout) };
  }

  /**
   * Get stashes for a specific repository or default.
   */
  @memoize
  public async getStashes(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return { all: [] };

    const result = await targetRepo.executor.exec(['stash', 'list']);
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const stashes = lines.map((line, index) => ({
      message: line,
      index,
      repo: targetRepo,
    }));
    return { all: stashes };
  }

  /**
   * Aggregate stashes from all repositories.
   */
  public async getAllStashes() {
    await this._ensureInitialized();
    const allStashes: { message: string; index: number; repo: GitRepository }[] = [];

    for (const repo of this.getRepositories()) {
      const stashes = await this.getStashes(repo);
      allStashes.push(...stashes.all);
    }

    return { all: allStashes };
  }

  public async getStashFiles(index: number, repo?: GitRepository): Promise<string[]> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return [];

    const result = await targetRepo.executor.exec([
      'stash',
      'show',
      '--name-only',
      '-u',
      `stash@{${index}}`,
    ]);
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  public async stashSave(
    message?: string,
    includeUntracked: boolean = false,
    repo?: GitRepository
  ) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const args = ['stash', 'push'];
    if (includeUntracked) args.push('-u');
    if (message) args.push('-m', message);

    const result = await targetRepo.executor.exec(args);
    this.clearCache();
    return result;
  }

  private async execStashCommand(
    command: 'apply' | 'drop' | 'pop',
    index: number,
    repo?: GitRepository
  ) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const result = await targetRepo.executor.exec(['stash', command, `stash@{${index}}`]);
    this.clearCache();
    return result;
  }

  public async stashApply(index: number, repo?: GitRepository) {
    return this.execStashCommand('apply', index, repo);
  }

  public async stashDrop(index: number, repo?: GitRepository) {
    return this.execStashCommand('drop', index, repo);
  }

  public async stashPop(index: number, repo?: GitRepository) {
    return this.execStashCommand('pop', index, repo);
  }

  public async checkout(branchName: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const result = await targetRepo.executor.exec(['checkout', branchName]);
    this.clearCache();
    return result;
  }

  public async createBranch(branchName: string, startPoint?: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const args = ['checkout', '-b', branchName];
    if (startPoint) {
      args.push(startPoint);
    }
    const result = await targetRepo.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async commit(options: string[] = [], repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    try {
      const result = await targetRepo.executor.exec(['commit', ...options]);
      this.clearCache();
      return result;
    } catch (error: any) {
      throw new Error(`Commit failed: ${error.message}`);
    }
  }

  /**
   * Get status for a specific repository.
   */
  @memoize
  public async getStatus(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return [];

    try {
      const result = await targetRepo.executor.exec(['status', '--porcelain', '-z', '-u']);
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

        entries.push({ stagedStatus, workingTreeStatus, path, repo: targetRepo });
      }
      return entries;
    } catch (error: any) {
      return [];
    }
  }

  /**
   * Aggregate status from all repositories.
   */
  public async getAllStatus() {
    await this._ensureInitialized();
    const allEntries: {
      stagedStatus: string;
      workingTreeStatus: string;
      path: string;
      repo: GitRepository;
    }[] = [];

    for (const repo of this.getRepositories()) {
      const status = await this.getStatus(repo);
      allEntries.push(...status);
    }

    return allEntries;
  }

  public async stage(filePath: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getRepositoryForPath(filePath) || this.getDefaultRepository();
    if (!targetRepo) return;

    await targetRepo.executor.exec(['add', this.getRelativePath(filePath, targetRepo.rootDir)]);
    this.clearCache();
  }

  public async unstage(filePath: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getRepositoryForPath(filePath) || this.getDefaultRepository();
    if (!targetRepo) return;

    await targetRepo.executor.exec([
      'restore',
      '--staged',
      this.getRelativePath(filePath, targetRepo.rootDir),
    ]);
    this.clearCache();
  }

  public async stageAll(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    await targetRepo.executor.exec(['add', '.']);
    this.clearCache();
  }

  public async unstageAll(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    await targetRepo.executor.exec(['restore', '--staged', '.']);
    this.clearCache();
  }

  public async skipCherryPick(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const result = await targetRepo.executor.exec(['cherry-pick', '--skip']);
    this.clearCache();
    return result;
  }

  public async cherryPick(commitHash: string, options: string[] = [], repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    try {
      const result = await targetRepo.executor.exec(['cherry-pick', ...options, commitHash]);
      this.clearCache();
      return result;
    } catch (error: any) {
      throw new Error(`Cherry-pick failed: ${error.message}`);
    }
  }

  @memoize
  public async getFileHistory(filePath: string, limit: number = 20, repo?: GitRepository) {
    return this.getLog(limit, filePath, repo);
  }

  @memoize
  public async getBlame(filePath: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getRepositoryForPath(filePath) || this.getDefaultRepository();
    if (!targetRepo) return '';

    const result = await targetRepo.executor.exec([
      'blame',
      '--line-porcelain',
      this.getRelativePath(filePath, targetRepo.rootDir),
    ]);
    return result.stdout;
  }

  public async push(
    remote: string = 'origin',
    branch?: string,
    setUpstream: boolean = false,
    repo?: GitRepository
  ) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const args = ['push', remote];
    if (setUpstream) {
      args.push('-u');
    }
    if (branch) {
      args.push(branch);
    }

    try {
      const result = await targetRepo.executor.exec(args);
      this.clearCache();
      return result;
    } catch (error: any) {
      // Handle missing upstream
      if (
        error.message.includes('has no upstream branch') ||
        error.stdout?.includes('has no upstream branch') ||
        error.stderr?.includes('has no upstream branch')
      ) {
        const currentBranch = branch || (await this.getBranches(targetRepo)).current;
        if (currentBranch) {
          const retryArgs = ['push', '--set-upstream', remote, currentBranch];
          const result = await targetRepo.executor.exec(retryArgs);
          this.clearCache();
          return result;
        }
      }
      throw error;
    }
  }

  public async pull(remote: string = 'origin', branch?: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const args = ['pull', remote];
    if (branch) {
      args.push(branch);
    }
    const result = await targetRepo.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async fetch(remote: string = 'origin', repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const result = await targetRepo.executor.exec(['fetch', '--prune', remote]);
    this.clearCache();
    return result;
  }

  /**
   * Fetch from all repositories.
   */
  public async fetchAll(remote: string = 'origin') {
    await this._ensureInitialized();
    const results = [];

    for (const repo of this.getRepositories()) {
      try {
        const result = await this.fetch(remote, repo);
        results.push({ repo, success: true, result });
      } catch (error: any) {
        results.push({ repo, success: false, error: error.message });
      }
    }

    return results;
  }

  public async updateLocalBranchFromRemote(
    branch: string,
    remote: string = 'origin',
    repo?: GitRepository
  ) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    // Fetch into FETCH_HEAD
    await targetRepo.executor.exec(['fetch', remote, branch]);

    try {
      // Check relationship between local branch and FETCH_HEAD
      const result = await targetRepo.executor.exec([
        'rev-list',
        '--left-right',
        '--count',
        `${branch}...FETCH_HEAD`,
      ]);

      const counts = result.stdout.trim().split(/\s+/).map(Number);
      const ahead = counts[0] || 0; // Local commits not in remote
      const behind = counts[1] || 0; // Remote commits not in local

      if (ahead > 0 && behind > 0) {
        throw new Error('Branch has diverged. Please checkout and pull to merge.');
      }

      if (ahead > 0) {
        // We are ahead, so we don't want to update local pointer to match remote (would lose commits).
        // We do nothing here, assuming the caller will Push next.
        return;
      }

      if (behind > 0) {
        // We are behind (fast-forwardable). Update local branch to match remote.
        await targetRepo.executor.exec(['fetch', remote, `${branch}:${branch}`]);
      }

      // If ahead=0, behind=0, we are even. Do nothing.
    } catch (e: any) {
      if (e.message.includes('diverged')) {
        throw e;
      }

      // Check if the error is because the branch doesn't exist locally (shouldn't happen here usually)
      if (e.message.includes('unknown revision')) {
        throw new Error(`Branch '${branch}' not found locally or remote information unavailable.`);
      }

      throw new Error(`Cannot update branch safely: ${e.message}`);
    }
    this.clearCache();
  }

  @memoize
  public async getBranchStatus(
    branchName: string,
    repo?: GitRepository
  ): Promise<{ ahead: number; behind: number; isGone: boolean }> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return { ahead: 0, behind: 0, isGone: false };

    try {
      // Use branch --format to get upstream and track status (including [gone])
      const result = await targetRepo.executor.exec([
        'branch',
        '--list',
        branchName,
        '--format=%(upstream:track)',
      ]);
      const output = result.stdout.trim();
      const isGone = output.includes('[gone]');

      const upstreamResult = await targetRepo.executor.exec([
        'rev-parse',
        '--abbrev-ref',
        `${branchName}@{u}`,
      ]);
      const upstream = upstreamResult.stdout.trim();
      if (!upstream) return { ahead: 0, behind: 0, isGone };

      const listResult = await targetRepo.executor.exec([
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

  public async showFileContent(
    hash: string,
    filePath: string,
    repo?: GitRepository
  ): Promise<string> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getRepositoryForPath(filePath) || this.getDefaultRepository();
    if (!targetRepo) return '';

    const relativePath = this.getRelativePath(filePath, targetRepo.rootDir);
    const args = ['show', `${hash}:${relativePath}`];
    try {
      const result = await targetRepo.executor.exec(args);
      return result.stdout;
    } catch {
      return '';
    }
  }

  public async showFileContentRaw(ref: string, repo?: GitRepository): Promise<string> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return '';

    try {
      const result = await targetRepo.executor.exec(['show', ref]);
      return result.stdout;
    } catch {
      return '';
    }
  }

  @memoize
  public async getAllLog(limit: number = 50, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return { all: [] };

    const args = [
      'log',
      '--all',
      `-n${limit}`,
      '--pretty=format:%H%n%an%n%ae%n%ad%n%s%n%d%n--END--',
    ];

    const result = await targetRepo.executor.exec(args);
    // Parse extended log format
    return { all: this.parseLogOutput(result.stdout) };
  }

  @memoize
  public async getCommitStats(hash: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return '';

    const result = await targetRepo.executor.exec(['show', '--stat', '--format=%b', hash]);
    return result.stdout.trim();
  }

  @memoize
  public async getChangedFilesWithStatus(
    hash: string,
    repo?: GitRepository
  ): Promise<{ path: string; status: string }[]> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return [];

    if (hash.startsWith('stash@')) {
      try {
        const result = await targetRepo.executor.exec([
          'stash',
          'show',
          '--name-status',
          '-u',
          hash,
        ]);
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

    const result = await targetRepo.executor.exec([
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
  public async getChangedFiles(hash: string, repo?: GitRepository): Promise<string[]> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return [];

    const result = await targetRepo.executor.exec(['show', '--name-only', '--format=', hash]);
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  public async getCommitFullDiff(hash: string, repo?: GitRepository): Promise<string> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return '';

    const result = await targetRepo.executor.exec(['show', hash]);
    return result.stdout;
  }

  @memoize
  public async getDiff(
    hash: string,
    filePath?: string,
    compareWithParent: boolean = false,
    repo?: GitRepository
  ): Promise<string> {
    await this._ensureInitialized();
    const targetRepo =
      repo || (filePath ? this.getRepositoryForPath(filePath) : this.getDefaultRepository());
    if (!targetRepo) return '';

    const target = compareWithParent ? `${hash}^..${hash}` : hash;
    const args = ['show', '--format=', target];
    if (filePath) {
      args.push('--', this.getRelativePath(filePath, targetRepo.rootDir));
    }
    const result = await targetRepo.executor.exec(args);
    return result.stdout;
  }

  public async getStagedDiff(repo?: GitRepository): Promise<string> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return '';

    const result = await targetRepo.executor.exec(['diff', '--staged']);
    return result.stdout;
  }

  public async getWorkingDiff(repo?: GitRepository): Promise<string> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return '';

    const result = await targetRepo.executor.exec(['diff']);
    return result.stdout;
  }

  /**
   * Get truncated diff for AI from a specific repository.
   */
  public async getTruncatedDiff(
    staged: boolean,
    maxChars: number = 4000,
    repo?: GitRepository
  ): Promise<string> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return '';

    const diffArg = staged ? ['diff', '--staged'] : ['diff'];

    // Get stat
    const statResult = await targetRepo.executor.exec([...diffArg, '--stat']);
    const stat = statResult.stdout;

    // Get diff
    const diffResult = await targetRepo.executor.exec(diffArg);
    let diff = diffResult.stdout;

    // Return if small
    if (diff.length <= maxChars) {
      return diff;
    }

    // Truncate
    const lines = diff.split('\n');
    const truncatedLines: string[] = [];
    let currentFileLines = 0;
    const maxLinesPerFile = 30;
    let totalChars = 0;

    for (const line of lines) {
      // Include header
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

      // Include hunk
      if (line.startsWith('@@')) {
        truncatedLines.push(line);
        currentFileLines = 0;
        totalChars += line.length + 1;
        continue;
      }

      // Limit content
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

  /**
   * Aggregate diffs from all repositories.
   */
  public async getAllDiffs(staged: boolean): Promise<{ repo: GitRepository; diff: string }[]> {
    await this._ensureInitialized();
    const results: { repo: GitRepository; diff: string }[] = [];

    for (const repo of this.getRepositories()) {
      const diff = staged ? await this.getStagedDiff(repo) : await this.getWorkingDiff(repo);
      if (diff.trim()) {
        results.push({ repo, diff });
      }
    }

    return results;
  }

  public async getUntrackedDiff(repo?: GitRepository): Promise<string> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return '';

    const status = await this.getStatus(targetRepo);
    const untracked = status.filter((s) => s.workingTreeStatus === '?' || s.stagedStatus === '?');

    let diff = '';
    for (const file of untracked) {
      try {
        const content = await vscode.workspace.fs.readFile(
          vscode.Uri.file(path.join(targetRepo.rootDir, file.path))
        );
        const text = Buffer.from(content).toString('utf-8');
        diff += `\n--- /dev/null\n+++ b/${file.path}\n@@ -0,0 +1,${text.split('\n').length} @@\n`;
        diff +=
          text
            .split('\n')
            .map((l: string) => '+' + l)
            .join('\n') + '\n';
      } catch (e) {
        // Skip files that can't be read (e.g. binary or locked)
      }
    }
    return diff;
  }

  public async deleteBranch(branchName: string, force: boolean = false, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const args = ['branch', force ? '-D' : '-d', branchName];
    const result = await targetRepo.executor.exec(args);
    this.clearCache();
    return result;
  }

  public async undoCommit(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const result = await targetRepo.executor.exec(['reset', '--soft', 'HEAD~1']);
    this.clearCache();
    return result;
  }

  public async abortRebase(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const result = await targetRepo.executor.exec(['rebase', '--abort']);
    this.clearCache();
    return result;
  }

  public async abortMerge(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const result = await targetRepo.executor.exec(['merge', '--abort']);
    this.clearCache();
    return result;
  }

  public async discardAllChanges(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    // Discard unstaged changes only (keep staged intact)
    await targetRepo.executor.exec(['checkout', '--', '.']);
    // Remove untracked files and directories
    await targetRepo.executor.exec(['clean', '-fd']);
    this.clearCache();
  }

  public async discardChanges(filePath: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getRepositoryForPath(filePath) || this.getDefaultRepository();
    if (!targetRepo) return;

    try {
      // Restore file
      await targetRepo.executor.exec([
        'restore',
        this.getRelativePath(filePath, targetRepo.rootDir),
      ]);
    } catch (e) {
      // Fallback
      await targetRepo.executor.exec([
        'checkout',
        '--',
        this.getRelativePath(filePath, targetRepo.rootDir),
      ]);
    }
    this.clearCache();
  }

  public async reset(mode: 'soft' | 'mixed' | 'hard', target: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const result = await targetRepo.executor.exec(['reset', `--${mode}`, target]);
    this.clearCache();
    return result;
  }

  public async revert(commitHash: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const result = await targetRepo.executor.exec(['revert', '--no-edit', commitHash]);
    this.clearCache();
    return result;
  }

  public async createTag(tagName: string, target?: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return;

    const args = ['tag', tagName];
    if (target) args.push(target);
    const result = await targetRepo.executor.exec(args);
    this.clearCache();
    return result;
  }

  /**
   * Get remote URL for a specific repository.
   */
  public async getRemoteUrl(repo?: GitRepository): Promise<string> {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return '';

    try {
      const result = await targetRepo.executor.exec(['remote', 'get-url', 'origin']);
      return result.stdout.trim();
    } catch {
      return '';
    }
  }

  /**
   * Get all remote URLs with their repositories.
   */
  public async getAllRemoteUrls(): Promise<{ repo: GitRepository; remoteUrl: string }[]> {
    await this._ensureInitialized();
    const results: { repo: GitRepository; remoteUrl: string }[] = [];

    for (const repo of this.getRepositories()) {
      const remoteUrl = await this.getRemoteUrl(repo);
      if (remoteUrl) {
        results.push({ repo, remoteUrl });
      }
    }

    return results;
  }

  @memoize
  public async getCommitDetails(hash: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return { message: '', author: '', date: '' };

    const result = await targetRepo.executor.exec([
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

  @memoize
  public async getTags(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return [];

    try {
      const result = await targetRepo.executor.exec([
        'for-each-ref',
        '--sort=-creatordate',
        '--format=%(refname:short)|%(objectname:short)|%(creatordate:short)|%(subject)',
        'refs/tags',
      ]);

      return result.stdout
        .trim()
        .split('\n')
        .filter((line) => line)
        .map((line) => {
          const [name, hash, date, subject] = line.split('|');
          return { name: name || '', hash: hash || '', date: date || '', subject: subject || '' };
        });
    } catch {
      return [];
    }
  }

  @memoize
  public async getBranchesForTag(tagName: string, repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return [];

    try {
      const result = await targetRepo.executor.exec([
        'branch',
        '-a',
        '--contains',
        `refs/tags/${tagName}`,
      ]);
      return result.stdout
        .trim()
        .split('\n')
        .map((b) => b.trim().replace(/^\*\s*/, ''))
        .filter((b) => b);
    } catch {
      return [];
    }
  }

  @memoize
  public async getContributors(repo?: GitRepository) {
    await this._ensureInitialized();
    const targetRepo = repo || this.getDefaultRepository();
    if (!targetRepo) return [];

    try {
      const result = await targetRepo.executor.exec(['shortlog', '-sn', '--all', '--no-merges']);

      return result.stdout
        .trim()
        .split('\n')
        .filter((line) => line)
        .map((line) => {
          const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
          if (match) {
            return {
              name: match[2],
              email: '',
              count: parseInt(match[1], 10),
            };
          }
          return { name: '', email: '', count: 0 };
        })
        .filter((c) => c.name);
    } catch {
      return [];
    }
  }

  /**
   * Get truncated diff for a specific commit (for AI context)
   */
  public async getTruncatedCommitDiff(hash: string, maxChars: number = 8000): Promise<string> {
    await this._ensureInitialized();
    const targetRepo = this.getDefaultRepository();
    if (!targetRepo) return '';

    try {
      const result = await targetRepo.executor.exec(['show', '--stat', hash]);
      const stat = result.stdout;

      const diffResult = await targetRepo.executor.exec(['show', hash]);
      let diff = diffResult.stdout;

      if (diff.length <= maxChars) {
        return diff;
      }

      // Truncate
      const lines = diff.split('\n');
      const truncatedLines: string[] = [];
      let currentFileLines = 0;
      const maxLinesPerFile = 50;
      let totalChars = 0;

      for (const line of lines) {
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

        if (line.startsWith('@@')) {
          truncatedLines.push(line);
          currentFileLines = 0;
          totalChars += line.length + 1;
          continue;
        }

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
    } catch {
      return '';
    }
  }

  /**
   * Get current git user info
   */
  public async getUserInfo(): Promise<{ name: string; email: string }> {
    await this._ensureInitialized();
    const targetRepo = this.getDefaultRepository();
    if (!targetRepo) return { name: '', email: '' };

    try {
      const nameResult = await targetRepo.executor.exec(['config', 'user.name']);
      const emailResult = await targetRepo.executor.exec(['config', 'user.email']);
      return {
        name: nameResult.stdout.trim() || 'Unknown',
        email: emailResult.stdout.trim() || '',
      };
    } catch {
      return { name: 'Unknown', email: '' };
    }
  }
}
