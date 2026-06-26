<script setup lang="ts">
// A "⋮" trigger that toggles a dropdown anchored to it. Manages its own open
// state and closes on an outside click or after any item is chosen. Callers pass
// the menu items as <button> elements in the default slot; mark a destructive
// one with class="danger".
import { ref } from 'vue';

defineProps<{ label?: string }>();
const open = ref(false);
</script>

<template>
  <div class="menu-wrap">
    <button
      class="kebab"
      type="button"
      :aria-label="label ?? 'Actions'"
      :aria-expanded="open"
      @click.stop="open = !open"
    >&#8942;</button>
    <template v-if="open">
      <div class="menu-backdrop" @click.stop="open = false" />
      <div class="menu" role="menu" @click="open = false">
        <slot />
      </div>
    </template>
  </div>
</template>

<style scoped>
.menu-wrap { position: relative; }
.kebab { padding: 2px 6px; border: none; border-radius: 4px; background: none; color: var(--text-muted); font-size: 16px; line-height: 1; cursor: pointer; }
.kebab:hover { color: var(--text-primary); }
.kebab[aria-expanded="true"] { background: var(--bg-selected); color: var(--text-primary); }
.menu-backdrop { position: fixed; inset: 0; z-index: 1100; }
.menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 1101;
  min-width: 150px;
  margin-top: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  display: flex;
  flex-direction: column;
}
.menu :slotted(button) { width: 100%; padding: 7px 10px; border: none; border-radius: 4px; background: none; color: var(--text-secondary); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.menu :slotted(button:hover) { background: var(--bg-selected); color: var(--text-primary); }
.menu :slotted(button.danger) { color: #b33; }
.menu :slotted(button.danger:hover) { background: #fdeaea; }
</style>
