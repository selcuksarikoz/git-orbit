import * as vscode from 'vscode';
import { GitService } from '../services/GitService';
import { AIService, Message } from '../services/AIService';
import { md5 } from '../utils/Hash';

export class CommitChatPanel {
  public static currentPanel: CommitChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _commitHash: string;
  private _messages: Message[] = [];
  private _currentAbortController: AbortController | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    commitHash: string,
    author: string,
    message: string,
    diff: string,
    userData: { name: string; avatarUrl: string },
    initialPrompt?: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._commitHash = commitHash;

    // Set the webview's initial html content
    this._update(author, message, userData, initialPrompt);

    // Initial system prompt setup
    const isWorkspaceChanges = commitHash === 'current-changes';
    const isSelection = commitHash === 'selected-code';

    const contextType = isSelection
      ? 'selected code snippet'
      : isWorkspaceChanges
        ? 'current workspace changes'
        : 'a specific git commit';

    const systemPrompt = `You are a highly experienced Staff Software Engineer.
Your goal: Provide immediate, world-class technical results. Focus on SOLID, DRY, and high-performance patterns.

**Context**: ${contextType}
${
  !isWorkspaceChanges && !isSelection
    ? `**Commit**: ${commitHash.substring(0, 7)} | **Author**: ${author} | **Msg**: ${message}`
    : ''
}

**Input Content**:
${diff.substring(0, 25000)} ${diff.length > 25000 ? '...(truncated)' : ''}

**Operational Guidelines**:
1. **Direct Action**: Do not explain *that* you are analyzing. Provide the analysis and refactored code IMMEDIATELY.
2. **Gold Standard**: For any code improvement, provide the "Gold Standard" refactored version using triple backticks (\` \` \`) and language ID.
3. **Brutally Pragmatic**: Identify code smells (Primitive Obsession, nesting, etc.) and performance issues (leaks, complexity) directly.
4. **No Fluff**: Skip polite introductions or descriptive preambles. Start with the solution or the critique.

**Task**: ${
      isSelection
        ? 'Refactor this code to production-grade quality. Show the improved version first, then brief bullet points on why.'
        : isWorkspaceChanges
          ? 'Identify bugs, architecture flaws, or smells in these changes. Provide fixes.'
          : 'Summarize the impact of this commit and critique the implementation quality.'
    }`;

    // Listen for messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'sendMessage':
            const userText = message.text;
            this._messages.push({ role: 'user', content: userText });

            // Cancel previous if any
            if (this._currentAbortController) {
              this._currentAbortController.abort();
            }
            this._currentAbortController = new AbortController();

            try {
              const stream = await AIService.getInstance().streamChat(
                this._messages,
                systemPrompt,
                this._currentAbortController.signal
              );

              const reader = stream.getReader();
              const decoder = new TextDecoder();
              let fullResponse = '';

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                fullResponse += chunk;
                this._panel.webview.postMessage({
                  type: 'receiveToken',
                  token: chunk,
                });
              }

