# GitOrbit

**GitOrbit** is a professional, high-performance Git extension for VS Code designed to keep you in flow. It provides a comprehensive suite of Git tools—from detailed history graphs to seamless Gitflow integration—without the bloat.

## Quick Features

- **📂 Changes Panel:** View, stage, unstage, and commit changes instantly with a modern UI. Includes robust "Discard All" and "Undo Last Commit" actions.
- **🌳 Commit Graph:** Visualize your repository's history with an interactive, filterable graph. Click on commits to see hierarchical file changes.
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

- `GitOrbit: Cherry Pick` - Cherry pick commits easily.
- `GitOrbit: Checkout Commit` - Checkout any commit in a detached HEAD state.
- `GitOrbit: Create Branch...` - Create new branches from current HEAD.
- `GitOrbit: Refresh Views` - Manually refresh all GitOrbit views.
- `GitOrbit: Create Remote Branch...` - Push a new branch to remote directly.

## Configuration

Customize your experience in VS Code Settings:

- `gitorbit.blame.inline.enabled`: Toggle inline blame ghost text on/off.
- `gitorbit.gitflow.featurePrefix`: Prefix for feature branches (default: `feature/`).
- `gitorbit.gitflow.hotfixPrefix`: Prefix for hotfix branches (default: `hotfix/`).
- `gitorbit.views.commitLimit`: Initial number of commits to load in lists.
- `gitorbit.sync.autoSyncInterval`: Interval (in minutes) for auto-fetching changes.

## Feedback & Support

Found a bug or have a suggestion? Please open an issue on our [GitHub Repository](https://github.com/selcuk-sarikoz/git-orbit).

---

**Enjoying GitOrbit?** Leave a rating on the Marketplace!
