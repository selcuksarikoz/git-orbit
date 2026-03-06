import { describe, it, expect } from 'vitest';
import { md5 } from '../../utils/Hash';

describe('Hash', () => {
  it('should generate md5 hash', () => {
    const result = md5('hello');
    expect(result).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('should handle uppercase text', () => {
    const result = md5('HELLO');
    expect(result).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('should handle text with whitespace', () => {
    const result = md5('  hello  ');
    expect(result).toBe('5d41402abc4b2a76b9719d911017c592');
  });
});
