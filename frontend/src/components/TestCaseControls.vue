<script setup lang="ts">
// Scenario selector — the compact picker specialized for test cases (named sets
// of variable values). All behaviour lives in EntityControls + the test store;
// this just supplies the labels and the per-row description.
import EntityControls from './EntityControls.vue';
import { testStore } from '../store/testCases';

const labels = {
  newItem: 'New scenario',
  namePrompt: 'Name this scenario',
  renamePrompt: 'Rename scenario',
  emptyMenu: 'No saved scenario selected',
  actionsLabel: 'Test actions',
  pickerLabel: 'Open scenario picker',
  confirmDelete: (name: string) => `Delete saved test "${name}"?`,
  deleteError: 'Could not delete test',
};
</script>

<template>
  <EntityControls :store="testStore" :labels="labels">
    <template #row-note="{ item }">
      <span v-if="item.description" class="entity-row-note">{{ item.description }}</span>
    </template>
  </EntityControls>
</template>
