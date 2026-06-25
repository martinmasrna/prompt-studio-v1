import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import katex from 'katex';

const renderer = new Marked({
  gfm: true,
  breaks: true,
});

renderer.use({ extensions: [
  {
    name: 'displayMath',
    level: 'block',
    start: source => source.indexOf('$$'),
    tokenizer(source) {
      const match = /^\$\$\s*([\s\S]+?)\s*\$\$(?:\n|$)/.exec(source);
      return match ? { type: 'displayMath', raw: match[0], text: match[1] } : undefined;
    },
    renderer(token) {
      return katex.renderToString(token.text, { displayMode: true, throwOnError: false });
    },
  },
  {
    name: 'inlineMath',
    level: 'inline',
    start: source => source.indexOf('$'),
    tokenizer(source) {
      const match = /^\$(?!\$)([^\n$]+?)\$(?!\$)/.exec(source);
      return match ? { type: 'inlineMath', raw: match[0], text: match[1] } : undefined;
    },
    renderer(token) {
      return katex.renderToString(token.text, { throwOnError: false });
    },
  },
] });

/** Render model-authored Markdown and TeX without allowing unsafe HTML. */
export function renderContent(source: string): string {
  const html = renderer.parse(source) as string;
  if (typeof DOMPurify.sanitize === 'function') return DOMPurify.sanitize(html);
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}
