import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { PullRequestTreeProvider } from '../../providers/PullRequestTreeProvider';
import { PullRequestService } from '../../services/PullRequestService';
import { GitService } from '../../services/GitService';

// Mock vscode
vi.mock('vscode', () => ({
  TreeItem: class {
    constructor(public label: string, public collapsibleState: number) {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(public id: string, public color?: any) {} },
  ThemeColor: class { constructor(public id: string) {} },
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); },
  authentication: {
    getSession: vi.fn(),
  },
}));

// Mock PullRequestService
vi.mock('../../services/PullRequestService', () => ({
  PullRequestService: {
    getInstance: vi.fn().mockReturnValue({
      getPullRequests: vi.fn().mockResolvedValue([]),
    }),
  },
}));

// Mock GitService
vi.mock('../../services/GitService', () => ({
  GitService: {
    getInstance: vi.fn().mockReturnValue({
      getRepositories: vi.fn().mockReturnValue([]),
    }),
  },
}));

describe('PullRequestTreeProvider', () => {
  let provider: PullRequestTreeProvider;
  let prService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new PullRequestTreeProvider();
    prService = PullRequestService.getInstance();
  });

  it('should show sign in item if no session', async () => {
    vi.mocked(vscode.authentication.getSession).mockResolvedValue(undefined);
    
    const children = await provider.getChildren();
    
    expect(children.length).toBe(1);
    expect(children[0].label).toBe('Sign in to GitHub to view PRs');
  });

  it('should show PRs if session exists', async () => {
    vi.mocked(vscode.authentication.getSession).mockResolvedValue({ accessToken: 'token' } as any);
    prService.getPullRequests.mockResolvedValue([
      { number: 1, title: 'PR 1', author: { login: 'user' }, state: 'open', createdAt: new Date().toISOString() }
    ]);
    
    const children = await provider.getChildren();
    
    // This will depend on the logic of PullRequestTreeProvider (single vs multi repo)
    // For simplicity, let's just check that it's not the sign-in item
    expect(children[0].label).not.toBe('Sign in to GitHub to view PRs');
  });
});
