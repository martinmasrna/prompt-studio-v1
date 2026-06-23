// Lightweight URL <-> state sync. The app keeps navigation state (selected
// prompt + active module) in memory; this layer mirrors it into the URL hash so
// that every navbar destination has a real, shareable address. That is what lets
// the browser open a tab in a new window/tab (middle-click, Ctrl/Cmd-click) and
// have it reconstruct the correct view on a cold load.
//
// URL format: #/p/<promptId>/<module>   (e.g. #/p/5/results)
//             #/                          when no prompt is selected
import { watch } from 'vue';
import { useAppState } from './app';
import { activeModule, type ModuleTab } from './editor';

const { selectedPromptId } = useAppState();

const MODULES: ModuleTab[] = ['overview', 'ab-tester', 'results', 'issues'];

/** Build the hash URL for a destination. Used for anchor `href`s in the navbar. */
export function hrefFor(module: ModuleTab, promptId: number | null = selectedPromptId.value): string {
  return promptId === null ? '#/' : `#/p/${promptId}/${module}`;
}

function parseHash(): { promptId: number | null; module: ModuleTab } {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) {
    const id = Number(parts[1]);
    const mod = parts[2] as ModuleTab;
    return {
      promptId: Number.isFinite(id) ? id : null,
      module: MODULES.includes(mod) ? mod : 'overview',
    };
  }
  return { promptId: null, module: 'overview' };
}

// Guard against feedback loops: applying the URL mutates state, and the state
// watcher writes the URL — without this flag they would chase each other.
let syncing = false;

// URL -> state (initial load, back/forward, and tabs opened in a fresh window).
function applyHash() {
  const { promptId, module } = parseHash();
  syncing = true;
  if (selectedPromptId.value !== promptId) selectedPromptId.value = promptId;
  if (activeModule.value !== module) activeModule.value = module;
  syncing = false;
}

export function initRouter() {
  applyHash(); // restore state from the URL on first load

  window.addEventListener('hashchange', applyHash);

  // state -> URL. Setting location.hash pushes a history entry, so the browser
  // back button steps through prior views.
  watch([selectedPromptId, activeModule], () => {
    if (syncing) return;
    const target = hrefFor(activeModule.value);
    if (location.hash !== target) location.hash = target;
  });
}
