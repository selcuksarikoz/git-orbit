import * as vscode from "vscode";
import { GitService } from "../services/GitService";
import { AIService } from "../services/AIService";
import { CoreMessage } from "ai";

export class CommitChatPanel {
  public static currentPanel: CommitChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _commitHash: string;
  private _messages: CoreMessage[] = [];
  private _currentAbortController: AbortController | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    commitHash: string,
    author: string,
    message: string,
    diff: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._commitHash = commitHash;

    // Set the webview's initial html content
    this._update(author, message);

    // Initial system prompt setup
    const systemPrompt = `You are a helpful AI assistant analyzing a specific git commit.
Commit Details:
Hash: ${commitHash}
Author: ${author}
Message: ${message}

Diff/Changes:
${diff.substring(0, 20000)} ${diff.length > 20000 ? "...(truncated)" : ""}

Your goal is to answer questions about this commit. 
Start by providing a concise summary of the changes if the user hasn't asked a specific question yet (though the UI might initiate the chat).
When replying, use markdown for formatting code blocks. Be concise.`;

    // Listen for messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "sendMessage":
            const userText = message.text;
            this._messages.push({ role: "user", content: userText });

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

              let fullResponse = "";
              for await (const chunk of stream.textStream) {
                // Send chunk to webview
                fullResponse += chunk;
                this._panel.webview.postMessage({
                  type: "receiveToken",
                  token: chunk,
                });
              }

