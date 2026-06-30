<script setup lang="ts">
// CodeMirror 6 editor for prompt text. The prompt is the literal string sent to
// the model, so this is a *source* editor: markdown markers stay visible and get
// colour/weight (never a size change), VSCode-style, rather than being rendered
// away. {{variables}} are highlighted via a decoration. Hand-composed from the
// individual modules (no `basicSetup`) to skip the code-editor chrome — no line
// numbers, fold gutter, or active-line highlight — that doesn't suit prose.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { EditorState } from '@codemirror/state';
import {
  EditorView, keymap, drawSelection, highlightSpecialChars,
  ViewPlugin, Decoration, MatchDecorator,
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string]; save: [] }>();

const host = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

// Markdown token styling — colour/weight only so glyph metrics never change.
// Markers (#, **, `) map to processingInstruction and get dimmed, like VSCode.
const promptHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '600', color: 'var(--text-primary)' },
  { tag: tags.strong, fontWeight: '600', color: 'var(--text-primary)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, color: '#9a5a20' },
  { tag: tags.link, color: '#3a6ea5' },
  { tag: tags.url, color: 'var(--text-muted)' },
  { tag: tags.quote, color: 'var(--text-secondary)' },
  // Syntax markers only (#, **, `, -, >) — dimmed but legible. NOT tags.list,
  // which the grammar applies to the whole list body, not just the marker.
  { tag: tags.processingInstruction, color: 'var(--text-muted)' },
]);

// {{variable}} highlighting, mirroring the placeholder syntax used elsewhere.
const variableMatcher = new MatchDecorator({
  regexp: /\{\{(\w+)\}\}/g,
  decoration: Decoration.mark({ class: 'cm-variable' }),
});
const variablePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(v: EditorView) { this.decorations = variableMatcher.createDeco(v); }
    update(u: ViewUpdate) { this.decorations = variableMatcher.updateDeco(u, this.decorations); }
  },
  { decorations: v => v.decorations }
);

// Soft-surfaces: the editor is an inset, sunken field (no outline border) that
// sits "into" the prompt card. Focus shows the slate accent, not a grey border.
const theme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bg-sunken)',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
    borderRadius: 'var(--r-inner)',
    fontSize: '12.5px',
  },
  '&.cm-editor': { height: '100%' },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-soft)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.85', overflow: 'auto' },
  '.cm-content': { padding: '16px 18px' },
  '.cm-cursor': { borderLeftColor: 'var(--text-primary)' },
  // {{variable}} chips — the single sanctioned accent inside the prompt text.
  '.cm-variable': {
    color: 'var(--accent-ink)',
    backgroundColor: 'var(--accent-soft)',
    fontWeight: '650',
    borderRadius: '4px',
    padding: '0 3px',
  },
});

function createState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      history(),
      drawSelection(),
      highlightSpecialChars(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: 'false', 'aria-label': 'Prompt text' }),
      markdown(),
      syntaxHighlighting(promptHighlight),
      variablePlugin,
      theme,
      keymap.of([
        { key: 'Mod-s', preventDefault: true, run: () => { emit('save'); return true; } },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.updateListener.of(u => {
        if (!u.docChanged) return;
        const value = u.state.doc.toString();
        if (value !== props.modelValue) emit('update:modelValue', value);
      }),
    ],
  });
}

onMounted(() => {
  view = new EditorView({ state: createState(props.modelValue), parent: host.value! });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

// External changes (switching versions, "save as new") replace the whole doc.
watch(() => props.modelValue, value => {
  if (!view) return;
  const current = view.state.doc.toString();
  if (value !== current) {
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }
});
</script>

<template>
  <div ref="host" class="prompt-editor" />
</template>

<style scoped>
/* Fills the flex space the parent gives it; min-height:0 lets it shrink so its
   own scroller — not the page — handles overflow. */
.prompt-editor { width: 100%; flex: 1; min-height: 0; }
</style>
