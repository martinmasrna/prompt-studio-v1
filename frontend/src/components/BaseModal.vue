<script setup lang="ts">
// The shared modal shell: a dimmed full-screen backdrop with a centered card,
// teleported to <body> so it floats above everything regardless of nesting.
// Closes on Escape or a click on the backdrop. Callers fill the optional #title
// and #actions slots and the default slot (the body); the action buttons' own
// styling stays with the caller.
defineProps<{ width?: string }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="$emit('close')" @keydown.esc.window="$emit('close')">
      <div class="modal" :style="width ? { width: `min(${width}, 92vw)` } : undefined">
        <h2 v-if="$slots.title" class="modal-title"><slot name="title" /></h2>
        <slot />
        <div v-if="$slots.actions" class="modal-actions"><slot name="actions" /></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}
.modal {
  width: min(480px, 92vw);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
.modal-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
