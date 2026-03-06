import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { PullRequestService } from '../../services/PullRequestService';
import { GitService } from '../../services/GitService';

// Mock vscode
vi.mock('vscode', () => ({
  authentication: {
    getSession: vi.fn(),
  },
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
}));

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getAllRemoteUrls: vi.fn().mockResolvedValue([
        {
          repo: { rootDir: '/test/repo', remoteUrl: 'https://github.com/test/repo.git' },
          remoteUrl: 'https://github.com/test/repo.git',
        },
      ]),
      getRemoteUrl: vi.fn().mockResolvedValue('https://github.com/test/repo.git'),
    }),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('PullRequestService', () => {
  let prService: PullRequestService;
  let mockGitService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (PullRequestService as any).instance = undefined;
    prService = PullRequestService.getInstance();
    mockGitService = GitService.getInstance();
  });

  it('should be a singleton', () => {
    const instance2 = PullRequestService.getInstance();
    expect(prService).toBe(instance2);
  });

  it('should get pull requests from GitHub', async () => {
    vi.mocked(vscode.authentication.getSession).mockResolvedValue({
      accessToken: 'test-token',
      account: { id: 'test', label: 'test' },
      scopes: ['repo'],
      id: 'test',
    } as any);

    const mockPRs = [
      {
        id: 1,
        number: 101,
        title: 'Test PR',
        html_url: 'https://github.com/test/repo/pull/101',
        state: 'open',
        user: { login: 'testuser', avatar_url: 'https://avatar.url' },
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      },
    ];

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockPRs,
    } as any);

    const prs = await prService.getPullRequests();

    expect(prs.length).toBe(1);
    expect(prs[0].title).toBe('Test PR');
    expect(prs[0].number).toBe(101);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.github.com/repos/test/repo/pulls?state=open'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('should create a pull request', async () => {
    vi.mocked(vscode.authentication.getSession).mockResolvedValue({
      accessToken: 'test-token',
    } as any);

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/test/repo/pull/102' }),
    } as any);

    const repo = { rootDir: '/test/repo', remoteUrl: 'https://github.com/test/repo.git' };
    const url = await prService.createPullRequest(repo as any, 'Title', 'Body', 'head', 'base');

    expect(url).toBe('https://github.com/test/repo/pull/102');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.github.com/repos/test/repo/pulls'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Title', body: 'Body', head: 'head', base: 'base' }),
      })
    );
  });

  it('should handle fetch errors', async () => {
    vi.mocked(vscode.authentication.getSession).mockResolvedValue({
      accessToken: 'test-token',
    } as any);

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
      json: async () => ({ message: 'Not Found' }),
    } as any);

    const prs = await prService.getPullRequests();
    expect(prs.length).toBe(0);
  });
});
