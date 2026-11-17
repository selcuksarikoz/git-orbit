import * as vscode from 'vscode';
import { GitRepository } from '../services/GitService';

export interface ChangeEntry {
  path: string;
  status: string;
  repo: GitRepository;
}

/**
 * A directory node shown when the Changes view is in "tree" mode.
 * It carries enough state for the provider to rebuild its children on expand.
 */
export class FolderItem extends vscode.TreeItem {
  constructor(
    public readonly dirPath: string,
    public readonly repo: GitRepository | undefined,
    public readonly isStaged: boolean
  ) {
    super(
      dirPath.split('/').filter(Boolean).pop() || dirPath,
      vscode.TreeItemCollapsibleState.Collapsed
    );
    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'changesFolder';
    this.tooltip = dirPath;
  }
}

/**
 * Group flat change entries into folder nodes followed by files, one level at
 * a time. `prefix` is the already-consumed directory path; file entries keep
 * their full repository-relative path so callers can still open their diffs.
 */
export function buildChangeNodes(
  entries: ChangeEntry[],
  prefix: string,
  repo: GitRepository | undefined,
  isStaged: boolean,
  createItem: (entry: ChangeEntry) => vscode.TreeItem
): vscode.TreeItem[] {
  const folders = new Map<string, ChangeEntry[]>();
  const files: ChangeEntry[] = [];

  for (const entry of entries) {
    const rest = prefix ? entry.path.slice(prefix.length) : entry.path;
    const slash = rest.indexOf('/');
    if (slash === -1) {
      files.push(entry);
      continue;
    }

    const dirPath = prefix + rest.slice(0, slash);
    const bucket = folders.get(dirPath);
    if (bucket) {
      bucket.push(entry);
    } else {
      folders.set(dirPath, [entry]);
    }
  }

  return [
    ...Array.from(folders.keys(), (dirPath) => new FolderItem(dirPath, repo, isStaged)),
    ...files.map((entry) => createItem(entry)),
  ];
}