              this._panel.webview.postMessage({ type: "streamComplete" });
              this._messages.push({ role: "assistant", content: fullResponse });
            } catch (e: any) {
              if (e.name !== "AbortError") {
                this._panel.webview.postMessage({
                  type: "error",
                  message: e.message,
                });
              }
            } finally {
              this._currentAbortController = null;
            }
            return;

          case "stopGeneration":
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
    message: string
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Fetch diff for context
    let diff = "";
    try {
      diff = await GitService.getInstance().getCommitDiff(commitHash);
    } catch (e) {
      diff = "Could not fetch diff.";
    }

    // If we already have a panel, show it?
    // Actually, for a *new* commit chat, we probably want a new panel or replace the existing one.
    // Let's create a new one for specific commit context to avoid confusion, or reuse if same commit.
    if (
      CommitChatPanel.currentPanel &&
      CommitChatPanel.currentPanel._commitHash === commitHash
    ) {
      CommitChatPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise create new
    const panel = vscode.window.createWebviewPanel(
      "chatWithCommit",
      `Chat: ${commitHash.substring(0, 7)}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "assets")],
      }
    );

    CommitChatPanel.currentPanel = new CommitChatPanel(
      panel,
      extensionUri,
      commitHash,
      author,
      message,
      diff
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

  private _update(author: string, message: string) {
    this._panel.webview.html = this._getHtmlForWebview(author, message);
  }

  private _getHtmlForWebview(author: string, message: string) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net;">
    
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js"></script>
    
    <title>Commit Chat</title>
    <style>
        :root {
            --bs-body-bg: var(--vscode-editor-background);
            --bs-body-color: var(--vscode-editor-foreground);
            --bs-primary: var(--vscode-button-background);
            --bs-border-color: var(--vscode-panel-border);
            --bs-tertiary-bg: var(--vscode-editor-inactiveSelectionBackground);
        }
        
        body { background: var(--bs-body-bg); color: var(--bs-body-color); height: 100vh; font-size: 0.875rem; }
        
        /* VS Code Specific Theme Fixes */
        .card { background-color: var(--bs-tertiary-bg); border-color: var(--bs-border-color); color: inherit; }
        .user-msg { background-color: var(--vscode-button-background) !important; color: var(--vscode-button-foreground) !important; border: none; }
        
        .form-control { background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border-color: var(--vscode-input-border); }
        .form-control:focus { background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); box-shadow: none; border-color: var(--vscode-focusBorder); }
        .form-control::placeholder { color: var(--vscode-input-placeholderForeground); opacity: 0.7; }
        .form-control:disabled { opacity: 0.6; background-color: var(--vscode-input-background) !important; color: var(--vscode-input-foreground) !important; }

        .chat-container { flex: 1; overflow-y: auto; }
        .copy-btn { position: absolute; bottom: 8px; right: 12px; display: none; font-size: 0.7rem; }
        .finished .copy-btn { display: block; }
        
        /* Markdown rendering fixes for dark themes */
        pre { background: var(--vscode-textBlockQuote-background); padding: 10px; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid var(--bs-border-color); padding: 8px; }

        .loading-dots span {
            animation: blink 1.4s infinite both;
            height: 6px; width: 6px; background-color: currentColor;
            border-radius: 50%; display: inline-block; margin: 0 1px;
        }
        @keyframes blink { 0% { opacity: 0.2; } 20% { opacity: 1; } 100% { opacity: 0.2; } }
    </style>
</head>
<body class="d-flex flex-column m-0">
    <div class="header p-3 border-bottom shadow-sm" style="background: var(--vscode-sideBarSectionHeader-background);">
        <div class="small opacity-75 mb-0" style="font-size: 0.75rem;">Commit ${this._commitHash.substring(
          0,
          7
        )} &bull; ${author}</div>
        <div class="fw-bold text-truncate" style="font-size: 0.9rem;">${message}</div>
    </div>
    
    <div id="chatContainer" class="chat-container p-4 d-flex flex-column gap-2"></div>

    <div class="input-area p-4 border-top">
        <div class="d-flex gap-2">
            <textarea id="messageInput" class="form-control rounded-3" placeholder="Ask about this commit..." rows="1" style="min-height: 38px;"></textarea>
            <button id="sendBtn" class="btn btn-primary rounded-3 px-4 fw-bold shadow-sm" style="font-size: 0.8rem;">Send</button>
            <button id="stopBtn" class="btn btn-danger rounded-3 px-4 fw-bold shadow-sm" style="font-size: 0.8rem; display: none;">Stop</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');
        const md = window.markdownit({ html: true, linkify: true });

        messageInput.focus();
        let currentAiMessageDiv = null;
        let currentAiText = "";

        function setLoading(isLoading) {
            messageInput.disabled = isLoading;
            sendBtn.style.display = isLoading ? 'none' : 'block';
            stopBtn.style.display = isLoading ? 'block' : 'none';
            if (!isLoading) messageInput.focus();
        }

        function createCopyBtn(textFn) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-sm btn-outline-secondary copy-btn rounded-2';
            btn.innerHTML = 'Copy';
            btn.onclick = () => {
                navigator.clipboard.writeText(textFn());
                btn.innerHTML = 'Copied!';
                btn.classList.replace('btn-outline-secondary', 'btn-success');
                setTimeout(() => {
                    btn.innerHTML = 'Copy';
                    btn.classList.replace('btn-success', 'btn-outline-secondary');
                }, 2000);
            };
            return btn;
        }

        function addMessage(text, isUser) {
            const wrapper = document.createElement('div');
            wrapper.className = isUser 
                ? 'card user-msg p-2 px-3 rounded-4 shadow-sm align-self-end text-end' 
                : 'card ai-msg p-2 px-3 rounded-4 shadow-sm align-self-start position-relative finished';
            wrapper.style.maxWidth = '85%';
            
            if (isUser) {
                wrapper.textContent = text;
            } else {
                wrapper.innerHTML = '<div class="md-content">' + md.render(text) + '</div>';
                wrapper.appendChild(createCopyBtn(() => text));
            }
            
            chatContainer.appendChild(wrapper);
            scrollToBottom();
            return wrapper;
        }

        function scrollToBottom() { chatContainer.scrollTop = chatContainer.scrollHeight; }

        function sendMessage(textOverride) {
            const text = textOverride || messageInput.value.trim();
            if (!text) return;
            addMessage(text, true);
            if (!textOverride) messageInput.value = '';
            messageInput.style.height = '38px';
            setLoading(true);
            vscode.postMessage({ type: 'sendMessage', text: text });
            
            currentAiMessageDiv = document.createElement('div');
            currentAiMessageDiv.className = 'card ai-msg p-2 px-3 rounded-4 shadow-sm align-self-start position-relative';
            currentAiMessageDiv.style.maxWidth = '85%';
            currentAiMessageDiv.innerHTML = '<div class="loading-dots py-2"><span></span><span></span><span></span></div>';
            chatContainer.appendChild(currentAiMessageDiv);
            currentAiText = "";
            scrollToBottom();
        }

        sendBtn.onclick = () => sendMessage();
        stopBtn.onclick = () => {
            vscode.postMessage({ type: 'stopGeneration' });
            setLoading(false);
            if (currentAiMessageDiv) {
                currentAiMessageDiv.classList.add('finished');
                if (!currentAiMessageDiv.querySelector('.copy-btn')) {
                    currentAiMessageDiv.appendChild(createCopyBtn(() => currentAiText));
                }
                currentAiMessageDiv = null;
            }
        };

        messageInput.oninput = function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        };

        messageInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };

        setTimeout(() => sendMessage("Please summarize this commit."), 300);

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'receiveToken') {
                if (currentAiMessageDiv) {
                    if (currentAiText === "") currentAiMessageDiv.innerHTML = "";
                    currentAiText += msg.token;
                    currentAiMessageDiv.innerHTML = '<div class="md-content">' + md.render(currentAiText) + '</div>';
                    // Re-add copy button if it was removed by innerHTML update
                    if (!currentAiMessageDiv.querySelector('.copy-btn')) {
                        currentAiMessageDiv.appendChild(createCopyBtn(() => currentAiText));
                    }
                    scrollToBottom();
                }
            } else if (msg.type === 'streamComplete') {
                if (currentAiMessageDiv) {
                    currentAiMessageDiv.classList.add('finished');
                    currentAiMessageDiv = null;
                }
                setLoading(false);
            } else if (msg.type === 'error') {
                const err = document.createElement('div');
                err.className = 'alert alert-danger mx-3 p-2 small rounded-3';
                err.textContent = 'Error: ' + msg.message;
                chatContainer.appendChild(err);
                if (currentAiMessageDiv) currentAiMessageDiv.remove();
                setLoading(false);
            }
        });
    </script>
</body>
</html>`;
  }
}
