<script setup lang="ts">
// Sampling-parameter editor (temperature / top-p / top-k / max-tokens + a
// thinking toggle), bound directly to the shared config store. Used by the
// Sandbox's Parameters box and the A/B tester's shared-config card.
import { temperature, topP, topK, maxTokens, enableThinking } from '../store/configs';

// The A/B tester wants the toggle to span the card width; the Sandbox hugs it left.
defineProps<{ fullWidthToggle?: boolean }>();
</script>

<template>
  <div class="param-grid">
    <div class="param">
      <label class="field-label">Temperature <span class="param-value">{{ temperature.toFixed(2) }}</span></label>
      <input v-model.number="temperature" aria-label="Temperature" type="range" min="0" max="2" step="0.01" class="slider" />
    </div>
    <div class="param">
      <label class="field-label">Top-P <span class="param-value">{{ topP.toFixed(2) }}</span></label>
      <input v-model.number="topP" aria-label="Top-P" type="range" min="0" max="1" step="0.01" class="slider" />
    </div>
    <div class="param">
      <label class="field-label">Top-K</label>
      <input v-model.number="topK" aria-label="Top-K" type="number" min="1" max="200" class="num-input" />
    </div>
    <div class="param">
      <label class="field-label">Max tokens</label>
      <input v-model.number="maxTokens" aria-label="Max tokens" type="number" min="64" max="32768" class="num-input" />
    </div>
  </div>

  <label class="toggle-row" :class="{ 'full-width': fullWidthToggle }">
    <span class="toggle-label">Thinking mode</span>
    <button
      class="toggle-switch"
      :class="{ on: enableThinking }"
      role="switch"
      :aria-checked="enableThinking"
      @click="enableThinking = !enableThinking"
    >
      <span class="toggle-thumb" />
    </button>
  </label>
</template>

<style scoped>
.param-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px 16px; }
.param { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.param-value { font-weight: 400; color: var(--text-secondary); font-size: 10px; text-transform: none; letter-spacing: 0; }

.slider { width: 100%; accent-color: #888; cursor: pointer; }

.num-input {
  width: 100%;
  min-height: 34px;
  padding: 6px 9px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
}
.num-input:focus { outline: none; border-color: #aaa; }

.toggle-row { display: flex; align-items: center; gap: 10px; align-self: flex-start; margin-top: 16px; cursor: pointer; }
.toggle-row.full-width { width: 100%; justify-content: space-between; }
.toggle-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }

.toggle-switch {
  position: relative;
  width: 32px;
  height: 18px;
  padding: 0;
  background: var(--border);
  border: none;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.18s;
  flex-shrink: 0;
}
.toggle-switch.on { background: #1a1a1a; }
.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.18s;
  display: block;
}
.toggle-switch.on .toggle-thumb { transform: translateX(14px); }
</style>
