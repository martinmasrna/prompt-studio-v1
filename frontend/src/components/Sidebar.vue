<script setup lang="ts">
// Sidebar component. Lists all prompts, owns the "New Prompt" action, and
// hosts the module tabs (Overview / A/B Tester) for the selected prompt.
import { ref } from 'vue';
import { api } from '../api';
import { useAppState } from '../store/app';
import { activeModule, type ModuleTab } from '../store/editor';
import { hrefFor } from '../store/router';
import { showSettings, activeModelLabel } from '../store/settings';
import BaseModal from './BaseModal.vue';
import KebabMenu from './KebabMenu.vue';

const { prompts, selectedPromptId } = useAppState();

// ── Collapse state ──────────────────────────────────────────────────────────────
// When collapsed the sidebar shrinks to an icon rail: the prompt list is hidden
// and the module tabs / New Prompt reduce to icons.
const collapsed = ref(false);

// ── Module tabs ────────────────────────────────────────────────────────────────
const TABS: { id: ModuleTab; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'ab-tester',  label: 'A/B Tester' },
  { id: 'results',    label: 'Results' },
  { id: 'issues',     label: 'Issues' },
];

// Navbar tabs are real anchors so middle-click / Ctrl-click open them in a new
// tab natively. For a plain left-click we keep SPA behaviour: intercept it and
// switch the module in place. Modified clicks (new tab/window) are left to the
// browser. Middle-click doesn't fire a `click` event at all, so the anchor's
// href handles it without reaching this handler.
function onTabClick(e: MouseEvent, id: ModuleTab) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  activeModule.value = id;
}

// ── New-prompt dialog ──────────────────────────────────────────────────────────
const showNewModal = ref(false);
const newName      = ref('');
const creating     = ref(false);

function openNewModal() {
  newName.value = '';
  showNewModal.value = true;
}

async function createPrompt() {
  const name = newName.value.trim();
  if (creating.value || !name) return;
  creating.value = true;
  try {
    const { id } = await api.prompts.create(name);
    prompts.value = await api.prompts.list();
    selectedPromptId.value = id;
    showNewModal.value = false;
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Could not create prompt');
  } finally {
    creating.value = false;
  }
}

// ── Rename a prompt ──────────────────────────────────────────────────────────
const showRenameModal = ref(false);
const renameId        = ref<number | null>(null);
const renameName      = ref('');
const renaming        = ref(false);

function openRenameModal(id: number, name: string) {
  renameId.value = id;
  renameName.value = name;
  showRenameModal.value = true;
}

async function renamePrompt() {
  const id = renameId.value;
  const name = renameName.value.trim();
  if (renaming.value || id === null || !name) return;
  renaming.value = true;
  try {
    await api.prompts.patch(id, { name });
    prompts.value = await api.prompts.list();
    showRenameModal.value = false;
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Could not rename prompt');
  } finally {
    renaming.value = false;
  }
}

