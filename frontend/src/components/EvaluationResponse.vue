<script setup lang="ts">
// An evaluation's outcome, clamped to a readable height: the model response as
// Markdown, or the execution error, or an empty-response note. Shared by the
// Results timeline's single-run cards and the comparison sides.
import { renderContent } from '../utils/renderContent';
import ClampBlock from './ClampBlock.vue';

defineProps<{ responseText: string | null; errorText: string | null }>();
</script>

<template>
  <ClampBlock>
    <div v-if="responseText" class="markdown-body resp-md" v-html="renderContent(responseText)" />
    <p v-else-if="errorText" class="resp-error">{{ errorText }}</p>
    <p v-else class="resp-empty">(empty response)</p>
  </ClampBlock>
</template>

<style scoped>
.resp-md { font-size: 13px; }
.resp-error { color: #c04040; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.resp-empty { color: var(--text-faint); font-size: 13px; }
</style>
