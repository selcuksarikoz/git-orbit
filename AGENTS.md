# AI Coding Guidelines

## Core Principles

1. **SOLID**: Adhere strictly. Single Responsibility is paramount. Encapsulate logic within specialized Services or Providers.
2. **DRY (Don't Repeat Yourself)**:
   - Identify repeated logic patterns immediately.
   - Refactor duplicates into `src/utils` or shared methods in `src/services` before implementing new features.
   - Never copy-paste code blocks > 3 lines.

## Code Quality

- **Language**: TypeScript. Use strict typing; avoid `any` unless absolutely necessary.
- **Comments**: Use only JSDoc/DocBlock or concise single-line comments. English only. Explain "Why", not "What". Remove legacy/commented-out code.
- **Error Handling**: Use `try/catch`. Fail gracefully. Show user-friendly errors via `vscode.window.showErrorMessage` only when action is required.
- **Async**: Use `async/await` pattern.

## Architecture

- **Services (`src/services`)**: Singleton pattern for core logic (Git, AI, Auth).
- **Providers (`src/providers`)**: VS Code UI data providers (TreeViews, DocumentContent).
- **Utils (`src/utils`)**: Pure functions and helpers.

## Optimization

- Prioritize performance. Cache expensive calls (e.g., git commands) using `@memoize`.
- Debounce file system watchers and UI updates.
