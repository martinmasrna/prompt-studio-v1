<script setup lang="ts">
// The variables section shared by the Sandbox and A/B views: one input per
// variable the current prompt version(s) use, plus two helpers for reconciling a
// loaded test whose variable names differ from this version (e.g. after a rename):
//
//   • An empty field offers "Fill from…" — copy in a value the test carries under
//     a different name. It *copies*, leaving the source key intact, so any other
//     version that still uses that name keeps working.
//   • "Clean up" removes values no version references anymore (true orphans).
//     A value still used by another version is never an orphan, so it's safe.
import { computed } from 'vue';
import { variableValues, versions } from '../store/editor';
import { extractVariables } from '../utils/variables';

const props = defineProps<{ detectedVars: string[]; hideLabel?: boolean }>();

function isEmpty(name: string): boolean {
  return !variableValues.value[name]?.trim();
}

// Values the loaded test carries but this version doesn't use — candidates to
// copy into an empty field (the old name's value after a rename, typically).
const carried = computed(() => {
  const used = new Set(props.detectedVars);
  return Object.entries(variableValues.value)
    .filter(([name, value]) => !used.has(name) && value.trim() !== '')
    .map(([name, value]) => ({ name, value }));
});

// Names referenced by ANY version (plus whatever this view currently shows).
// Anything in the bag outside this set is a true orphan, safe to remove.
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

function fillFrom(target: string, source: string): void {
  if (!source) return;
  variableValues.value = { ...variableValues.value, [target]: variableValues.value[source] };
}

function cleanup(): void {
  const next = { ...variableValues.value };
  for (const name of orphans.value) delete next[name];
  variableValues.value = next;
}

function preview(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, ' ');
  return collapsed.length > 40 ? `${collapsed.slice(0, 40)}…` : collapsed;
}
</script>

<template>
  <div v-if="detectedVars.length" class="field-block">
    <label v-if="!hideLabel" class="field-label">Variables</label>
    <!-- Children are indented under the header so the grouping reads as
         containment rather than another flat list of fields. -->
    <div class="var-list" :class="{ 'no-indent': hideLabel }">
      <div v-for="name in detectedVars" :key="name" class="var-row">
        <label class="var-name">{{ name }}</label>
        <div class="var-field">
          <textarea
            v-model="variableValues[name]"
            class="var-input"
            :aria-label="`Variable ${name}`"
            :placeholder="`{{${name}}}`"
            rows="2"
            spellcheck="false"
          />
          <select
            v-if="isEmpty(name) && carried.length"
            class="fill-from"
            :aria-label="`Fill ${name} from another value`"
            @change="fillFrom(name, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Fill from…</option>
            <option v-for="item in carried" :key="item.name" :value="item.name">
              {{ item.name }} — {{ preview(item.value) }}
            </option>
          </select>
        </div>
      </div>
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
  gap: 12px;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
/* Inside the titled Variables box, drop the indent line — the box already groups. */
.var-list.no-indent { padding-left: 0; border-left: none; }
.var-row { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.var-name { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }

.var-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

.var-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid #ececec;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  min-height: 64px;
  max-height: 320px;
  padding: 8px 10px;
  line-height: 1.45;
  resize: vertical;
  overflow: auto;
  transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
}
.var-input:hover { border-color: #dddddd; }
.var-input:focus {
  outline: none;
  border-color: #b8b8b8;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.035);
}

.fill-from {
  align-self: flex-start;
  max-width: 100%;
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
