import { describe, expect, it } from 'vitest';
import { renderContent } from '../src/utils/renderContent';

describe('renderContent', () => {
  it('renders Markdown', () => {
    const html = renderContent('## Result\n\n**bold** and `code`');
    expect(html).toContain('<h2>Result</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders inline and display LaTeX', () => {
    const html = renderContent('Inline $E = mc^2$\n\n$$\\int_0^1 x^2 dx$$');
    expect(html).toContain('katex');
    expect(html).toContain('katex-display');
  });

  it('removes unsafe model-authored HTML', () => {
    const html = renderContent('<img src=x onerror="alert(1)"><script>alert(1)</script>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });
});
