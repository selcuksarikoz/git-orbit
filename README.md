# GitOrbit

**GitOrbit** is built by developers for developers who want a high-performance, modular, and intuitive Git experience directly within VS Code. It focuses on maintaining your development flow by providing essential Git tools without the unnecessary bloat.

## 🚀 Streamlined Productivity

GitOrbit is designed to handle everything from complex branch hierarchies to granular line-by-line blame, all while feeling like a native part of your editor. Whether you are managing stashes or exploring deep commit histories, GitOrbit stays out of your way and lets you focus on your code.

## Features

- **Side Bar Views:**
  - **Branches:** Local and Remote branches grouped by folders.
  - **Graph:** All commits across all branches with hierarchical file exploration.
  - **Commits:** Paginated commit history for the current branch.
  - **File History:** History of the active file in the editor.
  - **Stashes:** List and manage your stashes. Now includes **file diff previews** on click and **Multi-file Diff** support for viewing entire stash changes.
- **Gitflow Integration:** Easily start features and hotfixes with configurable prefixes.
- **Editor Enhancements:**
  - **Inline Blame:** Subtle ghost text (`editorGhostText`) showing authorship info on the current line. Automatically filtered for empty lines and optimized for rapid navigation.
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
