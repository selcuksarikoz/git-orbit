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

    // 1. Detect Remotes
    const remotes = await this.getRemotes(); // Need to implement getRemotes properly or parse config

    // For MVP, just try GitHub upstream/origin
    const remoteUrl = await this.gitService.getRemoteUrl();
    if (!remoteUrl) return [];

    if (remoteUrl.includes('github.com')) {
      const githubPRs = await this.getGitHubPRs(remoteUrl);
      prs.push(...githubPRs);
    }
    // GitLab support can be added similarly with PAT
    // else if (remoteUrl.includes('gitlab.com')) { ... }

    return prs;
  }

  private async getGitHubPRs(remoteUrl: string): Promise<PullRequest[]> {
    try {
      const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
      if (!session) {
        // Silent failure or show "Sign in" item in tree
        return [];
      }

      // Parse owner/repo from URL
      // https://github.com/owner/repo.git or git@github.com:owner/repo.git
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

  private async getRemotes() {
    // Placeholder, using main git service to get primary remote for now
    return [];
  }
}
