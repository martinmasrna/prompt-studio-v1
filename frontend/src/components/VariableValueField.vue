<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const MAX_FIELD_HEIGHT = 360;
const MIN_FIELD_HEIGHT = 64;

const props = defineProps<{
  name: string;
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const expanded = ref(true);
const inputEl = ref<HTMLTextAreaElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let resizeFrame: number | null = null;

const isEmpty = computed(() => !props.modelValue.trim());
const valuePreview = computed(() => {
  const singleLine = props.modelValue.trim().replace(/\s+/g, ' ');
  if (!singleLine) return 'Empty';
  return singleLine.length > 40 ? `${singleLine.slice(0, 40)}...` : singleLine;
});

function resizeInput(): void {
  const el = inputEl.value;
  if (!el) return;

  el.style.height = 'auto';
  const nextHeight = Math.min(Math.max(el.scrollHeight + 2, MIN_FIELD_HEIGHT), MAX_FIELD_HEIGHT);
  el.style.height = `${nextHeight}px`;
  el.style.overflowY = el.scrollHeight > MAX_FIELD_HEIGHT ? 'auto' : 'hidden';
}

function scheduleResize(): void {
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    resizeInput();
  });
}

async function resizeAfterRender(): Promise<void> {
  await nextTick();
  scheduleResize();
}

function updateValue(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
  void resizeAfterRender();
}

function toggleExpanded(): void {
  expanded.value = !expanded.value;
  if (expanded.value) void resizeAfterRender();
}

watch(() => props.modelValue, () => {
  if (expanded.value) void resizeAfterRender();
});

watch(inputEl, (el) => {
  resizeObserver?.disconnect();
  resizeObserver = null;

  if (el && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => scheduleResize());
    resizeObserver.observe(el);
  }

  if (el) void resizeAfterRender();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
});
</script>

<template>
  <div class="variable-field">
    <button
      class="variable-header"
      :class="{ expanded }"
      type="button"
      :aria-expanded="expanded"
      :title="expanded ? `Collapse ${name}` : `Expand ${name}`"
      @click="toggleExpanded"
    >
      <span class="variable-icon">{{ expanded ? '-' : '+' }}</span>
      <span class="variable-name">{{ name }}</span>
      <span class="variable-preview" :class="{ empty: isEmpty }">{{ valuePreview }}</span>
    </button>

    <div v-if="expanded" class="variable-editor">
      <textarea
        ref="inputEl"
        class="variable-input"
        :value="modelValue"
        :aria-label="`Variable ${name}`"
        :placeholder="`{{${name}}}`"
        rows="2"
        spellcheck="false"
        @input="updateValue"
      />
      <slot />
    </div>
  </div>
</template>

<style scoped>
.variable-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.variable-header {
  display: grid;
  grid-template-columns: 20px minmax(80px, 160px) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px 4px 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.variable-header:hover { border-color: #d6d6d6; }
.variable-header:focus-visible {
  outline: none;
  border-color: #aaa;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.035);
}
.variable-header.expanded {
  border-bottom-color: #ececec;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.variable-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1;
  flex-shrink: 0;
}

.variable-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
}

.variable-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-size: 11px;
}
.variable-preview.empty { color: #b15c5c; }

.variable-editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.variable-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid #ececec;
  border-top: none;
  border-radius: 0 0 6px 6px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  min-height: 64px;
  max-height: 360px;
  padding: 8px 10px;
  line-height: 1.45;
  resize: none;
  overflow-x: hidden;
  transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
}
.variable-input:hover { border-color: #dddddd; }
.variable-input:focus {
  outline: none;
  border-color: #b8b8b8;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.035);
}
</style>
