import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildChangeNodes, FolderItem } from '../../providers/ChangeTreeBuilder';

vi.mock('vscode', () => ({
  TreeItem: class {
    constructor(
      public label: string,
      public collapsibleState: number
    ) {}
  },
  TreeItemCollapsibleState: { Collapsed: 1, None: 0 },
  ThemeIcon: class {
    constructor(public id: string) {}
  },
}));

describe('ChangeTreeBuilder', () => {
  const repo = { rootDir: '/repo' } as any;
  let createItem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createItem = vi.fn((entry: any) => ({ label: entry.path }));
  });

  it('returns flat file items when no entry contains a directory', () => {
    const entries = [
      { path: 'a.ts', status: 'M', repo },
      { path: 'b.ts', status: '?', repo },
    ];

    const nodes = buildChangeNodes(entries, '', repo, false, createItem);

    expect(nodes).toHaveLength(2);
    expect(createItem).toHaveBeenCalledTimes(2);
  });

  it('groups entries under a folder node and keeps full paths on files', () => {
    const entries = [
      { path: 'src/a.ts', status: 'M', repo },
      { path: 'src/nested/b.ts', status: 'M', repo },
      { path: 'root.ts', status: 'M', repo },
    ];

    const nodes = buildChangeNodes(entries, '', repo, false, createItem);
    const folders = nodes.filter((n): n is FolderItem => n instanceof FolderItem);

    expect(folders).toHaveLength(1);
    expect(folders[0].dirPath).toBe('src');
    expect(folders[0].label).toBe('src');
    // Files inside a folder are represented by the folder node until expanded.
    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ path: 'root.ts' }));
  });

  it('builds nested children using the folder prefix', () => {
    const entries = [
      { path: 'src/a.ts', status: 'M', repo },
      { path: 'src/nested/b.ts', status: 'M', repo },
    ];

    const nodes = buildChangeNodes(entries, 'src/', repo, false, createItem);
    const folders = nodes.filter((n): n is FolderItem => n instanceof FolderItem);

    expect(folders).toHaveLength(1);
    expect(folders[0].dirPath).toBe('src/nested');
    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/a.ts' }));
  });
});
