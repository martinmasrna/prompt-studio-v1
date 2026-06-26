<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  testCases, selectedTestCaseId, selectedTestCase, isTestDirty,
  testsLoading, testSaving, testsError, selectTestCase,
  saveNewTest, saveSelectedTest, renameSelectedTest,
  renameTestCase, deleteSelectedTest, deleteTestCase,
} from '../store/testCases';

withDefaults(defineProps<{ showActions?: boolean; variant?: 'inline' | 'header'; compact?: boolean }>(), {
  showActions: true,
  variant: 'inline',
  compact: false,
});

const selectorOpen = ref(false);
const menuOpen = ref(false);
const rowMenuId = ref<number | null>(null);

const compactLabel = computed(() => selectedTestCase.value?.name ?? 'Scratch (not saved)');

function choose(event: Event) {
  const select = event.target as HTMLSelectElement;
  const previous = selectedTestCaseId.value;
  const next = select.value ? Number(select.value) : null;
  if (!selectTestCase(next)) select.value = previous?.toString() ?? '';
}

function chooseId(id: number | null): void {
  if (selectTestCase(id)) {
    selectorOpen.value = false;
    menuOpen.value = false;
    rowMenuId.value = null;
  }
}

async function saveAsNew() {
  const name = prompt('Name this scenario');
  if (!name?.trim()) return;
  try {
    await saveNewTest(name);
  } catch {
    // The shared error message is rendered below.
  }
}

async function rename() {
  const selected = selectedTestCase.value;
  if (!selected) return;
  const name = prompt('Rename scenario', selected.name);
  if (!name?.trim()) return;
  try {
    await renameSelectedTest(name);
  } catch {
    // The shared error message is rendered below.
  }
}

async function renameRow(id: number, currentName: string) {
  rowMenuId.value = null;
  const name = prompt('Rename scenario', currentName);
  if (!name?.trim()) return;
  try {
    await renameTestCase(id, name);
  } catch {
    // The shared error message is rendered below.
  }
}

async function menuSaveAsNew() {
  selectorOpen.value = false;
  await saveAsNew();
}

async function menuRename() {
  menuOpen.value = false;
  await rename();
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

async function removeRow(id: number, name: string) {
  rowMenuId.value = null;
  if (!confirm(`Delete saved test "${name}"?`)) return;
  try {
    await deleteTestCase(id);
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not delete test');
  }
}

async function menuRemove() {
  menuOpen.value = false;
  await remove();
}
</script>

<template>
  <!-- Compact corner control: just the selector plus icon actions, for a box header -->
  <div v-if="compact" class="entity-controls compact-control">
    <div class="entity-picker-wrap">
      <button
        class="entity-picker compact-picker"
        :class="{ open: selectorOpen }"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="selectorOpen"
        :disabled="testsLoading"
        @click="selectorOpen = !selectorOpen; menuOpen = false; rowMenuId = null"
      >
        <span class="entity-picker-label">{{ compactLabel }}</span>
        <span class="entity-picker-chevron">{{ selectorOpen ? '^' : 'v' }}</span>
      </button>
      <div v-if="selectorOpen" class="entity-backdrop" @click="selectorOpen = false; rowMenuId = null" />
      <div v-if="selectorOpen" class="entity-popover compact-popover" role="menu">
        <button class="entity-new-row" role="menuitem" :disabled="testSaving" @click="menuSaveAsNew">
          <span class="entity-plus">+</span>
          <span>New scenario</span>
        </button>
        <div
          v-for="testCase in testCases"
          :key="testCase.id"
          class="entity-row"
          :class="{ current: selectedTestCaseId === testCase.id }"
          role="menuitem"
          @click="chooseId(testCase.id)"
        >
          <span class="entity-row-main">
            <span class="entity-row-title">{{ testCase.name }}</span>
            <span v-if="testCase.description" class="entity-row-note">{{ testCase.description }}</span>
          </span>
          <span class="entity-row-actions">
            <button
              class="entity-kebab"
              type="button"
              aria-label="Scenario actions"
              :aria-expanded="rowMenuId === testCase.id"
              @click.stop="rowMenuId = rowMenuId === testCase.id ? null : testCase.id"
            >
              <span>&#8942;</span>
            </button>
            <template v-if="rowMenuId === testCase.id">
              <div class="entity-backdrop" @click.stop="rowMenuId = null" />
              <div class="entity-menu" role="menu" @click.stop>
                <button role="menuitem" :disabled="testSaving" @click="renameRow(testCase.id, testCase.name)">Rename</button>
                <button role="menuitem" class="danger" :disabled="testSaving" @click="removeRow(testCase.id, testCase.name)">Delete</button>
              </div>
            </template>
          </span>
        </div>
      </div>
    </div>
    <span v-if="selectedTestCase && isTestDirty" class="entity-dirty-dot" title="Unsaved changes" />
    <button
      v-if="selectedTestCase"
      class="entity-save"
      :disabled="testSaving || !isTestDirty"
      @click="save"
    >
      {{ testSaving ? 'Saving...' : 'Save' }}
    </button>
    <div class="entity-menu-wrap" @keydown.esc="menuOpen = false">
      <button
        class="entity-kebab"
        type="button"
        aria-label="Test actions"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen; selectorOpen = false; rowMenuId = null"
      >
        <span>&#8942;</span>
      </button>
      <div v-if="menuOpen" class="entity-menu" role="menu">
        <button v-if="selectedTestCase" role="menuitem" :disabled="testSaving" @click="menuRename">Rename</button>
        <button v-if="selectedTestCase" role="menuitem" class="danger" :disabled="testSaving" @click="menuRemove">Delete</button>
        <button v-if="!selectedTestCase" role="menuitem" disabled>No saved scenario selected</button>
      </div>
    </div>
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
    <button class="test-btn" :disabled="testSaving" @click="saveAsNew">New scenario</button>

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
