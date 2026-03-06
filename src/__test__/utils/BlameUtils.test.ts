import { describe, it, expect } from 'vitest';
import { getAgeBasedColor, formatRelativeTime } from '../../utils/BlameUtils';

describe('BlameUtils', () => {
  describe('getAgeBasedColor', () => {
    it('should return hot color for recent commits', () => {
      const now = Math.floor(Date.now() / 1000);
      const color = getAgeBasedColor(now);
      expect(color.hex).toBe('#ff4444');
    });

    it('should return warm color for commits less than a week old', () => {
      const weekAgo = Math.floor(Date.now() / 1000) - 86400 * 3;
      const color = getAgeBasedColor(weekAgo);
      expect(color.hex).toBe('#ff8844');
    });

    it('should return ancient color for old commits', () => {
      const yearAgo = Math.floor(Date.now() / 1000) - 86400 * 400;
      const color = getAgeBasedColor(yearAgo);
      expect(color.hex).toBe('#666666');
    });
  });

  describe('formatRelativeTime', () => {
    it('should return "just now" for recent timestamps', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(formatRelativeTime(now)).toBe('just now');
    });

    it('should return minutes ago', () => {
      const minutesAgo = Math.floor(Date.now() / 1000) - 300;
      expect(formatRelativeTime(minutesAgo)).toBe('5 minutes ago');
    });

    it('should return days ago', () => {
      const daysAgo = Math.floor(Date.now() / 1000) - 86400 * 3;
      expect(formatRelativeTime(daysAgo)).toBe('3 days ago');
    });

    it('should return years ago for old timestamps', () => {
      const yearsAgo = Math.floor(Date.now() / 1000) - 86400 * 400;
      expect(formatRelativeTime(yearsAgo)).toBe('1 year ago');
    });
  });
});
