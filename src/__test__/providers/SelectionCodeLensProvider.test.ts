import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { SelectionCodeLensProvider } from '../../providers/SelectionCodeLensProvider';

// Mock vscode
vi.mock('vscode', () => ({
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); },
  Range: class { constructor(public sl: number, public sc: number, public el: number, public ec: number) {} },
  CodeLens: class { constructor(public range: any, public command: any) {} },
  window: {
    onDidChangeTextEditorSelection: vi.fn(),
    activeTextEditor: {
      selection: {
        isEmpty: false,
        isSingleLine: false,
        start: { line: 10 },
      },
      document: 'mock-doc',
    },
  },
}));

describe('SelectionCodeLensProvider', () => {
  let provider: SelectionCodeLensProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new SelectionCodeLensProvider();
  });

  it('should provide code lens for non-empty multi-line selection', () => {
    const document = 'mock-doc' as any;
    const lenses = provider.provideCodeLenses(document, {} as any);
    
    expect(lenses.length).toBe(1);
    expect(lenses[0].command.title).toContain('Improve this with Kuulto AI');
  });

  it('should not provide code lens for empty selection', () => {
    (vscode.window.activeTextEditor as any).selection.isEmpty = true;
    const document = 'mock-doc' as any;
    const lenses = provider.provideCodeLenses(document, {} as any);
    
    expect(lenses.length).toBe(0);
  });
});
