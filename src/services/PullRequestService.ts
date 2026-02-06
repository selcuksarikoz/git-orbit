import * as vscode from 'vscode';
import { GitService } from './GitService';

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  author: {
    login: string;
    avatarUrl: string;
  };
  createdAt: string;
  updatedAt: string;
  source: 'github' | 'gitlab';
}

export class PullRequestService {
  private static instance: PullRequestService;
  private gitService: GitService;

  private constructor() {
    this.gitService = GitService.getInstance();
  }

  public static getInstance(): PullRequestService {
    if (!PullRequestService.instance) {
      PullRequestService.instance = new PullRequestService();
    }
    return PullRequestService.instance;
  }

  public async getPullRequests(): Promise<PullRequest[]> {
    const prs: PullRequest[] = [];

    // Detect remotes
    // TODO: Implement proper remote detection

    // MVP: GitHub only
    const remoteUrl = await this.gitService.getRemoteUrl();
    if (!remoteUrl) return [];

    if (remoteUrl.includes('github.com')) {
      const githubPRs = await this.getGitHubPRs(remoteUrl);
      prs.push(...githubPRs);
    }
    // Future: GitLab support

    return prs;
  }

  private async getGitHubPRs(remoteUrl: string): Promise<PullRequest[]> {
    try {
      const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
      if (!session) {
        // Silent failure if no session
        return [];
      }

      // Parse owner/repo
      const match = remoteUrl.match(/github\.com[:\/]([^\/]+)\/([^\.]+)/);
      if (!match) return [];

      const owner = match[1];
      const repo = match[2];

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitOrbit-VSCode'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch PRs', response.statusText);
        return [];
      }

