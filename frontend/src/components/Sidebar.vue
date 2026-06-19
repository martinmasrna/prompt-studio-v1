<script setup lang="ts">
// Sidebar component. Lists all prompts, owns the "New Prompt" action, and
// hosts the module tabs (Overview / A/B Tester) for the selected prompt.
import { ref } from 'vue';
import { api } from '../api';
import { useAppState } from '../store/app';
import { activeModule, type ModuleTab } from '../store/editor';
import { showSettings, activeModelLabel } from '../store/settings';

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

// ── Delete a prompt ────────────────────────────────────────────────────────────
async function deletePrompt(id: number, name: string) {
  if (!confirm(`Delete "${name}" and all its data? This cannot be undone.`)) return;
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
    <!-- Collapse toggle -->
    <div class="sidebar-top">
      <button
        class="collapse-btn"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="collapsed = !collapsed"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline v-if="collapsed" points="9 18 15 12 9 6" />
          <polyline v-else points="15 18 9 12 15 6" />
        </svg>
      </button>
    </div>

    <!-- Module tabs for the selected prompt -->
    <nav v-if="selectedPromptId !== null" class="module-tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="module-tab"
        :class="{ active: activeModule === tab.id }"
        :title="tab.label"
        @click="activeModule = tab.id"
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
      </button>
    </nav>

    <div class="sidebar-header">
      <button class="new-prompt-btn" :title="collapsed ? 'New Prompt' : undefined" @click="openNewModal">
        <span class="icon">+</span>
        <span v-if="!collapsed">New Prompt</span>
      </button>
    </div>

    <nav v-if="!collapsed" class="prompt-list">
      <div
        v-for="prompt in prompts"
        :key="prompt.id"
        class="prompt-item-root"
        :class="{ selected: prompt.id === selectedPromptId }"
        @click="selectedPromptId = prompt.id"
      >
        <span class="prompt-item-name">{{ prompt.name }}</span>
        <button
          class="prompt-delete"
          title="Delete prompt"
          @click.stop="deletePrompt(prompt.id, prompt.name)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
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
  <Teleport to="body">
    <div v-if="showNewModal" class="overlay" @click.self="showNewModal = false">
      <div class="modal">
        <h2 class="modal-title">New prompt</h2>

        <input
          v-model="newName"
          class="modal-input"
          placeholder="Prompt name"
          @keydown.enter="createPrompt"
          @keydown.escape="showNewModal = false"
          autofocus
        />

        <div class="modal-actions">
          <button class="btn-ghost" @click="showNewModal = false">Cancel</button>
          <button class="btn-primary" :disabled="creating || !newName.trim()" @click="createPrompt">
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sidebar {
  width: 210px;
  flex-shrink: 0;
  height: 100vh;
  background: var(--bg-sunken);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.16s ease;
}

.sidebar.collapsed { width: 52px; }

/* ── Collapse toggle ── */
.sidebar-top {
  display: flex;
  justify-content: flex-end;
  padding: 10px 12px 0;
  flex-shrink: 0;
}
.sidebar.collapsed .sidebar-top { justify-content: center; padding: 10px 0 0; }

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.collapse-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

/* ── Module tabs (stacked vertically) ── */
.module-tabs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 12px 0;
  flex-shrink: 0;
}
.sidebar.collapsed .module-tabs { padding: 12px 0 0; align-items: center; }

.module-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
  text-align: left;
  transition: color 0.12s, background 0.12s;
}

.module-tab:hover  { color: var(--text-secondary); background: var(--bg-hover); }
.module-tab.active { color: var(--text-white); background: var(--bg-selected); }

.module-tab-icon { display: flex; align-items: center; flex-shrink: 0; }

.sidebar.collapsed .module-tab {
  width: 36px;
  height: 36px;
  justify-content: center;
  padding: 0;
}

.sidebar-header {
  padding: 16px 12px 12px;
  flex-shrink: 0;
}
.sidebar.collapsed .sidebar-header {
  padding: 12px 0 8px;
  display: flex;
  justify-content: center;
}

.new-prompt-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, color 0.12s;
}

.new-prompt-btn:hover:not(:disabled) {
  background: var(--bg-hover);
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

.icon {
  font-size: 16px;
  line-height: 1;
  color: var(--text-faint);
}

.prompt-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  /* Thin scrollbar — sidebar is narrow, thick scrollbar wastes real estate */
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.prompt-item-root {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  width: 100%;
  color: var(--text-secondary);
  font-size: 13.5px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.1s, color 0.1s;
}

.prompt-item-root:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.prompt-item-root.selected {
  background: var(--bg-selected);
  color: var(--text-white);
}

.prompt-item-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Delete button — revealed on row hover */
.prompt-delete {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
}
.prompt-item-root:hover .prompt-delete { opacity: 1; }
.prompt-delete:hover { color: #c04040; }

/* ── Settings footer ── */
.sidebar-footer {
  flex-shrink: 0;
  padding: 8px 12px 12px;
  border-top: 1px solid var(--border);
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
  color: var(--text-muted);
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, color 0.12s;
}
.settings-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

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
  color: var(--text-faint);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
