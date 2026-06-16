<script setup lang="ts">
// Sidebar component. Owns data fetching for the folder tree and prompt list —
// placing it here (rather than App.vue) keeps the root clean and the sidebar
// self-contained. When we add the prompt editor, App.vue will lift this data up.
import { ref, computed } from 'vue';
import { api } from '../api';
import { useAppState } from '../store/app';
import FolderItem from './FolderItem.vue';

const { folders, prompts, selectedPromptId } = useAppState();

const unfolderedPrompts = computed(() =>
  prompts.value.filter(p => p.folder_id === null)
);

const uncategorizedDragOver = ref(false);

function onDragStart(e: DragEvent, promptId: number) {
  e.dataTransfer!.setData('text/plain', String(promptId));
  e.dataTransfer!.effectAllowed = 'move';
}

async function onDropUncategorized(e: DragEvent) {
  uncategorizedDragOver.value = false;
  const promptId = Number(e.dataTransfer?.getData('text/plain'));
  if (!promptId) return;
  const p = prompts.value.find(p => p.id === promptId);
  if (!p || p.folder_id === null) return;
  p.folder_id = null;
  await api.prompts.patch(promptId, { folder_id: null });
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <button class="new-prompt-btn">
        <span class="icon">+</span>
        <span>New Prompt</span>
      </button>
    </div>

    <nav class="folder-list">
      <FolderItem
        v-for="folder in folders"
        :key="folder.id"
        :folder="folder"
        :allPrompts="prompts"
      />

      <!-- Prompts not assigned to any folder -->
      <template v-if="unfolderedPrompts.length > 0">
        <div
          class="section-label"
          :class="{ 'drag-over': uncategorizedDragOver }"
          @dragover.prevent="uncategorizedDragOver = true"
          @dragleave="uncategorizedDragOver = false"
          @drop.prevent="onDropUncategorized"
        >Uncategorized</div>
        <button
          v-for="prompt in unfolderedPrompts"
          :key="prompt.id"
          class="prompt-item-root"
          :class="{ selected: prompt.id === selectedPromptId }"
          draggable="true"
          @dragstart="onDragStart($event, prompt.id)"
          @click="selectedPromptId = prompt.id"
        >
          {{ prompt.name }}
        </button>
      </template>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  flex-shrink: 0;
  height: 100vh;
  background: var(--bg-sunken);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 20px 12px 12px;
  flex-shrink: 0;
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

.new-prompt-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon {
  font-size: 16px;
  line-height: 1;
  color: var(--text-faint);
}

.folder-list {
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

.section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
  padding: 12px 8px 4px;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}
.section-label.drag-over { background: var(--bg-selected); color: var(--text-primary); }

.prompt-item-root {
  display: block;
  padding: 6px 10px;
  width: 100%;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13.5px;
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
</style>
