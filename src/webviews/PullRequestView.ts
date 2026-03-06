import * as vscode from 'vscode';
import { PullRequest, PullRequestService } from '../services/PullRequestService';
import { getBaseStyles, getLoadingHtml, getErrorHtml } from './WebviewLayout';

export interface PRDetails extends PullRequest {
  body: string;
  headRef: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: boolean;
  reviewers: { login: string; avatarUrl: string; state?: string }[];
  comments: { author: string; body: string; createdAt: string }[];
  files: { filename: string; status: string; additions: number; deletions: number }[];
}

export class PullRequestView {
  private static readonly viewType = 'gitorbit.prView';
  private static panels: Map<number, vscode.WebviewPanel> = new Map();

  public static async show(context: vscode.ExtensionContext, pr: PullRequest) {
    const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (PullRequestView.panels.has(pr.number)) {
      PullRequestView.panels.get(pr.number)?.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PullRequestView.viewType,
      `PR #${pr.number}: ${pr.title}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    PullRequestView.panels.set(pr.number, panel);
    panel.webview.html = getLoadingHtml('Loading PR details...');

    try {
      const details = await PullRequestService.getInstance().getPRDetails(pr.repo!, pr.number);
      const collaborators = await PullRequestService.getInstance().getCollaborators(pr.repo!);
      panel.webview.html = PullRequestView.getHtmlContent(details, collaborators, pr.number);
    } catch (e) {
      panel.webview.html = getErrorHtml(e);
    }

    panel.webview.onDidReceiveMessage(
      async (message) => {
        const showLoading = (msg: string) =>
          panel.webview.postMessage({ command: 'showLoading', message: msg });
        const hideLoading = () => panel.webview.postMessage({ command: 'hideLoading' });
        const refreshPage = async () => {
          const data = await PullRequestService.getInstance().getPRDetails(pr.repo!, pr.number);
          const collabs = await PullRequestService.getInstance().getCollaborators(pr.repo!);
          panel.webview.html = PullRequestView.getHtmlContent(data, collabs, pr.number);
        };

        try {
          switch (message.command) {
            case 'addReviewers':
              showLoading('Adding reviewers...');
              for (const username of message.usernames) {
                await PullRequestService.getInstance().addReviewer(pr.repo!, pr.number, username);
              }
              vscode.window.showInformationMessage(`Added ${message.usernames.length} reviewer(s)`);
              await refreshPage();
              break;
            case 'removeReviewer':
              showLoading('Removing reviewer...');
              await PullRequestService.getInstance().removeReviewer(
                pr.repo!,
                pr.number,
                message.username
              );
              vscode.window.showInformationMessage(`Removed ${message.username}`);
              await refreshPage();
              break;
            case 'updateDescription':
              showLoading('Saving description...');
              await PullRequestService.getInstance().updatePRDescription(
                pr.repo!,
                pr.number,
                message.body
              );
              vscode.window.showInformationMessage('Description updated');
              await refreshPage();
              break;
            case 'approve':
              showLoading('Approving PR...');
              await PullRequestService.getInstance().reviewPR(
                pr.repo!,
                pr.number,
                'APPROVE',
                message.body
              );
              vscode.window.showInformationMessage('PR Approved!');
              await refreshPage();
              break;
            case 'requestChanges':
              showLoading('Requesting changes...');
              await PullRequestService.getInstance().reviewPR(
                pr.repo!,
                pr.number,
                'REQUEST_CHANGES',
                message.body
              );
              vscode.window.showInformationMessage('Changes requested.');
              await refreshPage();
              break;
            case 'comment':
              showLoading('Adding comment...');
              await PullRequestService.getInstance().commentPR(pr.repo!, pr.number, message.body);
              vscode.window.showInformationMessage('Comment added.');
              await refreshPage();
              break;
            case 'merge':
              showLoading('Merging PR...');
              const merged = await PullRequestService.getInstance().mergePR(
                pr.repo!,
                pr.number,
                message.method
              );
              if (merged) {
                vscode.window.showInformationMessage('PR Merged!');
                panel.dispose();
              } else {
                await refreshPage();
              }
              break;
            case 'openFile':
              const gitService = (await import('../services/GitService')).GitService.getInstance();
              const filePath = vscode.Uri.file(
                `${(pr.repo || gitService.getDefaultRepository())?.rootDir || ''}/${message.filename}`
              );
              await vscode.commands.executeCommand('vscode.open', filePath);
              break;
            case 'openInBrowser':
              vscode.env.openExternal(vscode.Uri.parse(pr.url));
              break;
            case 'refresh':
              showLoading('Refreshing...');
              await refreshPage();
              break;
          }
        } catch (e: any) {
          hideLoading();
          vscode.window.showErrorMessage(`Error: ${e.message}`);
        }
      },
      null,
      context.subscriptions
    );

    panel.onDidDispose(
      () => {
        PullRequestView.panels.delete(pr.number);
      },
      null,
      context.subscriptions
    );
  }

  private static getHtmlContent(
    pr: PRDetails,
    collaborators: { login: string; avatarUrl: string }[],
    prNumber: number
  ): string {
    const currentReviewerLogins = new Set(pr.reviewers.map((r) => r.login));
    const availableCollaborators = collaborators.filter((c) => !currentReviewerLogins.has(c.login));

    const reviewersHtml = pr.reviewers
      .map(
        (r) => `
      <div class="reviewer-chip">
        <img class="avatar-sm" src="${r.avatarUrl}" alt="${r.login}" />
        <span>${r.login}</span>
        <span class="badge ${r.state === 'APPROVED' ? 'badge-success' : r.state === 'CHANGES_REQUESTED' ? 'badge-danger' : 'badge-muted'}">${r.state || 'Pending'}</span>
        <button class="btn-icon" onclick="removeReviewer('${r.login}')" title="Remove">×</button>
      </div>
    `
      )
      .join('');

    const collaboratorOptionsHtml = availableCollaborators
      .map(
        (c) => `
      <label class="collab-option">
        <input type="checkbox" value="${c.login}" />
        <img class="avatar-sm" src="${c.avatarUrl}" alt="${c.login}" />
        <span>${c.login}</span>
      </label>
    `
      )
      .join('');

    const filesHtml = pr.files
      .map(
        (f) => `
      <div class="file-item" onclick="openFile('${f.filename}')">
        <span class="file-status ${f.status}">${f.status[0].toUpperCase()}</span>
        <span class="file-name">${f.filename}</span>
        <span class="file-stats"><span class="add">+${f.additions}</span> <span class="del">-${f.deletions}</span></span>
      </div>
    `
      )
      .join('');

    const commentsHtml =
      pr.comments.length > 0
        ? pr.comments
            .map(
              (c) => `
      <div class="comment-item">
        <div class="comment-header">
          <strong>${c.author}</strong>
          <span class="comment-date">${new Date(c.createdAt).toLocaleString()}</span>
        </div>
        <div class="comment-body">${escapeHtml(c.body)}</div>
      </div>
    `
            )
            .join('')
        : '<div class="empty-state">No comments yet</div>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PR #${pr.number}</title>
    <style>
        ${getBaseStyles()}

        /* PR Specific Styles - Using unified button design system */
        .reviewer-chip { display: inline-flex; align-items: center; gap: 8px; background: var(--bg); padding: 8px 14px; border-radius: 8px; margin: 4px; }
        .reviewer-chip img { width: 24px; height: 24px; border-radius: 50%; }
        .reviewer-chip .btn-icon { width: 28px; height: 28px; font-size: 16px; }
        .reviewer-chip .btn-icon:hover { color: var(--danger); background: var(--danger-bg); }

        .collab-dropdown { position: relative; }
        .collab-list { display: none; position: absolute; top: 100%; left: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px; min-width: 250px; max-height: 300px; overflow-y: auto; z-index: 100; box-shadow: var(--shadow-lg); }
        .collab-list.show { display: block; }
        .collab-option { display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: var(--radius-sm); }
        .collab-option:hover { background: var(--bg); }
        .collab-option input { width: 16px; height: 16px; }
        .collab-option img { width: 24px; height: 24px; border-radius: 50%; }

        .file-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; cursor: pointer; border-radius: var(--radius-sm); transition: background 0.15s; }
        .file-item:hover { background: var(--bg); }
        .file-status { width: 20px; height: 20px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
        .file-status.added { background: var(--success-bg); color: var(--success); }
        .file-status.modified { background: var(--warning-bg); color: var(--warning); }
        .file-status.removed { background: var(--danger-bg); color: var(--danger); }
        .file-name { flex: 1; font-family: monospace; font-size: 13px; word-break: break-all; }
        .file-stats { font-size: 12px; font-family: monospace; }
        .file-stats .add { color: var(--success); }
        .file-stats .del { color: var(--danger); }

        .comment-item { background: var(--bg); padding: 14px; border-radius: var(--radius-md); margin-bottom: 10px; }
        .comment-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .comment-header strong { color: var(--text); }
        .comment-date { font-size: 12px; color: var(--text-muted); }
        .comment-body { font-size: 14px; line-height: 1.5; white-space: pre-wrap; }

        .empty-state { color: var(--text-muted); text-align: center; padding: 20px; font-style: italic; }

        .description-edit { width: 100%; min-height: 120px; }
        .actions-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }

        /* Loading Overlay */
        .loading-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.85);
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            gap: 16px;
        }
        .loading-overlay.show { display: flex; }
        .loading-spinner {
            width: 48px; height: 48px;
            border: 4px solid var(--border);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        .loading-message { color: var(--text); font-size: 1rem; font-weight: 500; }
    </style>
</head>
<body>
    <div id="loadingOverlay" class="loading-overlay">
        <div class="loading-spinner"></div>
        <div id="loadingMessage" class="loading-message">Loading...</div>
    </div>

    <div class="header animate-fadeIn">
        <div class="header-content">
            <h1>${escapeHtml(pr.title)}</h1>
            <div class="meta">
                <span class="badge ${pr.state === 'open' ? 'badge-success' : pr.state === 'merged' ? 'badge-primary' : 'badge-danger'}">${pr.state.toUpperCase()}</span>
                #${pr.number} by <a href="https://github.com/${pr.author.login}" target="_blank">${pr.author.login}</a>
                • ${new Date(pr.createdAt).toLocaleDateString()}
            </div>
            <div class="mt-sm">
                <code>${pr.headRef}</code> → <code>${pr.baseRef}</code>
            </div>
        </div>
        <div class="header-actions">
            <button class="btn btn-secondary" onclick="openInBrowser()">🔗 Browser</button>
            <button class="btn btn-secondary" onclick="refresh()">↻ Refresh</button>
        </div>
    </div>

    <div class="grid grid-3 mb-lg animate-fadeInUp">
        <div class="stat stat-success">
            <div class="stat-value">+${pr.additions}</div>
            <div class="stat-label">Additions</div>
        </div>
        <div class="stat stat-danger">
            <div class="stat-value">-${pr.deletions}</div>
            <div class="stat-label">Deletions</div>
        </div>
        <div class="stat">
            <div class="stat-value">${pr.changedFiles}</div>
            <div class="stat-label">Files</div>
        </div>
    </div>

    <div class="section animate-fadeInUp">
        <div class="section-title">Description</div>
        <textarea id="descriptionInput" class="description-edit">${escapeHtml(pr.body || '')}</textarea>
        <div class="actions-row">
            <button class="btn btn-secondary" id="saveDescBtn" onclick="saveDescription()">Save Description</button>
        </div>
    </div>

    <div class="section animate-fadeInUp">
        <div class="section-title">Reviewers</div>
        <div class="mb-md">${reviewersHtml || '<span class="empty-state">No reviewers assigned</span>'}</div>

        <div class="collab-dropdown">
            <button class="btn btn-secondary" onclick="toggleCollabList()">+ Add Reviewers</button>
            <div id="collabList" class="collab-list">
                ${collaboratorOptionsHtml || '<div class="empty-state">No collaborators available</div>'}
                <div class="divider"></div>
                <button class="btn btn-primary" style="width: 100%;" onclick="addSelectedReviewers()">Add Selected</button>
            </div>
        </div>
    </div>

    <div class="section animate-fadeInUp">
        <div class="section-title">Files Changed (${pr.changedFiles})</div>
        <div class="scrollable">${filesHtml || '<div class="empty-state">No files changed</div>'}</div>
    </div>

    <div class="section animate-fadeInUp">
        <div class="section-title">Comments (${pr.comments.length})</div>
        <div class="scrollable mb-md">${commentsHtml}</div>
        <textarea id="commentInput" placeholder="Write a comment..."></textarea>
        <button class="btn btn-secondary" id="commentBtn" onclick="submitComment()">💬 Comment</button>
    </div>

    <div class="section animate-fadeInUp">
        <div class="section-title">Review Actions</div>
        <textarea id="reviewBody" placeholder="Leave a review comment (optional for approve)..."></textarea>
        <div class="actions-row">
            <button class="btn btn-success" id="approveBtn" onclick="approve()">✓ Approve</button>
            <button class="btn btn-danger" id="requestChangesBtn" onclick="requestChanges()">✗ Request Changes</button>
            ${
              pr.mergeable
                ? `
            <button class="btn btn-primary" id="mergeBtn" onclick="merge('merge')">Merge</button>
            <button class="btn btn-secondary" onclick="merge('squash')">Squash</button>
            <button class="btn btn-secondary" onclick="merge('rebase')">Rebase</button>
            `
                : '<span class="badge badge-warning">⚠ Cannot merge</span>'
            }
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Loading overlay control
        window.addEventListener('message', event => {
            const msg = event.data;
            const overlay = document.getElementById('loadingOverlay');
            const msgEl = document.getElementById('loadingMessage');
            if (msg.command === 'showLoading') {
                msgEl.textContent = msg.message || 'Loading...';
                overlay.classList.add('show');
            } else if (msg.command === 'hideLoading') {
                overlay.classList.remove('show');
            }
        });

        function openInBrowser() { vscode.postMessage({ command: 'openInBrowser' }); }
        function refresh() { vscode.postMessage({ command: 'refresh' }); }

        function openFile(filename) {
            vscode.postMessage({ command: 'openFile', filename });
        }

        function toggleCollabList() {
            document.getElementById('collabList').classList.toggle('show');
        }

        document.addEventListener('click', (e) => {
            const dropdown = document.querySelector('.collab-dropdown');
            if (dropdown && !dropdown.contains(e.target)) {
                document.getElementById('collabList').classList.remove('show');
            }
        });

        function addSelectedReviewers() {
            const checkboxes = document.querySelectorAll('#collabList input[type="checkbox"]:checked');
            const usernames = Array.from(checkboxes).map(cb => cb.value);
            if (usernames.length > 0) {
                vscode.postMessage({ command: 'addReviewers', usernames });
            }
            document.getElementById('collabList').classList.remove('show');
        }

        function removeReviewer(username) {
            vscode.postMessage({ command: 'removeReviewer', username });
        }

        function saveDescription() {
            const body = document.getElementById('descriptionInput').value;
            setLoading('saveDescBtn');
            vscode.postMessage({ command: 'updateDescription', body });
        }

        function submitComment() {
            const input = document.getElementById('commentInput');
            if (input.value.trim()) {
                setLoading('commentBtn');
                vscode.postMessage({ command: 'comment', body: input.value.trim() });
            }
        }

        function approve() {
            const body = document.getElementById('reviewBody').value;
            setLoading('approveBtn');
            vscode.postMessage({ command: 'approve', body });
        }

        function requestChanges() {
            const body = document.getElementById('reviewBody').value;
            if (!body.trim()) { alert('Please provide feedback when requesting changes.'); return; }
            setLoading('requestChangesBtn');
            vscode.postMessage({ command: 'requestChanges', body });
        }

        function merge(method) {
            if (confirm('Are you sure you want to merge this PR?')) {
                setLoading('mergeBtn');
                vscode.postMessage({ command: 'merge', method });
            }
        }
    </script>
</body>
</html>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
