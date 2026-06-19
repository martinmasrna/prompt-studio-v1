<script setup lang="ts">
// Root component. Bootstraps shared data and coordinates top-level layout.
// When selectedPromptId changes, loads full prompt detail + version list into
// the editor store so the sidebar, LeftPanel, and SandboxPanel all read from one source.
import { ref, watch, onMounted } from 'vue';
import { api } from './api';
import { useAppState } from './store/app';
import {
  activeModule, activePromptData, activeVersionId,
  activeVersionText, versions, variableValues, sandboxOutput,
} from './store/editor';
import Sidebar from './components/Sidebar.vue';
import SaveVersionModal from './components/SaveVersionModal.vue';
import SettingsModal from './components/SettingsModal.vue';
import OverviewModule from './views/OverviewModule.vue';
import ABTesterModule from './views/ABTesterModule.vue';
import ResultsModule from './views/ResultsModule.vue';
import IssuesModule from './views/IssuesModule.vue';
import { loadModels } from './store/settings';
import { loadTestCases } from './store/testCases';

const { prompts, selectedPromptId } = useAppState();

// Load sidebar data + available models on mount
onMounted(async () => {
  prompts.value = await api.prompts.list();
  loadModels();
});

// Load editor data whenever the selected prompt changes
watch(selectedPromptId, async (id) => {
  sandboxOutput.value = null;

  if (id === null) {
    activePromptData.value = null;
    versions.value = [];
    activeVersionId.value = null;
    activeVersionText.value = '';
    variableValues.value = {};
    await loadTestCases(null);
    return;
  }

  const [detail, versionList] = await Promise.all([
    api.prompts.get(id),
    api.prompts.versions(id),
    loadTestCases(id),
  ]);

  activePromptData.value = detail;
  versions.value = versionList;

  const cv = detail.current_version;
  activeVersionId.value  = cv?.id ?? null;
  activeVersionText.value = cv?.text ?? '';
});

</script>

<template>
  <Sidebar />

  <div class="workspace">
    <template v-if="selectedPromptId !== null">
      <div class="module-area">
        <OverviewModule v-if="activeModule === 'overview'" />
        <ABTesterModule v-else-if="activeModule === 'ab-tester'" />
        <ResultsModule v-else-if="activeModule === 'results'" />
        <IssuesModule v-else-if="activeModule === 'issues'" />
      </div>
    </template>

    <div v-else class="empty-state">
      <p class="empty-headline">Your prompts, engineered.</p>
      <p class="empty-sub">Select a prompt or create a new one.</p>
    </div>
  </div>

  <SaveVersionModal />
  <SettingsModal />
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
