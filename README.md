<p align="center">
  <img src="https://raw.githubusercontent.com/selcuksarikoz/git-orbit/main/assets/icons/logo.png" alt="GitOrbit Logo" width="150">
</p>

<h1 align="center">GitOrbit</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=selcuksarikoz.gitorbit">
    <img src="https://vs-marketplace-badge.apphb.com/version-short/selcuksarikoz.gitorbit.svg" alt="Version">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=selcuksarikoz.gitorbit">
    <img src="https://vs-marketplace-badge.apphb.com/installs-short/selcuksarikoz.gitorbit.svg" alt="Installs">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=selcuksarikoz.gitorbit">
    <img src="https://vs-marketplace-badge.apphb.com/rating-short/selcuksarikoz.gitorbit.svg" alt="Rating">
  </a>
</p>

<p align="center">
  <strong>A robust, native Git client for VS Code, supercharged with AI to improve your developer experience.</strong>
</p>

---

I built GitOrbit because, frankly, VS Code's native Git features just weren't cutting it for me anymore.

I found myself constantly switching between VS Code for coding and heavy external clients for managing complex branches, histories, and stashes. I needed a tool that handled Git the way a dedicated manager should—but right inside my editor.

So, I built GitOrbit to fill that gap between basic terminal commands and bloated external apps. It’s lightweight, efficient, and built by a dev for devs.

## The AI Advantage 🤖

Supercharge your workflow with optional AI features. Crucially, GitOrbit adds no surcharge—you only connect and pay your AI provider directly (if applicable). BYO keys for providers like **OpenRouter, Google Gemini, OpenAI, Anthropic, or xGrok**.

- **💬 Conversational AI:** Chat with your codebase context. Don't understand a complex diff? Just ask the AI to explain specific commits or changes instantly.
- **✨ Smart Commit Messages:** Stop writing "fixes thing". Generate professional, descriptive commit messages from your staged changes in one click.
- **🔍 Proactive Code Smell Detection:** Identify potential issues and technical debt in your staged changes before you commit.

## A Solid Git Foundation 🛠️

AI aside, it’s first and foremost a comprehensive Git manager:

- **👤 Inline Blame:** Instantly see who changed what and when (author, date, and commit message) right next to your code line.
- **📂 Modern Changes Panel:** Precision staging/unstaging. Includes essential "Discard All" and "Undo Last Commit" actions.
- **🌱 Advanced Branch Management:** Easily manage Local and Remote branches. Sync, push, pull, and organize with folder grouping support.
- **📦 Stash Explorer:** Inspect stash contents quickly with Multi-file Diff support.
- **📜 Deep History Views:** Automatic active file history tracking and a list-based repo history (**Interactive Visual Graph coming soon!**).
- **🚀 Gitflow Shortcuts:** Quickly start features and hotfixes with standard naming conventions.

## Other Features

- **CodeLens:** Authorship summaries at the top of files and functions.

## Commands

Access these commands via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) or Context Menus:

- `GitOrbit: Chat with AI` - Ask about a specific commit or your current changes.
- `GitOrbit: Generate Commit Message` - Generate a smart commit message for your staged changes.
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

I’d love to hear your feedback! Found a bug or have a suggestion? Please open an issue on our [GitHub Repository](https://github.com/selcuksarikoz/git-orbit).

---

**Enjoying GitOrbit?** Leave a rating on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=selcuksarikoz.gitorbit)!
