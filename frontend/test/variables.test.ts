import { describe, expect, it } from 'vitest';
import { extractVariables, missingVariables, substituteVariables } from '../src/utils/variables';

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