// ── Delete a prompt ────────────────────────────────────────────────────────────
async function deletePrompt(id: number, name: string) {
  if (!confirm(`Delete "${name}"? This permanently removes its versions, tests, configs, and all saved results and issues. This cannot be undone.`)) return;
  try {
    await api.prompts.delete(id);
    prompts.value = await api.prompts.list();
    // Clearing the selection lets App.vue tear down the editor state.
    if (selectedPromptId.value === id) selectedPromptId.value = null;
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Could not delete prompt');
  }
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div class="sidebar-top">
      <div v-if="!collapsed" class="sidebar-brand">Prompt Studio</div>
      <button
        class="collapse-btn"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="collapsed = !collapsed"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
      </button>
    </div>

    <div class="sidebar-header">
      <button class="new-prompt-btn" :title="collapsed ? 'New prompt' : undefined" @click="openNewModal">
        <span class="new-prompt-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span v-if="!collapsed">New prompt</span>
      </button>
    </div>

    <!-- Module tabs for the selected prompt -->
    <nav v-if="selectedPromptId !== null" class="module-tabs">
      <a
        v-for="tab in TABS"
        :key="tab.id"
        class="module-tab"
        :class="{ active: activeModule === tab.id }"
        :href="hrefFor(tab.id)"
        :title="tab.label"
        @click="onTabClick($event, tab.id)"
      >
        <span class="module-tab-icon">
          <!-- Overview: document -->
          <svg v-if="tab.id === 'overview'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
          <!-- A/B Tester: two columns -->
          <svg v-else-if="tab.id === 'ab-tester'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="18" rx="1" />
            <rect x="14" y="3" width="7" height="18" rx="1" />
          </svg>
          <svg v-else-if="tab.id === 'results'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>
          </svg>
        </span>
        <span v-if="!collapsed" class="module-tab-label">{{ tab.label }}</span>
      </a>
    </nav>

    <nav v-if="!collapsed" class="prompt-list">
      <div class="prompt-list-title">Recents</div>
      <div
        v-for="prompt in prompts"
        :key="prompt.id"
        class="prompt-item-root"
        :class="{ selected: prompt.id === selectedPromptId }"
        @click="selectedPromptId = prompt.id"
      >
        <span class="prompt-item-name">{{ prompt.name }}</span>
        <span class="prompt-actions" @click.stop>
          <KebabMenu label="Prompt actions">
            <button role="menuitem" @click="openRenameModal(prompt.id, prompt.name)">Rename</button>
            <button role="menuitem" class="danger" @click="deletePrompt(prompt.id, prompt.name)">Delete</button>
          </KebabMenu>
        </span>
      </div>
    </nav>

    <!-- Settings (model switcher) — pinned to the bottom -->
    <div class="sidebar-footer">
      <button
        class="settings-btn"
        :title="collapsed ? 'Settings' : (activeModelLabel ?? 'Settings')"
        @click="showSettings = true"
      >
        <span class="settings-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </span>
        <span v-if="!collapsed" class="settings-text">
          <span class="settings-title">Settings</span>
          <span v-if="activeModelLabel" class="settings-model">{{ activeModelLabel }}</span>
        </span>
      </button>
    </div>
  </aside>

  <!-- New-prompt dialog -->
  <BaseModal v-if="showNewModal" @close="showNewModal = false">
    <template #title>New prompt</template>

    <input
      v-model="newName"
      class="modal-input"
      placeholder="Prompt name"
      @keydown.enter="createPrompt"
      @keydown.esc="showNewModal = false"
      autofocus
    />

    <template #actions>
      <button class="btn-ghost" @click="showNewModal = false">Cancel</button>
      <button class="btn-primary" :disabled="creating || !newName.trim()" @click="createPrompt">
        {{ creating ? 'Creating…' : 'Create' }}
      </button>
    </template>
  </BaseModal>

  <!-- Rename-prompt dialog -->
  <BaseModal v-if="showRenameModal" @close="showRenameModal = false">
    <template #title>Rename prompt</template>

    <input
      v-model="renameName"
      class="modal-input"
      placeholder="Prompt name"
      @keydown.enter="renamePrompt"
      @keydown.esc="showRenameModal = false"
      autofocus
    />

    <template #actions>
      <button class="btn-ghost" @click="showRenameModal = false">Cancel</button>
      <button class="btn-primary" :disabled="renaming || !renameName.trim()" @click="renamePrompt">
        {{ renaming ? 'Renaming…' : 'Rename' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.sidebar {
  width: 248px;
  flex-shrink: 0;
  height: 100vh;
  /* Soft-surfaces: the sidebar rides on the canvas — no panel fill, no border.
     Hierarchy comes from the elevated cards beside it. */
  background: transparent;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 6px 6px 0;
  transition: width 0.16s ease;
}

.sidebar.collapsed { width: 58px; }

/* ── Collapse toggle ── */
.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 50px;
  padding: 12px 14px 2px;
  flex-shrink: 0;
}
.sidebar.collapsed .sidebar-top { justify-content: center; padding: 12px 0 2px; }

.sidebar-brand {
  min-width: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 8px;
  color: var(--text-faint);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.collapse-btn:hover { background: rgba(255, 255, 255, 0.6); color: var(--text-secondary); }

/* ── Module tabs (stacked vertically) ── */
.module-tabs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 12px 0;
  flex-shrink: 0;
}
.sidebar.collapsed .module-tabs { padding: 4px 0 0; align-items: center; }

.module-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 5px;
  white-space: nowrap;
  text-align: left;
  text-decoration: none;
  transition: color 0.12s, background 0.12s;
}

.module-tab { font-weight: 550; }
.module-tab:hover  { color: var(--text-primary); background: rgba(255, 255, 255, 0.55); }
.module-tab.active { color: var(--accent-ink); background: var(--accent-soft); font-weight: 650; }
.module-tab.active .module-tab-icon { color: var(--accent); }

.module-tab-icon { display: flex; align-items: center; flex-shrink: 0; }

.sidebar.collapsed .module-tab {
  width: 36px;
  height: 36px;
  justify-content: center;
  padding: 0;
}

.sidebar-header {
  padding: 12px 12px 6px;
  flex-shrink: 0;
}
.sidebar.collapsed .sidebar-header {
  padding: 10px 0 6px;
  display: flex;
  justify-content: center;
}

.new-prompt-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  /* Elevated white card — the primary sidebar affordance. */
  background: var(--card);
  border: none;
  border-radius: var(--r-inner);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: box-shadow 0.12s, color 0.12s;
}

