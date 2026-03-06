import { describe, it, expect } from 'vitest';
import { escapeHtml, formatLineRanges, toStrikethrough, truncate } from '../../utils/HtmlUtils';

describe('HtmlUtils', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('a & b')).toBe('a &amp; b');
      expect(escapeHtml('"quotes"')).toBe('&quot;quotes&quot;');
      expect(escapeHtml("'single'")).toBe('&#039;single&#039;');
    });

    it('should return same string if no special characters', () => {
      expect(escapeHtml('hello')).toBe('hello');
    });
  });

  describe('formatLineRanges', () => {
    it('should format single line', () => {
      expect(formatLineRanges([1])).toBe('1');
    });

    it('should format consecutive lines as range', () => {
      expect(formatLineRanges([1, 2, 3, 4, 5])).toBe('1-5');
    });

    it('should format mixed ranges', () => {
      expect(formatLineRanges([1, 2, 3, 5, 6, 10])).toBe('1-3, 5-6, 10');
    });

    it('should return empty string for empty array', () => {
      expect(formatLineRanges([])).toBe('');
    });
  });

  describe('toStrikethrough', () => {
    it('should convert text to strikethrough', () => {
      const result = toStrikethrough('test');
      expect(result).toContain('\u0336');
    });
  });

  describe('truncate', () => {
    it('should truncate long text', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('should not truncate short text', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });
  });
});
