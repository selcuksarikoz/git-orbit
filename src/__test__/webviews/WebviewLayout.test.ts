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
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'");
    expect(html).not.toContain('script-src');
  });

  it('should return HTML for getErrorHtml', () => {
    const html = getErrorHtml({ message: 'Error happened' });
    expect(html).toContain('Error happened');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'");
  });

  it('should escape HTML in error messages', () => {
    const html = getErrorHtml({ message: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('should escape HTML in loading messages', () => {
    const html = getLoadingHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
