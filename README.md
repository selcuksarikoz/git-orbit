# GitOrbit

**GitOrbit** is a professional, modular, and high-performance Git extension for VS Code.

## 📜 Usage & License

GitOrbit is provided for **free** for all personal and professional use. However, it is **not open-source**.

- **Usage:** Free to download and use.
- **Restrictions:** Redistribution, copying/modifying the source code, or creating derivative works is strictly prohibited.
- See the [LICENSE](./LICENSE) file for full terms.

## Features

- **Side Bar Views:**
  - **Branches:** Local and Remote branches grouped by folders.
  - **Graph:** All commits across all branches with hierarchical file exploration.
  - **Commits:** Paginated commit history for the current branch.
  - **File History:** History of the active file in the editor.
  - **Stashes:** List and manage your stashes.
- **Gitflow Integration:** Easily start features and hotfixes with configurable prefixes.
- **Editor Enhancements:**
  - **Inline Blame:** Ghost text showing authorship info on the current line.
  - **CodeLens:** Authorship summary at the top of functions.
  - **Gutter Blame:** Visual heatmap of file changes.
- **Welcome Page:** Beautiful onboarding experience for new users.

## Configuration

Customizable via VS Code settings:

- `gitorbit.blame.inline.enabled`: Toggle inline blame ghost text.
- `gitorbit.gitflow.featurePrefix`: Default prefix for features (default: `feature/`).
- `gitorbit.gitflow.hotfixPrefix`: Default prefix for hotfixes (default: `hotfix/`).
- `gitorbit.views.commitLimit`: Number of commits to load initially.

## Architecture

Built with a clean, modular architecture:

- **Command Pattern:** Each command is encapsulated in its own class.
- **Dependency Injection:** Services are managed as singletons.
- **Strict TypeScript:** Type safety throughout the codebase.

## Getting Started

1. Open the "GitOrbit" view in the Activity Bar.
2. Use the context menus to Cherry Pick or start new Gitflow branches.
3. Configure your preferences in Settings.
