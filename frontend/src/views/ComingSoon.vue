<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
  <div class="coming-soon">
    <p class="label">{{ label }}</p>
    <p class="sub">Coming soon.</p>
  </div>
</template>

<style scoped>
.coming-soon {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  user-select: none;
}
.label { font-size: 15px; color: var(--text-faint); }
.sub   { font-size: 13px; color: var(--text-faint); opacity: 0.5; }
</style>
