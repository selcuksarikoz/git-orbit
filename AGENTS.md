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

## Testing

- **Test Structure**: Every source file must have a corresponding test file in `src/__test__/` maintaining the same directory structure.
  - `src/services/GitService.ts` → `src/__test__/services/GitService.test.ts`
  - `src/providers/TreeProvider.ts` → `src/__test__/providers/TreeProvider.test.ts`
  - `src/panels/Panel.ts` → `src/__test__/panels/Panel.test.ts`
  - `src/utils/helper.ts` → `src/__test__/utils/helper.test.ts`
- **Test Coverage**: When modifying any source file, always check if a corresponding test file exists. If not, create one following the existing test patterns in that directory.
- **Run Tests**: After any code changes, always run `npx vitest run` to verify all tests pass.

## AI Response Guidelines

- **Build**: Only run build once if user explicitly requests it. Do not auto-run builds after every change.
- **Response Length**: Always keep responses short and concise. Avoid unnecessary explanations.
