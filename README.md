# GitOrbit: Simple & Smart Git Management

**GitOrbit** is your ultimate Git management tool, designed to streamline your development workflow. While it serves as a powerful Git client, it also enhances your productivity with optional AI-powered features for smarter commits, code analysis, and interactive assistance.

## 🚀 Intelligent AI Features (BYO Keys)

GitOrbit empowers you with AI tools without hidden costs. Simply plug in your own API keys from providers like **OpenRouter, Google Gemini, OpenAI, Anthropic, or xGrok**.

- **💬 Conversational AI:** Chat with your codebase context. Ask about specific commits or changes to understand complex diffs instantly.
- **✨ Smart Commit Messages:** Generate professional, descriptive commit messages from your changes in one click.
- **🔍 Code Smell Detection:** Proactively identify potential issues and technical debt in your staged changes before committing.
- **💸 No Extra Fees:** You only pay your AI provider directly (if applicable) – GitOrbit itself adds no surcharge.

## 🛠️ Comprehensive Git Manager

GitOrbit is first and foremost a robust Git client within VS Code.

- **📂 Modern Changes Panel:** Stage, unstage, and commit with precision. Includes "Discard All" and "Undo Last Commit" actions.
- **📉 Commit History:** A list-based view of your repository's history (Interactive Visual Graph **coming soon**!).
- **📜 File History:** Automatically tracks the active file to show its complete commit lifecycle.
- **🌱 Branch Management:** Easily manage Local and Remote branches. Create, delete, push, pull, and sync with folder grouping support.
- **📦 Stash Explorer:** Inspect stash contents with **Multi-file Diff** support and manage them effortlessly.
- **🚀 Gitflow Shortcuts:** Quickly start features and hotfixes with standard naming conventions.

## Editor Enhancements

- **Inline Blame:** Unobtrusive ghost text showing the author and relative time for the current line.

- **CodeLens:** Authorship summaries at the top of files and functions.

## Commands

Access these commands via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) or Context Menus:

- `GitOrbit: Chat with AI` - Ask about a specific commit or your current changes.
- `GitOrbit: Check for Code Smells` - Analyze your active workspace for issues.
- `GitOrbit: Cherry Pick` - Cherry pick commits easily.
- `GitOrbit: Checkout Commit` - Checkout any commit in a detached HEAD state.
- `GitOrbit: Create Branch...` - Create new branches from current HEAD.
- `GitOrbit: Refresh Views` - Manually refresh all GitOrbit views.
- `GitOrbit: Create Remote Branch...` - Push a new branch to remote directly.

## Configuration

Customize your experience in VS Code Settings:

- `gitorbit.ai.provider`: Choose your AI provider (OpenRouter, Google Gemini, OpenAI, Anthropic, xGrok).
- `gitorbit.ai.model`: Select the specific model (e.g., `openai/gpt-4o-mini`).
- `gitorbit.ai.apiKey`: Unified API key for the chosen provider.
- `gitorbit.blame.inline.enabled`: Toggle inline blame ghost text on/off.
- `gitorbit.sync.autoSyncInterval`: Interval (in minutes) for auto-fetching changes.

## Feedback & Support

Found a bug or have a suggestion? Please open an issue on our [GitHub Repository](https://github.com/selcuksarikoz/git-orbit).

---

**Enjoying GitOrbit?** Leave a rating on the Marketplace!
