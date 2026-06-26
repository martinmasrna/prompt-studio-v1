<script setup lang="ts">
// Config selector — the compact picker specialized for sampling-parameter sets.
// All behaviour lives in EntityControls + the config store; this just supplies
// the labels and the per-row parameter summary.
import EntityControls from './EntityControls.vue';
import { configStore } from '../store/configs';

const labels = {
  newItem: 'New preset',
  namePrompt: 'Name this preset',
  renamePrompt: 'Rename preset',
  emptyMenu: 'No saved preset selected',
  actionsLabel: 'Config actions',
  pickerLabel: 'Open config picker',
  confirmDelete: (name: string) => `Delete saved config "${name}"?`,
  deleteError: 'Could not delete config',
};
</script>

<template>
  <EntityControls :store="configStore" :labels="labels">
    <template #row-note="{ item }">
      <span class="entity-row-note">T {{ item.temperature }} · P {{ item.top_p }} · K {{ item.top_k }}</span>
    </template>
  </EntityControls>
</template>
