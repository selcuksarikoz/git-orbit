import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '../../services/ConfigService';

const { workspace } = vi.hoisted(() => ({
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn(),
    }),
  },
}));

vi.mock('vscode', () => ({
  workspace,
}));

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    configService = ConfigService.getInstance();
    mockGet = workspace.getConfiguration('gitorbit').get;
  });

  describe('featurePrefix', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue('feature/');
      expect(configService.featurePrefix).toBe('feature/');
    });

    it('should return default value when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.featurePrefix).toBe('feature/');
    });
  });

  describe('featureBase', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue('develop');
      expect(configService.featureBase).toBe('develop');
    });

    it('should return empty string when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.featureBase).toBe('');
    });
  });

  describe('hotfixPrefix', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue('hotfix/');
      expect(configService.hotfixPrefix).toBe('hotfix/');
    });

    it('should return default value when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.hotfixPrefix).toBe('hotfix/');
    });
  });

  describe('hotfixBase', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue('main');
      expect(configService.hotfixBase).toBe('main');
    });

    it('should return empty string when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.hotfixBase).toBe('');
    });
  });

  describe('bugfixPrefix', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue('bugfix/');
      expect(configService.bugfixPrefix).toBe('bugfix/');
    });

    it('should return default value when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.bugfixPrefix).toBe('bugfix/');
    });
  });

  describe('bugfixBase', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue('develop');
      expect(configService.bugfixBase).toBe('develop');
    });

    it('should return empty string when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.bugfixBase).toBe('');
    });
  });

  describe('releasePrefix', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue('release/');
      expect(configService.releasePrefix).toBe('release/');
    });

    it('should return default value when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.releasePrefix).toBe('release/');
    });
  });

  describe('releaseBase', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue('main');
      expect(configService.releaseBase).toBe('main');
    });

    it('should return empty string when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.releaseBase).toBe('');
    });
  });

  describe('commitLimit', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue(50);
      expect(configService.commitLimit).toBe(50);
    });

    it('should return default value when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.commitLimit).toBe(20);
    });
  });

  describe('isInlineBlameEnabled', () => {
    it('should return true when configured', () => {
      mockGet.mockReturnValue(true);
      expect(configService.isInlineBlameEnabled).toBe(true);
    });

    it('should return false when configured', () => {
      mockGet.mockReturnValue(false);
      expect(configService.isInlineBlameEnabled).toBe(false);
    });

    it('should return true by default when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.isInlineBlameEnabled).toBe(true);
    });
  });

  describe('isGutterBlameEnabled', () => {
    it('should return true when configured', () => {
      mockGet.mockReturnValue(true);
      expect(configService.isGutterBlameEnabled).toBe(true);
    });

    it('should return false when configured', () => {
      mockGet.mockReturnValue(false);
      expect(configService.isGutterBlameEnabled).toBe(false);
    });

    it('should return true by default when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.isGutterBlameEnabled).toBe(true);
    });
  });

  describe('isFileBlameEnabled', () => {
    it('should return true when configured', () => {
      mockGet.mockReturnValue(true);
      expect(configService.isFileBlameEnabled).toBe(true);
    });

    it('should return false when configured', () => {
      mockGet.mockReturnValue(false);
      expect(configService.isFileBlameEnabled).toBe(false);
    });

    it('should return true by default when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.isFileBlameEnabled).toBe(true);
    });
  });

  describe('isTagsViewEnabled', () => {
    it('should return true when configured', () => {
      mockGet.mockReturnValue(true);
      expect(configService.isTagsViewEnabled).toBe(true);
    });

    it('should return false when configured', () => {
      mockGet.mockReturnValue(false);
      expect(configService.isTagsViewEnabled).toBe(false);
    });

    it('should return true by default when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.isTagsViewEnabled).toBe(true);
    });
  });

  describe('isContributorsViewEnabled', () => {
    it('should return true when configured', () => {
      mockGet.mockReturnValue(true);
      expect(configService.isContributorsViewEnabled).toBe(true);
    });

    it('should return false when configured', () => {
      mockGet.mockReturnValue(false);
      expect(configService.isContributorsViewEnabled).toBe(false);
    });

    it('should return true by default when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.isContributorsViewEnabled).toBe(true);
    });
  });

  describe('autoSyncInterval', () => {
    it('should return configured value when set', () => {
      mockGet.mockReturnValue(30);
      expect(configService.autoSyncInterval).toBe(30);
    });

    it('should return default value when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(configService.autoSyncInterval).toBe(10);
    });
  });
});
