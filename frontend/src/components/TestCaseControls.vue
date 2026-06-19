<script setup lang="ts">
import {
  testCases, selectedTestCaseId, selectedTestCase, isTestDirty,
  testsLoading, testSaving, testsError, selectTestCase,
  saveNewTest, saveSelectedTest, deleteSelectedTest,
} from '../store/testCases';

function choose(event: Event) {
  const select = event.target as HTMLSelectElement;
  const previous = selectedTestCaseId.value;
  const next = select.value ? Number(select.value) : null;
  if (!selectTestCase(next)) select.value = previous?.toString() ?? '';
}

async function saveAsNew() {
  const name = prompt('Name this test');
  if (!name?.trim()) return;
  try {
    await saveNewTest(name);
  } catch {
    // The shared error message is rendered below.
  }
}

async function save() {
  try {
    await saveSelectedTest();
  } catch {
    // The shared error message is rendered below.
  }
}

async function remove() {
  const selected = selectedTestCase.value;
  if (!selected || !confirm(`Delete saved test "${selected.name}"?`)) return;
  try {
    await deleteSelectedTest();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not delete test');
  }
}
</script>

<template>
  <div class="test-controls">
    <span class="test-label">Test</span>
    <select class="test-select" aria-label="Saved test" :value="selectedTestCaseId ?? ''" :disabled="testsLoading" @change="choose">
      <option value="">Scratch (not saved)</option>
      <option v-for="testCase in testCases" :key="testCase.id" :value="testCase.id">
        {{ testCase.name }}
      </option>
    </select>
    <span v-if="isTestDirty" class="dirty" title="Unsaved test changes">Modified</span>
    <button v-if="selectedTestCase" class="test-btn primary" :disabled="testSaving || !isTestDirty" @click="save">
      {{ testSaving ? 'Saving…' : 'Save' }}
    </button>
    <button class="test-btn" :disabled="testSaving" @click="saveAsNew">Save as new</button>
    <button v-if="selectedTestCase" class="test-btn danger" title="Delete test" @click="remove">Delete</button>
  </div>
  <p v-if="testsError" class="test-error">{{ testsError }}</p>
</template>

<style scoped>
.test-controls { display: flex; align-items: center; gap: 8px; min-width: 0; }
.test-label { font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-faint); }
.test-select { min-width: 150px; max-width: 260px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text-secondary); font: inherit; font-size: 12px; padding: 5px 8px; }
.dirty { color: #9a6a18; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.test-btn { padding: 4px 9px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); font-size: 11px; cursor: pointer; white-space: nowrap; }
.test-btn:hover:not(:disabled) { color: var(--text-primary); border-color: #aaa; }
.test-btn:disabled { opacity: 0.45; cursor: default; }
.test-btn.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.test-btn.danger:hover { color: #b33; border-color: #d99; }
.test-error { color: #c04040; font-size: 11px; margin-top: 6px; }
</style>
