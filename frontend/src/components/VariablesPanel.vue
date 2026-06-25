<script setup lang="ts">
// Shared variables section for Sandbox and A/B views. This component owns the
// list-level helpers; each variable row owns its own editor lifecycle.
import { computed } from 'vue';
import { variableValues, versions } from '../store/editor';
import { extractVariables } from '../utils/variables';
import VariableValueField from './VariableValueField.vue';

const props = defineProps<{ detectedVars: string[]; hideLabel?: boolean }>();

function isEmpty(name: string): boolean {
  return !variableValues.value[name]?.trim();
}

// Values the loaded test carries but this version does not use. These are
// candidates to copy into an empty field after a variable rename.
const carried = computed(() => {
  const used = new Set(props.detectedVars);
  return Object.entries(variableValues.value)
    .filter(([name, value]) => !used.has(name) && value.trim() !== '')
    .map(([name, value]) => ({ name, value }));
});

// Names referenced by any version, plus whatever this view currently shows.
// Anything outside this set is a true orphan and safe to remove.
const referenced = computed(() => {
  const set = new Set(props.detectedVars);
  for (const version of versions.value) {
    for (const name of extractVariables(version.text)) set.add(name);
  }
  return set;
});

const orphans = computed(() =>
  Object.keys(variableValues.value).filter(name => !referenced.value.has(name))
);

function setVariable(name: string, value: string): void {
  variableValues.value = { ...variableValues.value, [name]: value };
}

function fillFrom(target: string, source: string): void {
  if (!source) return;
  setVariable(target, variableValues.value[source]);
}

function cleanup(): void {
  const next = { ...variableValues.value };
  for (const name of orphans.value) delete next[name];
  variableValues.value = next;
}

function preview(value: string): string {
  const singleLine = value.trim().replace(/\s+/g, ' ');
  return singleLine.length > 40 ? `${singleLine.slice(0, 40)}...` : singleLine;
}
</script>

<template>
  <div v-if="detectedVars.length" class="field-block">
    <label v-if="!hideLabel" class="field-label">Variables</label>
    <div class="var-list" :class="{ 'no-indent': hideLabel }">
      <VariableValueField
        v-for="name in detectedVars"
        :key="name"
        :name="name"
        :model-value="variableValues[name] ?? ''"
        @update:model-value="setVariable(name, $event)"
      >
        <select
          v-if="isEmpty(name) && carried.length"
          class="fill-from"
          :aria-label="`Fill ${name} from another value`"
          @change="fillFrom(name, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Fill from...</option>
          <option v-for="item in carried" :key="item.name" :value="item.name">
            {{ item.name }} - {{ preview(item.value) }}
          </option>
        </select>
      </VariableValueField>
    </div>
    <button v-if="orphans.length" class="cleanup-btn" @click="cleanup">
      Clean up {{ orphans.length }} unused value{{ orphans.length === 1 ? '' : 's' }}
    </button>
  </div>
</template>

<style scoped>
.field-block { display: flex; flex-direction: column; gap: 7px; }

.field-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.var-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
.var-list.no-indent { padding-left: 0; border-left: none; }

.fill-from {
  align-self: flex-start;
  max-width: 100%;
  margin-top: 4px;
  background: var(--bg-sunken);
  border: 1px dashed var(--border);
  border-radius: 5px;
  color: var(--text-secondary);
  font-size: 11px;
  font-family: inherit;
  padding: 2px 6px;
  cursor: pointer;
}
.fill-from:focus { outline: none; border-color: #aaa; }

.cleanup-btn {
  align-self: flex-start;
  margin-top: 2px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-secondary);
  font-size: 11px;
  font-family: inherit;
  min-height: 30px;
  padding: 5px 9px;
  cursor: pointer;
}
.cleanup-btn:hover { color: var(--text-primary); border-color: #aaa; }
</style>
