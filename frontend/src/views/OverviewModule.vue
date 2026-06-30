<script setup lang="ts">
// Two-panel layout for the Overview module: prompt authoring on the left,
// the test sandbox on the right. Both are always visible — you want the
// prompt and its evaluation side by side. The content area splits into two
// equal halves on a neutral-soft canvas; LEFT is one elevated prompt card,
// RIGHT is a column of run cards (Variables → Parameters → Run → Output).
import LeftPanel from './LeftPanel.vue';
import SandboxPanel from './SandboxPanel.vue';
</script>

<template>
  <div class="overview">
    <div class="prompt-card">
      <LeftPanel />
    </div>
    <div class="run-col">
      <SandboxPanel />
    </div>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex: 1;
  /* Scale the canvas gutters with viewport width: caps at 18px on big monitors,
     shrinks on smaller screens so fixed padding doesn't dominate. */
  gap: clamp(11px, 1.2vw, 18px);
  padding: clamp(11px, 1.2vw, 18px);
  height: 100%;
  overflow: hidden;
  background: var(--canvas);
}

/* LEFT — one elevated card holding the prompt template. */
.prompt-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--card);
  border-radius: var(--r);
  box-shadow: var(--shadow);
}

/* RIGHT — transparent column; its children (the run stack) are the cards. */
.run-col {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Below ~1100px the 50/50 split crowds; stack the halves and let the page
   scroll. (Sidebar collapse is user-controlled.) */
@media (max-width: 1100px) {
  .overview {
    flex-direction: column;
    overflow-y: auto;
    gap: 14px;
    padding: 14px;
  }
  .prompt-card {
    flex: none;
    min-height: 460px;
  }
  .run-col {
    flex: none;
  }
}
</style>
