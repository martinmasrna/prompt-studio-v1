import { computed, ref, type ComputedRef, type Ref } from 'vue';

// A prompt-scoped collection of named items where one is "selected" and edited
// live, with unsaved-change tracking. Configs (sampling params) and test cases
// (scenario variables) are both this shape; the two things that differ — what
// the live editable payload is, and how to read/write it — are passed in as
// `capture` and `apply`.

interface CollectionResource<TItem, TInput> {
  list: (promptId: number) => Promise<TItem[]>;
  create: (promptId: number, input: TInput) => Promise<TItem>;
  update: (id: number, input: Partial<TInput>) => Promise<TItem>;
  delete: (id: number) => Promise<unknown>;
}

interface CollectionOptions<TItem, TInput> {
  resource: CollectionResource<TItem, TInput>;
  noun: string;        // singular, for messages — "config" / "test"
  pluralLabel: string; // for the load error — "configs" / "saved tests"
  // Build the create/update payload from the live editable state plus a name.
  // `base` is the item the values belong to (for carried-through fields like a
  // description), or null for a brand-new item.
  capture: (name: string, base: TItem | null) => TInput;
  // Push an item's editable values into the live state, or reset to defaults
  // when given null.
  apply: (item: TItem | null) => void;
}

export interface CollectionStore<TItem> {
  items: Ref<TItem[]>;
  selectedId: Ref<number | null>;
  selected: ComputedRef<TItem | null>;
  isDirty: ComputedRef<boolean>;
  loading: Ref<boolean>;
  saving: Ref<boolean>;
  error: Ref<string | null>;
  load: (promptId: number | null) => Promise<void>;
  select: (id: number | null) => boolean;
  applyById: (id: number | null) => void;
  saveNew: (name: string) => Promise<void>;
  saveSelected: () => Promise<void>;
  rename: (id: number, name: string) => Promise<void>;
  renameSelected: (name: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  removeSelected: () => Promise<void>;
}

export function createCollectionStore<TItem extends { id: number; name: string }, TInput extends { name: string }>(
  opts: CollectionOptions<TItem, TInput>,
): CollectionStore<TItem> {
  const { resource, noun, pluralLabel, capture, apply } = opts;

  const items = ref([]) as Ref<TItem[]>;
  const selectedId = ref<number | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  let activePromptId: number | null = null;
  let savedSnapshot = '';
  let loadGeneration = 0;

  const selected = computed(() => items.value.find(item => item.id === selectedId.value) ?? null);

  const snapshotFor = (item: TItem | null) => JSON.stringify(capture(item?.name ?? '', item));

  const isDirty = computed(() => selectedId.value !== null && snapshotFor(selected.value) !== savedSnapshot);

  function applyItem(item: TItem): void {
    selectedId.value = item.id;
    apply(item);
    savedSnapshot = snapshotFor(item);
  }

  function reset(): void {
    selectedId.value = null;
    apply(null);
    savedSnapshot = snapshotFor(null);
  }

  // Keep the saved snapshot in step with a rename so renaming alone doesn't read
  // as an unsaved edit.
  function renameSavedSnapshot(name: string): void {
    try {
      savedSnapshot = JSON.stringify({ ...JSON.parse(savedSnapshot), name });
    } catch {
      savedSnapshot = snapshotFor(selected.value);
    }
  }

  const byName = (a: TItem, b: TItem) => a.name.localeCompare(b.name);

  async function load(promptId: number | null): Promise<void> {
    // Each load gets a generation tag; a slow response for a prompt we've since
    // navigated away from is discarded rather than clobbering the current one.
    const generation = ++loadGeneration;
    activePromptId = promptId;
    items.value = [];
    reset();
    error.value = null;
    if (promptId === null) return;

    loading.value = true;
    try {
      const loaded = await resource.list(promptId);
      if (generation === loadGeneration && activePromptId === promptId) items.value = loaded;
    } catch (cause) {
      if (generation === loadGeneration) {
        error.value = cause instanceof Error ? cause.message : `Could not load ${pluralLabel}`;
      }
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  }

  function select(id: number | null): boolean {
    if (isDirty.value && !confirm(`Discard unsaved changes to the selected ${noun}?`)) return false;
    if (id === null) {
      reset();
      return true;
    }
    const item = items.value.find(candidate => candidate.id === id);
    if (!item) return false;
    applyItem(item);
    return true;
  }

  // Select by id without the unsaved-changes guard — used when a prompt version's
  // default drives the initial selection.
  function applyById(id: number | null): void {
    const item = id === null ? undefined : items.value.find(candidate => candidate.id === id);
    if (item) applyItem(item);
    else reset();
  }

  async function saveNew(name: string): Promise<void> {
    if (activePromptId === null || !name.trim()) return;
    saving.value = true;
    error.value = null;
    try {
      const created = await resource.create(activePromptId, capture(name.trim(), null));
      items.value = [...items.value, created].sort(byName);
      applyItem(created);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : `Could not save ${noun}`;
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function saveSelected(): Promise<void> {
    const current = selected.value;
    if (!current) return;
    saving.value = true;
    error.value = null;
    try {
      const updated = await resource.update(current.id, capture(current.name, current));
      const index = items.value.findIndex(item => item.id === updated.id);
      if (index >= 0) items.value[index] = updated;
      applyItem(updated);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : `Could not update ${noun}`;
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function rename(id: number, name: string): Promise<void> {
    const current = items.value.find(item => item.id === id);
    const trimmed = name.trim();
    if (!current || !trimmed || trimmed === current.name) return;
    saving.value = true;
    error.value = null;
    try {
      // A name-only patch is a valid Partial<TInput> (TInput includes `name`),
      // but TS won't infer that against the generic mapped type — assert it.
      const updated = await resource.update(current.id, { name: trimmed } as Partial<TInput>);
      items.value = items.value.map(item => (item.id === updated.id ? updated : item)).sort(byName);
      if (selectedId.value === updated.id) renameSavedSnapshot(updated.name);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : `Could not rename ${noun}`;
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function renameSelected(name: string): Promise<void> {
    const current = selected.value;
    if (current) await rename(current.id, name);
  }

  async function remove(id: number): Promise<void> {
    await resource.delete(id);
    items.value = items.value.filter(item => item.id !== id);
    if (selectedId.value === id) reset();
  }

  async function removeSelected(): Promise<void> {
    const current = selected.value;
    if (current) await remove(current.id);
  }

  return {
    items, selectedId, selected, isDirty, loading, saving, error,
    load, select, applyById, saveNew, saveSelected, rename, renameSelected, remove, removeSelected,
  };
}
