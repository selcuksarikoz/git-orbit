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

  private async getRemotes() {
    // Placeholder
    return [];
  }
}
