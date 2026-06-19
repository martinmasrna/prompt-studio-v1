import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPromptTemplate } from '../src/prompts/promptDoctor';

test('Prompt Doctor template renderer', async t => {
  await t.test('resolves nested values and formats dynamic variables as JSON', () => {
    const rendered = renderPromptTemplate(
      'Issue: {{ issue.title }}\nVariables:\n{{ evaluation.variables | json }}',
      {
        issue: { title: 'Bad summary' },
        evaluation: { variables: { language: 'Slovak', audience: 'students' } },
      }
    );
    assert.match(rendered, /Issue: Bad summary/);
    assert.match(rendered, /"language": "Slovak"/);
    assert.match(rendered, /"audience": "students"/);
  });

  await t.test('renders null and empty values as not provided', () => {
    assert.equal(
      renderPromptTemplate('{{ issue.note }} / {{ evaluation.error }}', {
        issue: { note: null }, evaluation: { error: '' },
      }),
      '(not provided) / (not provided)'
    );
  });

  await t.test('does not recursively expand placeholders contained in evidence', () => {
    const rendered = renderPromptTemplate('{{ evaluation.template }}', {
      evaluation: { template: 'Summarize {{document}} for {{audience}}.' },
    });
    assert.equal(rendered, 'Summarize {{document}} for {{audience}}.');
  });

  await t.test('rejects unknown, malformed, and unformatted object placeholders', () => {
    assert.throws(
      () => renderPromptTemplate('{{ evaluation.missing }}', { evaluation: {} }),
      /Unknown Prompt Doctor placeholder/
    );
    assert.throws(
      () => renderPromptTemplate('{{ evaluation.variables | yaml }}', { evaluation: { variables: {} } }),
      /Invalid Prompt Doctor placeholder/
    );
    assert.throws(
      () => renderPromptTemplate('{{ evaluation.variables }}', { evaluation: { variables: {} } }),
      /use "\| json"/
    );
  });
});
