import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IconService } from '../../services/IconService';

const mockUri = {
  fsPath: '/test/extension/path',
};

const { Uri, File } = vi.hoisted(() => ({
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path })),
  },
  File: vi.fn(),
}));

vi.mock('vscode', () => ({
  Uri,
  ThemeIcon: class {},
}));

vi.mock('path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
}));

describe('IconService', () => {
  let iconService: IconService;

  beforeEach(() => {
    vi.clearAllMocks();
    IconService.getInstance(mockUri as any);
    iconService = IconService.getInstance();
  });

  describe('getIcon', () => {
    it('should return light and dark URIs for given icon name', () => {
      const result = iconService.getIcon('branch');

      expect(result).toHaveProperty('light');
      expect(result).toHaveProperty('dark');
    });

    it('should construct correct path for icon', () => {
      const result = iconService.getIcon('branch') as {
        light: { fsPath: string };
        dark: { fsPath: string };
      };

      expect(result.light.fsPath).toBe('/test/extension/path/assets/icons/branch.svg');
      expect(result.dark.fsPath).toBe('/test/extension/path/assets/icons/branch.svg');
    });

    it('should return different URIs for different icon names', () => {
      const branchIcon = iconService.getIcon('branch') as { light: { fsPath: string } };
      const commitIcon = iconService.getIcon('commit') as { light: { fsPath: string } };

      expect(branchIcon.light.fsPath).not.toBe(commitIcon.light.fsPath);
      expect(branchIcon.light.fsPath).toContain('branch.svg');
      expect(commitIcon.light.fsPath).toContain('commit.svg');
    });
  });
});
