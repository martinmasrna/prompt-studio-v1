<script setup lang="ts">
// Root component. Bootstraps shared data and coordinates top-level layout.
// When selectedPromptId changes, loads full prompt detail + branch tree into
// the editor store so TopNav, LeftPanel, and SandboxPanel all read from one source.
import { ref, watch, onMounted } from 'vue';
import { api } from './api';
import { useAppState } from './store/app';
import {
  activeModule, activePromptData, activeBranchId, activeVersionId,
  activeVersionText, branchTree, variableValues, sandboxOutput,
} from './store/editor';
import Sidebar from './components/Sidebar.vue';
import TopNav from './components/TopNav.vue';
import OverviewModule from './views/OverviewModule.vue';
import ABTesterModule from './views/ABTesterModule.vue';
import ComingSoon from './views/ComingSoon.vue';

const { folders, prompts, selectedPromptId } = useAppState();

// Load sidebar data on mount
onMounted(async () => {
  [folders.value, prompts.value] = await Promise.all([
    api.folders.list(),
    api.prompts.list(),
  ]);
});

// Load editor data whenever the selected prompt changes
watch(selectedPromptId, async (id) => {
  sandboxOutput.value = null;

  if (id === null) {
    activePromptData.value = null;
    branchTree.value = [];
    activeVersionId.value = null;
    activeBranchId.value = null;
    activeVersionText.value = '';
    variableValues.value = {};
    return;
  }

  const [detail, branches] = await Promise.all([
    api.prompts.get(id),
    api.prompts.branches(id),
  ]);

  activePromptData.value = detail;
  branchTree.value = branches;

  const cv = detail.current_version;
  activeVersionId.value  = cv?.id ?? null;
  activeBranchId.value   = cv?.branch_id ?? null;
  activeVersionText.value = cv?.text ?? '';
  variableValues.value = {};
});

// TopNav emits openSaveModal which we relay to it (it owns the modal internally)
// — nothing needed here; OverviewModule → TopNav communication is via store.
</script>

<template>
  <Sidebar />

  <div class="workspace">
    <template v-if="selectedPromptId !== null">
      <TopNav />

      <div class="module-area">
        <OverviewModule v-if="activeModule === 'overview'" />
        <ABTesterModule v-else-if="activeModule === 'ab-tester'" />
        <ComingSoon v-else-if="activeModule === 'doctor'"     label="Prompt Doctor" />
        <ComingSoon v-else-if="activeModule === 'brancher'"   label="Prompt Brancher" />
      </div>
    </template>

    <div v-else class="empty-state">
      <p class="empty-headline">Your prompts, engineered.</p>
      <p class="empty-sub">Select a prompt or create a new one.</p>
    </div>
  </div>
</template>

<style scoped>
.workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100vh;
}

.module-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  user-select: none;
}

.empty-headline { font-size: 18px; font-weight: 400; color: var(--text-faint); letter-spacing: -0.01em; }
.empty-sub      { font-size: 13px; color: var(--text-faint); opacity: 0.6; }
</style>
