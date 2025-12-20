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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdn.jsdelivr.net;">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <title>Commit Chat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .header {
            padding: 10px 15px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .commit-info {
            font-size: 13px;
            margin-bottom: 4px;
        }
        .commit-message {
            font-weight: bold;
            font-size: 14px;
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .message {
            max-width: 85%;
            padding: 8px 12px;
            border-radius: 6px;
            line-height: 1.4;
            word-wrap: break-word;
            position: relative;
        }
        .message.user {
            align-self: flex-end;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .message.ai {
            align-self: flex-start;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-widget-border);
            padding-bottom: 25px; /* space for copy button */
            min-width: 40px; /* Ensure loading spinner has space */
        }
        .message.ai p { margin: 0 0 10px 0; }
        .message.ai p:last-child { margin: 0; }
        .message.ai pre { 
            background: var(--vscode-textBlockQuote-background); 
            padding: 10px; 
            border-radius: 4px; 
            overflow-x: auto; 
            margin: 5px 0;
        }
        .message.ai code { font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
        
        .copy-btn {
            position: absolute;
            bottom: 5px;
            right: 5px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-widget-border);
            cursor: pointer;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            display: none;
            z-index: 10;
        }
        .copy-btn:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        .message.ai.finished .copy-btn { display: block; }
        
        .input-area {
            padding: 15px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 10px;
            align-items: flex-end;
        }
        textarea {
            flex: 1;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            resize: none;
            min-height: 40px;
            height: 40px; /* Initial height */
            max-height: 120px;
            font-family: inherit;
            line-height: 1.4;
            overflow-y: auto;
            box-sizing: border-box;
        }
        textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
        textarea:disabled { opacity: 0.6; cursor: not-allowed; }

        .action-btn {
            height: 40px;
            padding: 0 15px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }
        .action-btn:hover { background-color: var(--vscode-button-hoverBackground); }
        .action-btn.stop { background-color: var(--vscode-errorForeground); color: white; }
        
        /* Loading dots */
        .loading { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; }
        .loading span {
            animation: blink 1.4s infinite both;
            height: 6px; width: 6px; background-color: var(--vscode-editor-foreground);
            border-radius: 50%; display: inline-block;
        }
        .loading span:nth-child(2) { animation-delay: 0.2s; }
        .loading span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes blink { 0% { opacity: 0.2; } 20% { opacity: 1; } 100% { opacity: 0.2; } }

    </style>
</head>
<body>
    <div class="header">
        <div class="commit-info">
            <span style="opacity: 0.8;">Commit ${this._commitHash.substring(
              0,
              7
            )} by ${author}</span>
        </div>
        <div class="commit-message">${message}</div>
    </div>
    
    <div class="chat-container" id="chatContainer"></div>

    <div class="input-area">
        <textarea id="messageInput" placeholder="Ask about this commit..." rows="1"></textarea>
        <button id="sendBtn" class="action-btn">Send</button>
        <button id="stopBtn" class="action-btn stop" style="display: none;">Stop</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        messageInput.focus();

        let currentAiMessageDiv = null;
        let currentAiText = "";

        function setLoading(isLoading) {
            messageInput.disabled = isLoading;
            if (isLoading) {
                sendBtn.style.display = 'none';
                stopBtn.style.display = 'flex';
            } else {
                sendBtn.style.display = 'flex';
                stopBtn.style.display = 'none';
                messageInput.focus();
            }
        }

        function createCopyBtn(textFn) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(textFn());
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.textContent = 'Copy', 2000);
            };
            return copyBtn;
        }

        function addMessage(text, isUser) {
            const div = document.createElement('div');
            div.className = 'message ' + (isUser ? 'user' : 'ai');
            div.classList.add('finished'); // Static messages are finished
            
            if (isUser) {
                div.textContent = text;
            } else {
                div.innerHTML = renderMarkdown(text);
                div.appendChild(createCopyBtn(() => text));
            }
            chatContainer.appendChild(div);
            scrollToBottom();
            return div;
        }

        function renderMarkdown(text) {
             return typeof marked !== 'undefined' ? marked.parse(text) : text;
        }

        function scrollToBottom() {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function sendMessage(textOverride) {
            const text = textOverride || messageInput.value.trim();
            if (!text) return;

            addMessage(text, true);
            if (!textOverride) messageInput.value = '';
            
            // Reset height
            messageInput.style.height = 'auto';
            messageInput.style.height = '40px';
            
            setLoading(true);
            vscode.postMessage({ type: 'sendMessage', text: text });
            
            // Placeholder with loading spinner
            currentAiMessageDiv = document.createElement('div');
            currentAiMessageDiv.className = 'message ai';
            currentAiMessageDiv.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
            
            chatContainer.appendChild(currentAiMessageDiv);
            currentAiText = "";
            scrollToBottom();
        }

        function stopGeneration() {
            vscode.postMessage({ type: 'stopGeneration' });
            setLoading(false);
            if (currentAiMessageDiv) {
                currentAiMessageDiv.classList.add('finished');
                // Ensure copy button is added if it wasn't already (e.g., if stream stopped before first token)
                if (!currentAiMessageDiv.querySelector('.copy-btn')) {
                    currentAiMessageDiv.appendChild(createCopyBtn(() => currentAiText));
                }
                currentAiMessageDiv = null;
            }
        }

        sendBtn.addEventListener('click', () => sendMessage());
        stopBtn.addEventListener('click', stopGeneration);
        
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.value === '') this.style.height = '40px';
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        setTimeout(() => sendMessage("Please summarize this commit."), 300);

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'receiveToken':
                    if (currentAiMessageDiv) {
                        if (currentAiText === "") {
                             currentAiMessageDiv.innerHTML = ""; // Clear loading spinner
                        }
                        currentAiText += message.token;
                        if (typeof marked !== 'undefined') {
                            const contentHtml = marked.parse(currentAiText);
                            currentAiMessageDiv.innerHTML = contentHtml;
                            currentAiMessageDiv.appendChild(createCopyBtn(() => currentAiText));
                        } else {
                            currentAiMessageDiv.textContent = currentAiText;
                        }
                        scrollToBottom();
                    }
                    break;
                case 'streamComplete':
                    if (currentAiMessageDiv) {
                        currentAiMessageDiv.classList.add('finished');
                        currentAiMessageDiv = null;
                    }
                    setLoading(false);
                    currentAiText = "";
                    break;
                case 'error':
                    const errDiv = document.createElement('div');
                    errDiv.className = 'message ai';
                    errDiv.style.color = 'red';
                    errDiv.textContent = 'Error: ' + message.message;
                    chatContainer.appendChild(errDiv);
                    
                    if (currentAiMessageDiv) currentAiMessageDiv.remove(); // Remove partial
                    currentAiMessageDiv = null;
                    setLoading(false);
                    break;
            }
        });
    </script>
</body>
</html>`;
  }
}
