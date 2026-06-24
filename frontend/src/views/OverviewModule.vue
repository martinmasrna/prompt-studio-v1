<script setup lang="ts">
// Two-panel layout for the Overview module: prompt authoring on the left,
// the test sandbox on the right. Both are always visible — you want the
// prompt and its evaluation side by side.
import LeftPanel from './LeftPanel.vue';
import SandboxPanel from './SandboxPanel.vue';
</script>

<template>
  <div class="overview">
    <div class="panel left">
      <LeftPanel />
    </div>
    <div class="panel right">
      <SandboxPanel />
    </div>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex: 1;
  overflow: hidden;
  height: 100%;
}

.panel {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.left {
  flex: 50;
  min-width: 0;
  border-right: 1px solid var(--border);
}

.right {
  flex: 50;
  min-width: 0;
}
</style>