      const data = await response.json() as any[];
      return data.map(pr => ({
        id: pr.id.toString(),
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        state: pr.state,
        author: {
            login: pr.user.login,
            avatarUrl: pr.user.avatar_url
        },
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        source: 'github'
      }));

    } catch (e) {
      console.error('Error fetching GitHub PRs:', e);
      return [];
    }
  }

  public async createPullRequest(title: string, body: string, head: string, base: string): Promise<string | undefined> {
    const remoteUrl = await this.gitService.getRemoteUrl();
    if (!remoteUrl) return undefined;

    // GitHub only
    if (remoteUrl.includes('github.com')) {
        return this.createGitHubPR(remoteUrl, title, body, head, base);
    }
    return undefined;
  }

  private async createGitHubPR(remoteUrl: string, title: string, body: string, head: string, base: string): Promise<string | undefined> {
      try {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
        if (!session) return undefined;

        const match = remoteUrl.match(/github\.com[:\/]([^\/]+)\/([^\.]+)/);
        if (!match) return undefined;

        const owner = match[1];
        const repo = match[2];

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'GitOrbit-VSCode'
            },
            body: JSON.stringify({ title, body, head, base })
        });

        if (!response.ok) {
            const error = await response.json() as any;
            throw new Error(error.message || response.statusText);
        }

        const data = await response.json() as any;
        return data.html_url;

      } catch (e: any) {
          vscode.window.showErrorMessage(`Failed to create PR: ${e.message}`);
          return undefined;
      }
  }

  public async getCollaborators(): Promise<{ login: string; avatarUrl: string }[]> {
    try {
      const { owner, repo, session } = await this.getGitHubContext();
      const collaborators = await this.githubFetch(`/repos/${owner}/${repo}/collaborators`, session);
      return (collaborators || []).map((c: any) => ({
        login: c.login,
        avatarUrl: c.avatar_url
      }));
    } catch (e) {
      return [];
    }
  }

  public async updatePRDescription(prNumber: number, body: string): Promise<void> {
    const { owner, repo, session } = await this.getGitHubContext();
    await this.githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, session, 'PATCH', { body });
  }

  public async getPRDetails(prNumber: number): Promise<any> {
    const remoteUrl = await this.gitService.getRemoteUrl();
    if (!remoteUrl || !remoteUrl.includes('github.com')) {
      throw new Error('Only GitHub is supported');
    }

    const { owner, repo, session } = await this.getGitHubContext();

    // Fetch PR details
    const prRes = await this.githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, session);
    const reviewsRes = await this.githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, session);
    const filesRes = await this.githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files`, session);
    const commentsRes = await this.githubFetch(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, session);
    const reviewersRes = await this.githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`, session);

    const reviewerMap = new Map<string, { login: string; avatarUrl: string; state?: string }>();

    // Add requested reviewers (pending)
    for (const r of reviewersRes.users || []) {
      reviewerMap.set(r.login, { login: r.login, avatarUrl: r.avatar_url, state: 'PENDING' });
    }

    // Add reviewers with their state
    for (const r of reviewsRes || []) {
      if (r.state !== 'COMMENTED') {
        reviewerMap.set(r.user.login, { login: r.user.login, avatarUrl: r.user.avatar_url, state: r.state });
      }
    }

    return {
      id: prRes.id.toString(),
      number: prRes.number,
      title: prRes.title,
      url: prRes.html_url,
      state: prRes.merged ? 'merged' : prRes.state,
      author: { login: prRes.user.login, avatarUrl: prRes.user.avatar_url },
      createdAt: prRes.created_at,
      updatedAt: prRes.updated_at,
      source: 'github',
      body: prRes.body || '',
      headRef: prRes.head.ref,
      baseRef: prRes.base.ref,
      additions: prRes.additions,
      deletions: prRes.deletions,
      changedFiles: prRes.changed_files,
      mergeable: prRes.mergeable ?? true,
      reviewers: Array.from(reviewerMap.values()),
      files: (filesRes || []).map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions
      })),
      comments: (commentsRes || []).map((c: any) => ({
        author: c.user.login,
        body: c.body,
        createdAt: c.created_at
      }))
    };
  }

  public async addReviewer(prNumber: number, username: string): Promise<void> {
    const { owner, repo, session } = await this.getGitHubContext();
    await this.githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`, session, 'POST', {
      reviewers: [username]
    });
  }

  public async removeReviewer(prNumber: number, username: string): Promise<void> {
    const { owner, repo, session } = await this.getGitHubContext();
    await this.githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`, session, 'DELETE', {
      reviewers: [username]
    });
  }

  public async reviewPR(prNumber: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body?: string): Promise<void> {
    const { owner, repo, session } = await this.getGitHubContext();
    await this.githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, session, 'POST', {
      event,
      body: body || ''
    });
  }

  public async commentPR(prNumber: number, body: string): Promise<void> {
    const { owner, repo, session } = await this.getGitHubContext();
    await this.githubFetch(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, session, 'POST', { body });
  }

  public async mergePR(prNumber: number, method: 'merge' | 'squash' | 'rebase'): Promise<boolean> {
    const { owner, repo, session } = await this.getGitHubContext();
    try {
      await this.githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, session, 'PUT', {
        merge_method: method
      });
      return true;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to merge: ${e.message}`);
      return false;
    }
  }

  private async getGitHubContext(): Promise<{ owner: string; repo: string; session: vscode.AuthenticationSession }> {
    const remoteUrl = await this.gitService.getRemoteUrl();
    if (!remoteUrl) throw new Error('No remote URL');

    const match = remoteUrl.match(/github\.com[:\/]([^\/]+)\/([^\.]+)/);
    if (!match) throw new Error('Invalid GitHub URL');

    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
    if (!session) throw new Error('Not authenticated');

    return { owner: match[1], repo: match[2], session };
  }

  private async githubFetch(endpoint: string, session: vscode.AuthenticationSession, method: string = 'GET', body?: any): Promise<any> {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'GitOrbit-VSCode'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as any;
      throw new Error(error.message || response.statusText);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  private async getRemotes() {
    return [];
  }
}
