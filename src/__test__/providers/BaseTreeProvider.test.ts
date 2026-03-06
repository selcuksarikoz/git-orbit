vi.mock('vscode', () => ({
  TreeDataProvider: class MockTreeDataProvider {
    onDidChangeTreeData = vi.fn();
  },
  TreeItem: class MockTreeItem {
    constructor(
      public label?: string,
      public collapsibleState?: number
    ) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class MockThemeIcon {
    constructor(
      public id: string,
      public color?: any
    ) {}
  },
  ThemeColor: class MockThemeColor {
    constructor(public id: string) {}
  },
  EventEmitter: class MockEventEmitter<T = any> {
    event: any;
    private listeners: ((value: T) => void)[] = [];

    constructor() {
      this.event = (listener: (value: T) => void) => {
        this.listeners.push(listener);
        return {
          dispose: () => {
            const index = this.listeners.indexOf(listener);
            if (index > -1) this.listeners.splice(index, 1);
          },
        };
      };
    }

    fire(value?: T) {
      this.listeners.forEach((listener) => listener(value as T));
    }
  },
  Event: class MockEvent<T = any> {
    constructor(public listener: (value: T) => void) {}
  },
  CancellationToken: class MockCancellationToken {
    isCancellationRequested = false;
  },
  workspace: {
    onDidChangeConfiguration: vi.fn(),
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn(),
    }),
  },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { BaseTreeProvider } from '../../providers/BaseTreeProvider';

class TestTreeProvider extends BaseTreeProvider<string> {
  getTreeItem(element: string): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return new vscode.TreeItem(element);
  }

  getChildren(element?: string): vscode.ProviderResult<string[]> {
    return [];
  }

  getFilterText(): string {
    return this.filterText;
  }
}

describe('BaseTreeProvider', () => {
  let provider: TestTreeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TestTreeProvider();
  });

  describe('constructor', () => {
    it('should create instance with empty filter text', () => {
      expect(provider.getFilterText()).toBe('');
    });

    it('should initialize onDidChangeTreeData event', () => {
      expect(provider.onDidChangeTreeData).toBeDefined();
      expect(typeof provider.onDidChangeTreeData).toBe('function');
    });
  });

  describe('refresh', () => {
    it('should fire the onDidChangeTreeData event', () => {
      const callback = vi.fn();
      provider.onDidChangeTreeData(callback);
      provider.refresh();
      expect(callback).toHaveBeenCalled();
    });

    it('should fire with undefined', () => {
      const callback = vi.fn();
      provider.onDidChangeTreeData(callback);
      provider.refresh();
      expect(callback).toHaveBeenCalledWith(undefined);
    });

    it('should fire multiple times when refresh is called multiple times', () => {
      const callback = vi.fn();
      provider.onDidChangeTreeData(callback);
      provider.refresh();
      provider.refresh();
      provider.refresh();
      expect(callback).toHaveBeenCalledTimes(3);
    });
  });

  describe('setFilter', () => {
    it('should set filterText to the provided value', () => {
      provider.setFilter('test-filter');
      expect(provider.getFilterText()).toBe('test-filter');
    });

    it('should call refresh after setting filter', () => {
      const callback = vi.fn();
      provider.onDidChangeTreeData(callback);
      provider.setFilter('another-filter');
      expect(callback).toHaveBeenCalled();
    });

    it('should handle empty string filter', () => {
      provider.setFilter('');
      expect(provider.getFilterText()).toBe('');
    });

    it('should handle special characters in filter', () => {
      provider.setFilter('test/*?regex');
      expect(provider.getFilterText()).toBe('test/*?regex');
    });

    it('should allow changing filter multiple times', () => {
      provider.setFilter('first');
      expect(provider.getFilterText()).toBe('first');
      provider.setFilter('second');
      expect(provider.getFilterText()).toBe('second');
      provider.setFilter('third');
      expect(provider.getFilterText()).toBe('third');
    });
  });

  describe('TreeDataProvider interface', () => {
    it('should be a valid TreeDataProvider', () => {
      expect(provider).toHaveProperty('onDidChangeTreeData');
      expect(provider).toHaveProperty('getTreeItem');
      expect(provider).toHaveProperty('getChildren');
    });

    it('should have refresh method', () => {
      expect(typeof provider.refresh).toBe('function');
    });

    it('should have setFilter method', () => {
      expect(typeof provider.setFilter).toBe('function');
    });
  });
});