              this._panel.webview.postMessage({ type: 'streamComplete' });
              this._messages.push({ role: 'assistant', content: fullResponse });
            } catch (e: any) {
              if (e.name !== 'AbortError') {
                this._panel.webview.postMessage({
                  type: 'error',
                  message: e.message,
                });
              }
            } finally {
              this._currentAbortController = null;
            }
            return;

          case 'stopGeneration':
            if (this._currentAbortController) {
              this._currentAbortController.abort();
              this._currentAbortController = null;
            }
            return;
        }
      },
      null,
      this._disposables
    );

    // Dispose when panel is closed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static async createOrShow(
    extensionUri: vscode.Uri,
    commitHash: string,
    author: string,
    message: string,
    customDiff?: string,
    initialPrompt?: string
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Fetch diff for context
    let diff = customDiff || '';
    if (!diff) {
      try {
        diff = await GitService.getInstance().getCommitDiff(commitHash);
      } catch (e) {
        diff = 'Could not fetch diff.';
      }
    }

    // If we already have a panel, show it?
    // Actually, for a *new* commit chat, we probably want a new panel or replace the existing one.
    // Let's create a new one for specific commit context to avoid confusion, or reuse if same commit.
    if (CommitChatPanel.currentPanel && CommitChatPanel.currentPanel._commitHash === commitHash) {
      CommitChatPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Fetch user info for gravatar
    const userInfo = await GitService.getInstance().getUserInfo();
    const avatarUrl = userInfo.email
      ? `https://www.gravatar.com/avatar/${md5(userInfo.email)}?s=100&d=identicon`
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${userInfo.name}&backgroundColor=3b82f6`;

    // Otherwise create new
    const panel = vscode.window.createWebviewPanel(
      'chatWithCommit',
      `Chat: ${commitHash.substring(0, 7)}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'assets')],
      }
    );

    CommitChatPanel.currentPanel = new CommitChatPanel(
      panel,
      extensionUri,
      commitHash,
      author,
      message,
      diff,
      { name: userInfo.name, avatarUrl },
      initialPrompt
    );
  }

  public dispose() {
    CommitChatPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update(
    author: string,
    message: string,
    userData: { name: string; avatarUrl: string },
    initialPrompt?: string
  ) {
    this._panel.title =
      this._commitHash === 'current-changes'
        ? 'Review Changes'
        : `Chat: ${this._commitHash.substring(0, 7)}`;
    this._panel.webview.html = this._getHtmlForWebview(author, message, userData, initialPrompt);
  }

  private _getHtmlForWebview(
    author: string,
    message: string,
    userData: { name: string; avatarUrl: string },
    initialPrompt?: string
  ) {
    const kuultoIcon = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'assets', 'icons', 'kuulto.png')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js"></script>

    <style>
        :root {
            --bg-color: #0b0e14;
            --chat-bg: #0b1118;
            --user-bubble: #1a56db;
            --ai-bubble: transparent;
            --text-main: #e2e8f0;
            --text-muted: #94a3b8;
            --border-color: #1e293b;
            --input-bg: rgba(17, 24, 39, 0.5);
            --accent-color: #3b82f6;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
        }

        .header {
            background: rgba(11, 14, 20, 0.8);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid var(--border-color);
            padding: 12px 20px;
            z-index: 100;
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 24px;
            scroll-behavior: smooth;
        }

        .message-wrapper {
            display: flex;
            gap: 12px;
            max-width: 85%;
        }

        .message-wrapper.user {
            align-self: flex-end;
            flex-direction: row-reverse;
        }

        .avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background-size: cover;
            flex-shrink: 0;
            border: 1px solid var(--border-color);
        }

        .ai-avatar {
            background-image: url('${kuultoIcon}');
            background-color: transparent;
        }

        .user-avatar {
            background-image: url('https://api.dicebear.com/7.x/avataaars/svg?seed=StaffEngineer&backgroundColor=3b82f6');
            background-color: #3b82f6;
        }

        .message-content {
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        .message-info {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-bottom: 4px;
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .user .message-info {
            flex-direction: row-reverse;
        }

        .message-name {
            font-weight: 600;
            color: var(--text-main);
        }

        .bubble {
            padding: 12px 16px;
            border-radius: 12px;
            font-size: 0.95rem;
            line-height: 1.5;
            position: relative;
            overflow-wrap: break-word;
            word-wrap: break-word;
            word-break: break-word;
        }

        .user .bubble {
            background-color: var(--user-bubble);
            color: white;
            border-bottom-right-radius: 2px;
        }

        .ai .bubble {
            background-color: var(--ai-bubble);
            color: var(--text-main);
            padding-left: 0;
        }

        /* Markdown Styling */
        .md-content {
            width: 100%;
        }

        .md-content img {
            max-width: 100%;
            height: auto;
            border-radius: 6px;
        }

        .md-content table {
            display: block;
            width: 100%;
            overflow-x: auto;
            border-collapse: collapse;
            margin: 10px 0;
        }

        .md-content th, .md-content td {
            border: 1px solid var(--border-color);
            padding: 8px;
        }

        .md-content p:last-child { margin-bottom: 0; }

        .code-block-container {
            background: #011627;
            border-radius: 8px;
            margin: 12px 0;
            border: 1px solid var(--border-color);
            overflow: hidden;
        }

        .code-header {
            background: #0d1117;
            padding: 8px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
            font-family: monospace;
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        .copy-btn {
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-muted);
            font-size: 0.7rem;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .copy-btn:hover {
            border-color: var(--accent-color);
            color: var(--text-main);
        }

        pre {
            margin: 0;
            padding: 16px;
            font-size: 0.85rem;
            overflow-x: auto;
            color: #d6deeb;
        }

        code {
            font-family: 'Fira Code', 'Cascadia Code', Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
        }

        .input-area {
            padding: 16px 20px 24px 20px;
            background-color: var(--bg-color);
            border-top: 1px solid var(--border-color);
        }

        .input-container {
            position: relative;
            background: var(--input-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 4px;
            transition: all 0.2s;
        }

        .input-container:focus-within {
            border-color: var(--accent-color);
            background: var(--input-bg);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        #messageInput {
            width: 100%;
            background: transparent;
            border: none;
            color: var(--text-main);
            padding: 8px 12px;
            resize: none;
            outline: none;
            font-size: 0.9rem;
            min-height: 44px;
            max-height: 200px;
        }

        .input-footer {
            position: absolute;
            bottom: 8px;
            right: 8px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .send-btn {
            background: var(--user-bubble);
            color: white;
            border: none;
            padding: 6px 16px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.85rem;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .send-btn:hover { opacity: 0.9; }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .footer-note {
            text-align: center;
            font-size: 0.7rem;
            color: var(--text-muted);
            margin-top: 12px;
        }

        .loading-dots {
            display: flex;
            gap: 4px;
            padding: 8px 0;
        }

        .dot {
            width: 6px;
            height: 6px;
            background: var(--text-muted);
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out;
        }

        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
            40% { transform: scale(1); opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="d-flex align-items-center gap-2">
            <div class="message-name" style="font-size: 0.9rem;">
                ${this._commitHash === 'current-changes' ? 'Reviewing Workspace' : 'Commit Analysis'}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
                ${this._commitHash.substring(0, 7)}
            </div>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${message}
        </div>
    </div>

    <div id="chatContainer" class="chat-container"></div>

    <div class="input-area">
        <div class="input-container d-flex align-items-end">
            <textarea id="messageInput" placeholder="Message Kuulto AI..."></textarea>
            <div class="input-footer flex-shrink-0 p-1">
                <button id="sendBtn" class="send-btn" style="padding: 6px 12px;">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.109zM6.732 10.404l3.3 5.155 5.098-12.745-8.398 7.59zm-1.125 1.055L11.516 3.03 2.11 6.766l3.497 4.693z"/>
                    </svg>
                </button>
                <button id="stopBtn" class="send-btn" style="background: #ef4444; display: none; padding: 6px 12px;">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="4" y="4" width="8" height="8" />
                    </svg>
                </button>
            </div>
        </div>
        <div class="footer-note">Kuulto AI can make mistakes. Consider checking important information.</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');

        const md = window.markdownit({
            html: true,
            linkify: true,
            highlight: function (str, lang) {
                // Simplified highlighting for webview
                return '<div class="code-block-container">' +
                       '<div class="code-header"><span>' + (lang || 'code') + '</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>' +
                       '<pre><code>' + md.utils.escapeHtml(str) + '</code></pre></div>';
            }
        });

        // Redirect standard fence rendering to our custom highligh function
        md.renderer.rules.fence = function(tokens, idx) {
            const token = tokens[idx];
            const code = token.content;
            const lang = token.info.trim();
            return md.options.highlight(code, lang);
        };

        window.copyCode = (btn) => {
            const code = btn.closest('.code-block-container').querySelector('code').textContent;
            navigator.clipboard.writeText(code);
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Copied!';
            setTimeout(() => btn.innerHTML = originalText, 2000);
        };

        function getCurrentTime() {
            return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        function setLoading(isLoading) {
            messageInput.disabled = isLoading;
            sendBtn.style.display = isLoading ? 'none' : 'flex';
            stopBtn.style.display = isLoading ? 'flex' : 'none';
        }

        function addMessage(text, isUser) {
            const wrapper = document.createElement('div');
            wrapper.className = 'message-wrapper ' + (isUser ? 'user' : 'ai');

            const avatar = document.createElement('div');
            avatar.className = 'avatar ' + (isUser ? 'user-avatar' : 'ai-avatar');
            if (isUser) {
                avatar.style.backgroundImage = 'url("${userData.avatarUrl}")';
            }

            const content = document.createElement('div');
            content.className = 'message-content';

            const info = document.createElement('div');
            info.className = 'message-info';
            info.innerHTML = \`<span class="message-name">\${isUser ? '${userData.name}' : 'Kuulto AI (Beta)'}</span><span>\${getCurrentTime()}</span>\`;

            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            bubble.innerHTML = isUser ? \`<div class="md-content">\${text}</div>\` : \`<div class="md-content">\${md.render(text)}</div>\`;

            content.appendChild(info);
            content.appendChild(bubble);
            wrapper.appendChild(avatar);
            wrapper.appendChild(content);

            chatContainer.appendChild(wrapper);
            scrollToBottom();
            return bubble;
        }

        function scrollToBottom() { chatContainer.scrollTop = chatContainer.scrollHeight; }

        function sendMessage(textOverride) {
            const text = textOverride || messageInput.value.trim();
            if (!text) return;

            addMessage(text, true);
            if (!textOverride) messageInput.value = '';

            setLoading(true);
            vscode.postMessage({ type: 'sendMessage', text: text });

            // Prepare AI message receiver
            currentAiMessageWrapper = document.createElement('div');
            currentAiMessageWrapper.className = 'message-wrapper ai';

            const aiAvatar = document.createElement('div');
            aiAvatar.className = 'avatar ai-avatar';

            const aiContent = document.createElement('div');
            aiContent.className = 'message-content';

            const aiInfo = document.createElement('div');
            aiInfo.className = 'message-info';
            aiInfo.innerHTML = \`<span class="message-name">Kuulto AI (Beta)</span><span>\${getCurrentTime()}</span>\`;

            currentAiBubble = document.createElement('div');
            currentAiBubble.className = 'bubble';
            currentAiBubble.innerHTML = '<div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';

            aiContent.appendChild(aiInfo);
            aiContent.appendChild(currentAiBubble);
            currentAiMessageWrapper.appendChild(aiAvatar);
            currentAiMessageWrapper.appendChild(aiContent);

            chatContainer.appendChild(currentAiMessageWrapper);
            currentAiText = "";
            scrollToBottom();
        }

        let currentAiBubble = null;
        let currentAiText = "";

        sendBtn.onclick = () => sendMessage();
        stopBtn.onclick = () => {
            vscode.postMessage({ type: 'stopGeneration' });
            setLoading(false);
        };

        messageInput.oninput = function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            scrollToBottom();
        };

        messageInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };

        const initialPrompt = \`${JSON.stringify(initialPrompt || 'Please summarize this commit.')}\`;
        setTimeout(() => sendMessage(initialPrompt), 300);

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'receiveToken') {
                if (currentAiBubble) {
                    if (currentAiText === "") currentAiBubble.innerHTML = "";
                    currentAiText += msg.token;
                    currentAiBubble.innerHTML = '<div class="md-content">' + md.render(currentAiText) + '</div>';
                    scrollToBottom();
                }
            } else if (msg.type === 'streamComplete') {
                setLoading(false);
                currentAiBubble = null;
            } else if (msg.type === 'error') {
                const err = document.createElement('div');
                err.className = 'alert alert-danger mx-3 p-2 small rounded-3';
                err.textContent = 'Error: ' + msg.message;
                chatContainer.appendChild(err);
                if (currentAiBubble) currentAiBubble.remove();
                setLoading(false);
            }
        });
    </script>
</body>
</html>`;
  }
}
