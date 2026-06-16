<script setup lang="ts">
// Two-panel layout for the Overview module.
// The sandbox (right panel) is open by default and can be collapsed via the
// toggle at the panel boundary. When collapsed, LeftPanel expands to full width.
import { ref } from 'vue';
import LeftPanel from './LeftPanel.vue';
import SandboxPanel from './SandboxPanel.vue';
import { activeVersionText } from '../store/editor';

const sandboxOpen = ref(true);

</script>

<template>
  <div class="overview" :class="{ 'sandbox-closed': !sandboxOpen }">
    <!-- Left panel -->
    <div class="panel left">
      <LeftPanel />
    </div>

    <!-- Toggle -->
    <button
      class="panel-toggle"
      :title="sandboxOpen ? 'Collapse sandbox' : 'Expand sandbox'"
      @click="sandboxOpen = !sandboxOpen"
    >
      <svg
        width="12" height="12" viewBox="0 0 12 12" fill="none"
        :style="{ transform: sandboxOpen ? 'none' : 'rotate(180deg)' }"
      >
        <path d="M7.5 2L4 6L7.5 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!-- Right panel (sandbox) -->
    <Transition name="slide">
      <div v-if="sandboxOpen" class="panel right">
        <SandboxPanel />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex: 1;
  overflow: hidden;
  height: 100%;
}

.panel { overflow: hidden; display: flex; flex-direction: column; }

.left {
  flex: 55;
  min-width: 0;
  border-right: 1px solid var(--border);
}

.right {
  flex: 45;
  min-width: 0;
}

/* Panel toggle button sits at the boundary */
.panel-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-right: 1px solid var(--border);
  color: var(--text-faint);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  position: relative;
  z-index: 1;
}
.panel-toggle:hover { color: var(--text-secondary); background: var(--bg-hover); }

/* Collapse state: left panel takes full width */
.sandbox-closed .left { border-right: none; }

/* Slide transition for the sandbox panel */
.slide-enter-active,
.slide-leave-active { transition: width 0.22s ease, opacity 0.18s ease; overflow: hidden; }
.slide-enter-from,
.slide-leave-to    { width: 0 !important; opacity: 0; }
</style>
