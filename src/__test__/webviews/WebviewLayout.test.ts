import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { getWebviewLayout, getLoadingHtml, getErrorHtml } from '../../webviews/WebviewLayout';

describe('WebviewLayout', () => {
  const mockWebview = {
    cspSource: 'vscode-resource:',
  } as vscode.Webview;
  const mockExtensionUri = { fsPath: '/extension' } as vscode.Uri;

  it('should return HTML for getWebviewLayout', () => {
    const html = getWebviewLayout(
      mockWebview,
      mockExtensionUri,
      { title: 'Test Title', scripts: 'console.log("hi");' },
      '<div>Content</div>'
    );
    expect(html).toContain('<title>Test Title</title>');
    expect(html).toContain('<div>Content</div>');
    expect(html).toContain('console.log("hi");');
    expect(html).toContain('nonce-');
  });

  it('should return HTML for getLoadingHtml', () => {
    const html = getLoadingHtml('Testing loader');
    expect(html).toContain('Testing loader');
    expect(html).toContain('spinner');
  });

  it('should return HTML for getErrorHtml', () => {
    const html = getErrorHtml({ message: 'Error happened' });
    expect(html).toContain('Error happened');
  });
});
