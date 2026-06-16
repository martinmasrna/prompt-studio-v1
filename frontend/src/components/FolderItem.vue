<script setup lang="ts">
// Recursive component — renders one folder, its prompts, then its child folders.
// Vue 3 infers the component name from the filename, so <FolderItem> inside the
// template is a valid self-reference without any explicit registration.
import { ref, computed } from 'vue';
import type { FolderNode, Prompt } from '../api';
import { api } from '../api';
import { useAppState } from '../store/app';

const props = defineProps<{
  folder: FolderNode;
  allPrompts: Prompt[];
  depth?: number;
}>();

const { selectedPromptId, prompts } = useAppState();

const isExpanded = ref(true);
const dragOver   = ref(false);

const folderPrompts = computed(() =>
  props.allPrompts.filter(p => p.folder_id === props.folder.id)
);

const depth = computed(() => props.depth ?? 0);
const promptIndent = computed(() => 16 + depth.value * 12);
const folderIndent = computed(() => 8 + depth.value * 12);

function onDragStart(e: DragEvent, promptId: number) {
  e.dataTransfer!.setData('text/plain', String(promptId));
  e.dataTransfer!.effectAllowed = 'move';
}

async function onDrop(e: DragEvent) {
  dragOver.value = false;
  const promptId = Number(e.dataTransfer?.getData('text/plain'));
  if (!promptId) return;
  const p = prompts.value.find(p => p.id === promptId);
  if (!p || p.folder_id === props.folder.id) return;
  p.folder_id = props.folder.id;
  await api.prompts.patch(promptId, { folder_id: props.folder.id });
}
</script>

<template>
  <div class="folder-item">
    <button
      class="folder-header"
      :class="{ 'drag-over': dragOver }"
      :style="{ paddingLeft: `${folderIndent}px` }"
      @click="isExpanded = !isExpanded"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <span class="chevron" :class="{ expanded: isExpanded }">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="folder-name">{{ folder.name }}</span>
    </button>

    <div v-if="isExpanded" class="folder-body">
      <button
        v-for="prompt in folderPrompts"
        :key="prompt.id"
        class="prompt-item"
        :class="{ selected: prompt.id === selectedPromptId }"
        :style="{ paddingLeft: `${promptIndent}px` }"
        draggable="true"
        @dragstart="onDragStart($event, prompt.id)"
        @click="selectedPromptId = prompt.id"
      >
        {{ prompt.name }}
      </button>

      <!-- Recurse into child folders -->
      <FolderItem
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :allPrompts="allPrompts"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
.folder-item {
  display: flex;
  flex-direction: column;
}

.folder-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 12px;
  width: 100%;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}

.folder-header:hover { color: var(--text-secondary); }
.folder-header.drag-over { background: var(--bg-selected); color: var(--text-primary); }

.chevron {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--text-faint);
  transition: transform 0.18s ease;
}

.chevron.expanded { transform: rotate(90deg); }

.folder-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 4px;
}

.prompt-item {
  display: block;
  padding-top: 6px;
  padding-bottom: 6px;
  padding-right: 12px;
  width: 100%;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13.5px;
  font-weight: 400;
  cursor: grab;
  text-align: left;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.1s, color 0.1s;
}

.prompt-item:hover  { background: var(--bg-hover); color: var(--text-primary); }
.prompt-item.selected { background: var(--bg-selected); color: var(--text-white); }
</style>
