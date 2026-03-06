import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipGenerator } from '../../utils/TooltipGenerator';

vi.mock('vscode', () => ({
  MarkdownString: class MockMarkdownString {
    isTrusted = false;
    supportHtml = false;
    value = '';
    appendMarkdown(text: string) {
      this.value += text;
      return this;
    }
  },
}));

describe('TooltipGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate commit tooltip with basic info', () => {
    const tooltip = TooltipGenerator.generateCommitTooltip(
      'Test User',
      'test@example.com',
      'Test commit message',
      '2024-01-01',
      'abc123def456'
    );

    expect(tooltip.value).toContain('Test User');
    expect(tooltip.value).toContain('Test commit message');
    expect(tooltip.value).toContain('2024-01-01');
    expect(tooltip.value).toContain('abc123d');
  });

  it('should include email in tooltip', () => {
    const tooltip = TooltipGenerator.generateCommitTooltip(
      'Test User',
      'test@example.com',
      'Test message',
      '2024-01-01',
      'abc123'
    );

    expect(tooltip.value).toContain('test@example.com');
  });

  it('should include refs in tooltip when provided', () => {
    const tooltip = TooltipGenerator.generateCommitTooltip(
      'Test User',
      'test@example.com',
      'Test message',
      '2024-01-01',
      'abc123',
      'main, v1.0.0'
    );

    expect(tooltip.value).toContain('main, v1.0.0');
  });

  it('should not include email section when email is empty', () => {
    const tooltip = TooltipGenerator.generateCommitTooltip(
      'Test User',
      '',
      'Test message',
      '2024-01-01',
      'abc123'
    );

    expect(tooltip.value).not.toContain('📧');
  });
});
