<script setup lang="ts">
// Collapses tall content to a fixed height with a Show more / Show less toggle.
// When the content fits within `collapsedMax`, no toggle is shown. Expanding
// caps the height at `expandedMax` with its own scroll, so a huge block can
// never make the surrounding card unbounded.
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{
  collapsedMax?: number;   // px height while collapsed
  expandedMax?: string;    // CSS max-height while expanded
}>(), {
  collapsedMax: 220,
  expandedMax: '50vh',
});

const inner = ref<HTMLElement | null>(null);
const overflowing = ref(false);
const expanded = ref(false);
let observer: ResizeObserver | null = null;

function measure() {
  const el = inner.value;
  if (el) overflowing.value = el.offsetHeight > props.collapsedMax + 4;
}

onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (inner.value) observer.observe(inner.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="clamp">
    <div
      class="clamp-viewport"
      :class="{ scroll: expanded }"
      :style="overflowing && !expanded
        ? { maxHeight: `${collapsedMax}px`, overflow: 'hidden' }
        : expanded ? { maxHeight: expandedMax } : {}"
    >
      <div ref="inner" class="clamp-inner"><slot /></div>
      <div v-if="overflowing && !expanded" class="clamp-fade" />
    </div>
    <button v-if="overflowing" class="clamp-toggle" @click="expanded = !expanded">
      {{ expanded ? 'Show less' : 'Show more' }}
    </button>
  </div>
</template>

<style scoped>
.clamp { position: relative; }
.clamp-viewport { position: relative; }
.clamp-viewport.scroll { overflow-y: auto; }
.clamp-fade {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 42px;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--clamp-bg, var(--bg)));
}
.clamp-toggle {
  margin-top: 6px;
  padding: 2px 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.clamp-toggle:hover { color: var(--text-primary); }
</style>
