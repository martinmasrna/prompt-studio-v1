<script setup lang="ts">
// Sidebar component. Lists all prompts and owns the "New Prompt" action.
import { ref } from 'vue';
import { api } from '../api';
import { useAppState } from '../store/app';

const { prompts, selectedPromptId } = useAppState();

const creating = ref(false);

async function createPrompt() {
  if (creating.value) return;
  creating.value = true;
  try {
    const { id } = await api.prompts.create('Untitled prompt');
    prompts.value = await api.prompts.list();
    selectedPromptId.value = id;
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Could not create prompt');
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <button class="new-prompt-btn" :disabled="creating" @click="createPrompt">
        <span class="icon">+</span>
        <span>New Prompt</span>
      </button>
    </div>

    <nav class="prompt-list">
      <button
        v-for="prompt in prompts"
        :key="prompt.id"
        class="prompt-item-root"
        :class="{ selected: prompt.id === selectedPromptId }"
        @click="selectedPromptId = prompt.id"
      >
        {{ prompt.name }}
      </button>
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

.new-prompt-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.new-prompt-btn:disabled { opacity: 0.5; cursor: default; }

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
