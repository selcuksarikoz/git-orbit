<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=selcuksarikoz.gitorbit">
    <img src="https://img.shields.io/visual-studio-marketplace/v/selcuksarikoz.gitorbit?label=Install%20GitOrbit&style=for-the-badge&logo=visual-studio-code&color=007ACC" alt="Install on Marketplace">
  </a>
  <a href="https://open-vsx.org/extension/selcuksarikoz/gitorbit">
    <img src="https://img.shields.io/open-vsx/v/selcuksarikoz/gitorbit?style=for-the-badge&label=Open%20VSX&color=AC3DFF" alt="Open VSX">
  </a>
</p>

<h1 align="center">🚀 GitOrbit</h1>
<p align="center"><strong>Complete Git Workflow Manager for VS Code — with Multi-Repository Support</strong></p>

---

## What is GitOrbit?

GitOrbit is a powerful Git management extension that brings all essential Git operations into VS Code with an intuitive interface. **Full support for multiple Git repositories** — work with nested repos, mono-repos, or multi-root workspaces seamlessly. Features include visual git graph, bisect wizard, blame annotations, branch management, and more.

---

## 🔥 Features

### 🔍 Git Bisect Wizard

- **Visual bisect interface** — Find bugs with guided good/bad commit selection
- **Branch & commit picker** — Select from local/remote branches or enter custom refs
- **Auto-stash support** — Automatically stashes uncommitted changes before bisect
- **Bisect log view** — Track your bisect progress in the Changes panel

### 🌳 Visual Git Graph

- Beautiful commit visualization
- **Multi-repo aware**: Graph updates based on selected repository
- Branch and merge tracking
- Filter by author, message, or date
- Context menu actions (cherry-pick, checkout, reset, revert)

### 📋 Copy Commit Details

Right-click any commit to copy:

- Commit Hash
- Commit Message
- Author Name & Email
- Commit Date
- GitHub/Remote URL

### 📝 Blame Annotations

- **Inline blame** — See author info next to each line
- **Gutter heatmap** — Visual age indicator for code
- **File blame view** — Full file annotation

### 🔀 Branch Management

- Local & remote branch views — per repository
- **Multi-repo support**: Each repository has its own branch view
- Git Flow support (feature, release, hotfix)
- Create, checkout, merge, delete branches
- Push, pull, sync operations for all repos or selected repo

### 📦 Stash Management

- Save, apply, pop, drop stashes — per repository
- View stash contents from all repos in one panel

### 🏷️ Tags & Contributors

- Tag listing and creation per repository
- Contributor statistics across all repos
- Open GitHub profiles

### 🔗 Pull Requests

- View open PRs from GitHub — grouped by repository
- Create PRs for any repository in your workspace
- Open PR details in VS Code or browser
- Multi-account support: each repo can use different GitHub accounts

### 📁 Multi-Repository & Multi-Account Support ⭐

- **Work with unlimited Git repositories** in a single workspace
- **Nested repository detection**: Finds repos at any depth (e.g., `root/` and `root/subrepo/`)
- **Repository selection**: Click any repo in Changes panel to switch context — all views update
- **Per-repository operations**: Stage, commit, push, pull per repo or all at once
- **Multi-account support**: Each repository can use different GitHub/GitLab accounts
- **Mono-repo & micro-frontend friendly**: Perfect for complex project structures

### ⏪ Interactive Rebase

- Visual rebase editor
- Reorder, squash, edit commits

### 🧠 Optional AI Features

- Smart commit message suggestions
- Code smell detection
- Works with OpenAI, Gemini, Anthropic, or Kuulto AI

---

## ⚙️ Settings

| Setting                          | Description                        |
| -------------------------------- | ---------------------------------- |
| `gitorbit.blame.inline.enabled`  | Show inline blame text             |
| `gitorbit.blame.gutter.enabled`  | Show gutter blame heatmap          |
| `gitorbit.blame.file.enabled`    | Enable file blame view             |
| `gitorbit.sync.autoSyncInterval` | Auto-fetch interval (minutes)      |
| `gitorbit.general.selectedRepo`  | Currently selected repository path |

---

## 💡 Quick Start

### Single Repository

1. Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=selcuksarikoz.gitorbit)
2. Open a Git repository
3. Click the GitOrbit icon in the Activity Bar
4. Start managing your Git workflow!

### Multiple Repositories (Mono-repo / Multi-root)

1. Open a workspace containing multiple Git repositories
2. GitOrbit automatically detects all repos (including nested ones)
3. Click any repository header in the **Changes** panel to select it
4. All views (Branches, Commits, Graph) automatically update to show the selected repo
5. Work with each repository independently — different accounts supported!

---

## 📣 Feedback

Found a bug or have a feature request?
Open an issue on [GitHub](https://github.com/selcuksarikoz/git-orbit).

---

<p align="center">
  <strong>☕ Enjoying GitOrbit? <a href="https://buymeacoffee.com/funnyturkishdude">Buy me a coffee</a> or leave a rating on the <a href="https://marketplace.visualstudio.com/items?itemName=selcuksarikoz.gitorbit">Marketplace</a>!</strong>
</p>
