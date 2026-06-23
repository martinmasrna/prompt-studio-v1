import { describe, expect, it } from 'vitest';
import { extractVariables, missingVariables, substituteVariables, tokenizePrompt } from '../src/utils/variables';

describe('prompt variable utilities', () => {
  it('extracts supported names once and preserves first-seen order', () => {
    expect(extractVariables('{{query}} / {{language_2}} / {{query}} / {{x1}}')).toEqual([
      'query', 'language_2', 'x1',
    ]);
  });

  it('ignores malformed placeholders and unsupported Unicode names', () => {
    expect(extractVariables('{query} {{two words}} {{}} {{jazyk_č}}')).toEqual([]);
  });

  it('substitutes known values while preserving unresolved placeholders', () => {
    expect(substituteVariables(
      'Query: {{query}}\nLanguage: {{language}}',
      { query: 'Žiadosť\n第二行' }
    )).toBe('Query: Žiadosť\n第二行\nLanguage: {{language}}');
  });

  it('treats absent, empty, and whitespace-only values as missing', () => {
    expect(missingVariables(
      '{{present}} {{empty}} {{spaces}} {{absent}}',
      { present: 'yes', empty: '', spaces: '   ' }
    )).toEqual(['empty', 'spaces', 'absent']);
  });
});

describe('tokenizePrompt', () => {
  it('splits text and variables in order, resolving values', () => {
    expect(tokenizePrompt('Answer {{query}} now', { query: 'poker odds' })).toEqual([
      { type: 'text', value: 'Answer ' },
      { type: 'var', name: 'query', value: 'poker odds' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('marks absent, empty, and whitespace-only variables as null', () => {
    expect(tokenizePrompt('{{a}}{{b}}{{c}}', { a: '', b: '   ' })).toEqual([
      { type: 'var', name: 'a', value: null },
      { type: 'var', name: 'b', value: null },
      { type: 'var', name: 'c', value: null },
    ]);
  });

  it('handles adjacent and edge placeholders', () => {
    expect(tokenizePrompt('{{x}} between {{y}}', { x: '1', y: '2' })).toEqual([
      { type: 'var', name: 'x', value: '1' },
      { type: 'text', value: ' between ' },
      { type: 'var', name: 'y', value: '2' },
    ]);
  });

  it('leaves malformed placeholders as literal text', () => {
    expect(tokenizePrompt('{single} {{two words}}', {})).toEqual([
      { type: 'text', value: '{single} {{two words}}' },
    ]);
  });

  it('returns a single text segment with no variables, and empty array for empty input', () => {
    expect(tokenizePrompt('plain', {})).toEqual([{ type: 'text', value: 'plain' }]);
    expect(tokenizePrompt('', {})).toEqual([]);
  });
});