.new-prompt-btn:hover:not(:disabled) {
  box-shadow: var(--shadow);
  color: var(--text-primary);
}

.new-prompt-btn:disabled { opacity: 0.5; cursor: default; }

.sidebar.collapsed .new-prompt-btn {
  width: 36px;
  height: 36px;
  justify-content: center;
  gap: 0;
  padding: 0;
}

.new-prompt-icon { display: flex; align-items: center; flex-shrink: 0; color: var(--text-secondary); }

.prompt-list {
  flex: 1;
  overflow-y: auto;
  padding: 14px 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  /* Thin scrollbar — sidebar is narrow, thick scrollbar wastes real estate */
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.prompt-list-title {
  padding: 0 10px 8px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  line-height: 1.2;
}

.prompt-item-root {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 10px;
  width: 100%;
  color: var(--text-secondary);
  font-size: 13.5px;
  cursor: pointer;
  border-radius: var(--r-inner);
  transition: background 0.1s, box-shadow 0.1s, color 0.1s;
}

.prompt-item-root:hover {
  background: rgba(255, 255, 255, 0.55);
  color: var(--text-primary);
}

/* Selected recent = elevated white card, matching the cards it opens. */
.prompt-item-root.selected {
  background: var(--card);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  font-weight: 600;
}

.prompt-item-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Kebab actions — revealed on row hover (and kept visible for the selected row) */
.prompt-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.1s;
}
.prompt-item-root:hover .prompt-actions,
.prompt-item-root.selected .prompt-actions { opacity: 1; }

/* ── Settings footer ── */
.sidebar-footer {
  flex-shrink: 0;
  margin-top: auto;
  padding: 8px 6px 12px;
}
.sidebar.collapsed .sidebar-footer {
  padding: 8px 0 12px;
  display: flex;
  justify-content: center;
}

.settings-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text-secondary);
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  border-radius: var(--r-inner);
  transition: background 0.12s, color 0.12s;
}
.settings-btn:hover { background: rgba(255, 255, 255, 0.55); color: var(--text-primary); }

.sidebar.collapsed .settings-btn {
  width: 36px;
  height: 36px;
  justify-content: center;
  gap: 0;
  padding: 0;
}

.settings-icon { display: flex; align-items: center; flex-shrink: 0; }

.settings-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.settings-title { font-size: 13px; }
.settings-model {
  font-size: 10.5px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-input {
  width: 100%;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  padding: 8px 10px;
}
.modal-input:focus { outline: none; border-color: #aaa; }
</style>
