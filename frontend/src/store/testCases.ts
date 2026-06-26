import { api, type TestCase, type TestCaseInput } from '../api';
import { variableValues } from './editor';
import { createCollectionStore } from './collection';

// A test case is purely a scenario: a name and a set of variable values. The
// live editable payload is the shared `variableValues`; the description is
// carried through unchanged. Sampling params live in the configs store; the
// system prompt lives on the prompt version.
export const testStore = createCollectionStore<TestCase, TestCaseInput>({
  resource: api.testCases,
  noun: 'test',
  pluralLabel: 'saved tests',
  capture: (name, base) => ({
    name,
    description: base?.description ?? null,
    variables: { ...variableValues.value },
  }),
  apply: testCase => {
    variableValues.value = testCase ? { ...testCase.variables } : {};
  },
});

// Named handles the rest of the app reads.
export const selectedTestCase = testStore.selected;
export const loadTestCases = testStore.load;
