<script setup lang="ts">
import {
  testCases, selectedTestCaseId, selectedTestCase, isTestDirty,
  testsLoading, testSaving, testsError, selectTestCase,
  saveNewTest, saveSelectedTest, deleteSelectedTest,
} from '../store/testCases';

withDefaults(defineProps<{ showActions?: boolean; variant?: 'inline' | 'header'; compact?: boolean }>(), {
  showActions: true,
  variant: 'inline',
  compact: false,
});

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
  <!-- Compact corner control: just the selector plus icon actions, for a box header -->
  <div v-if="compact" class="cc-compact">
    <select class="cc-select" aria-label="Saved test" :value="selectedTestCaseId ?? ''" :disabled="testsLoading" @change="choose">
      <option value="">Scratch (not saved)</option>
      <option v-for="testCase in testCases" :key="testCase.id" :value="testCase.id">{{ testCase.name }}</option>
    </select>
    <span v-if="selectedTestCase && isTestDirty" class="cc-dot" title="Unsaved changes" />
    <button class="cc-icon" title="Save test" :disabled="!selectedTestCase || testSaving || !isTestDirty" @click="save">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>
      </svg>
    </button>
    <button class="cc-icon" title="Save as new test" :disabled="testSaving" @click="saveAsNew">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>
      </svg>
    </button>
    <button v-if="selectedTestCase" class="cc-icon danger" title="Delete test" :disabled="testSaving" @click="remove">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>
    <p v-if="testsError" class="cc-error">{{ testsError }}</p>
  </div>

  <div v-else-if="variant === 'header'" class="workspace-title-row">
    <h2 class="workspace-title">Sandbox</h2>

    <div class="workspace-title-actions">
      <span
        v-if="selectedTestCase"
        class="workspace-status"
        :class="{ dirty: isTestDirty }"
        :title="isTestDirty ? 'Unsaved test changes' : 'All changes saved'"
      >
        <span class="workspace-status-dot" />
        {{ isTestDirty ? 'Unsaved' : 'Saved' }}
      </span>

      <select
        class="workspace-switcher test-header-select"
        aria-label="Saved test"
        :value="selectedTestCaseId ?? ''"
        :disabled="testsLoading"
        @change="choose"
      >
        <option value="">Scratch (not saved)</option>
        <option v-for="testCase in testCases" :key="testCase.id" :value="testCase.id">
          {{ testCase.name }}
        </option>
      </select>
    </div>
  </div>

  <div v-else class="test-controls">
    <span class="test-label">Test</span>
    <select class="test-select" aria-label="Saved test" :value="selectedTestCaseId ?? ''" :disabled="testsLoading" @change="choose">
      <option value="">Scratch (not saved)</option>
      <option v-for="testCase in testCases" :key="testCase.id" :value="testCase.id">
        {{ testCase.name }}
      </option>
    </select>

    <template v-if="showActions">
    <span class="divider" />

    <button v-if="selectedTestCase" class="test-btn primary" :disabled="testSaving || !isTestDirty" @click="save">
      {{ testSaving ? 'Saving…' : 'Save' }}
    </button>
    <button class="test-btn" :disabled="testSaving" @click="saveAsNew">Save as new</button>

    <template v-if="selectedTestCase">
      <span class="divider" />
      <button class="icon-btn" title="Delete test" :disabled="testSaving" @click="remove">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </template>
    </template>

    <span v-if="selectedTestCase" class="test-status" :class="{ dirty: isTestDirty }" :title="isTestDirty ? 'Unsaved test changes' : 'All changes saved'">
      <span class="status-dot" />
      {{ isTestDirty ? 'Unsaved changes' : 'Saved' }}
    </span>
  </div>
  <p v-if="testsError" class="test-error">{{ testsError }}</p>
</template>

<style scoped>
/* Compact corner control (box headers) */
.cc-compact { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.cc-select { min-width: 130px; max-width: 220px; min-height: 30px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary); font: inherit; font-size: 12px; padding: 4px 8px; }
.cc-select:focus { outline: none; border-color: #aaa; }
.cc-dot { width: 6px; height: 6px; border-radius: 50%; background: #d6a13a; flex-shrink: 0; }
.cc-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; background: none; border: none; border-radius: 5px; color: var(--text-muted); cursor: pointer; transition: color .12s, background .12s; }
.cc-icon:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); }
.cc-icon.danger:hover:not(:disabled) { color: #b33; background: #fff5f5; }
.cc-icon:disabled { opacity: 0.4; cursor: default; }
.cc-error { color: #c04040; font-size: 11px; width: 100%; text-align: right; margin: 2px 0 0; }

.test-controls { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.test-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.test-select { min-width: 150px; max-width: 260px; min-height: 34px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary); font: inherit; font-size: 12px; padding: 6px 9px; }
.test-btn { min-height: 34px; padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary); font-size: 11px; cursor: pointer; white-space: nowrap; }
.test-btn:hover:not(:disabled) { color: var(--text-primary); border-color: #aaa; }
.test-btn:disabled { opacity: 0.45; cursor: default; }
/* Save is the emphasized action in this row, but not a dark "primary" —
   that role belongs solely to Run, so the two don't compete. */
.test-btn.primary { color: var(--text-primary); border-color: var(--text-muted); font-weight: 600; }
.test-btn.primary:disabled { font-weight: 400; }

/* Hairline separators group the select / save actions / destructive action. */
.divider { width: 1px; height: 16px; background: var(--border); flex-shrink: 0; }

/* Delete: compact destructive icon, set off by a divider rather than distance. */
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; background: none; border: none; border-radius: 5px; color: var(--text-muted); cursor: pointer; transition: color .12s, background .12s; }
.icon-btn:hover:not(:disabled) { color: #b33; background: var(--bg-hover); }
.icon-btn:disabled { opacity: 0.45; cursor: default; }

/* Saved / unsaved status fills the right side of the strip. */
.test-status { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); white-space: nowrap; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #4f7a52; }
.test-status.dirty { color: #9a6a18; }
.test-status.dirty .status-dot { background: #d6a13a; }

.test-error { color: #c04040; font-size: 11px; margin-top: 6px; }
</style>
