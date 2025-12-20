# GitOrbit: Simple & Smart Git Management

**GitOrbit** is a lightweight Git extension designed to simplify your daily workflow. It focuses on making Git management straightforward while providing helpful AI-powered tools for commit messages, code analysis, and interactive assistance.

## 🚀 Helpful AI Assistance

Instead of overwhelming you, GitOrbit provides targeted AI features to help you keep your repository clean and your workflow smooth:

- **💬 Conversational AI Chat:** Ask questions about your changes or specific commits. It's like having a teammate to help you understand complex diffs.
- **✨ Smart Commit Messages:** Let AI suggest professional commit messages based on your changes, saving you time and keeping your history readable.
- **🔍 Simple Code Smell Detection:** Quickly scan your changes for potential improvements or bugs before you commit.
- **🌍 Flexible AI Providers:** Connect to your preferred model via **OpenRouter, Google Gemini, OpenAI, Anthropic, or xGrok**.

## 🛠️ Streamlined Git Management

Everything you need to manage your repository without the complexity.

- **📂 Modern Changes Panel:** Stage, unstage, and commit with surgical precision. One-click "Discard All" and "Undo Last Commit" keep you in control.
- **🌳 Beautiful Commit Graph:** Navigate your project's soul. An interactive, crystal-clear visualization of your entire history.
- **📜 File History:** Automatically tracks the active file to show its commit history. Works seamlessly even with preview files.
- **🌱 Branch Management:** Visualize Local and Remote branches with folder grouping. Create, delete, push, pull, and sync branches effortlessly.
- **📦 Stash Explorer:** View stashes and inspect their contents with **Multi-file Diff** support. Apply, pop, or drop stashes with a click.
- **🚀 Gitflow Integration:** Start features and hotfixes quickly with configurable prefixes.

## Editor Enhancements

- **Inline Blame:** Unobtrusive ghost text showing the author and relative time for the current line.
- **Gutter Indicators:** Visual heatmap status indicators in the editor gutter.
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
