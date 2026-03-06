import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { StatusDecorationProvider } from '../../providers/StatusDecorationProvider';

// Mock vscode
vi.mock('vscode', () => ({
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); },
  ThemeColor: class { constructor(public id: string) {} },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    joinPath: (base: any, relative: string) => ({ fsPath: `${base.fsPath}/${relative}`, scheme: 'file' }),
  },
}));

describe('StatusDecorationProvider', () => {
  let provider: StatusDecorationProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new StatusDecorationProvider();
  });

  it('should provide decoration for added file', () => {
    StatusDecorationProvider.updateStatus([{ path: 'file.ts', status: 'A', rootDir: '/test' }]);
    
    const uri = { fsPath: '/test/file.ts' } as any;
    const decoration = provider.provideFileDecoration(uri, {} as any);
    
    expect(decoration).toBeDefined();
    expect(decoration?.tooltip).toBe('Added');
    expect(decoration?.color).toBeDefined();
  });

  it('should provide decoration for deleted file with strikethrough', () => {
    StatusDecorationProvider.updateStatus([{ path: 'file.ts', status: 'D', rootDir: '/test' }]);
    
    const uri = { fsPath: '/test/file.ts' } as any;
    const decoration = provider.provideFileDecoration(uri, {} as any) as any;
    
    expect(decoration?.tooltip).toBe('Deleted');
    expect(decoration?.strikethrough).toBe(true);
  });

  it('should return undefined if no status for file', () => {
    StatusDecorationProvider.updateStatus([]);
    const uri = { fsPath: '/test/unknown.ts' } as any;
    const decoration = provider.provideFileDecoration(uri, {} as any);
    expect(decoration).toBeUndefined();
  });
});
