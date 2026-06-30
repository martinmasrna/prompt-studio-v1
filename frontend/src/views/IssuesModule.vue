<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { api, type Issue } from '../api';
import { activeIssueEvaluationId, activePromptData, versions as promptVersions } from '../store/editor';
import ResultCard from '../components/ResultCard.vue';
import BaseModal from '../components/BaseModal.vue';
import KebabMenu from '../components/KebabMenu.vue';

const issues = ref<Issue[]>([]);
const filter = ref<'open' | 'diagnosed' | 'closed'>('open');
const loading = ref(false);
const error = ref<string | null>(null);
const editingId = ref<number | null>(null);
const editTitle = ref('');
const editNote = ref('');
const showDoctor = ref(false);
const doctorLoading = ref(false);
const doctorPrompt = ref('');
const doctorError = ref<string | null>(null);
const doctorCopied = ref(false);
const showResolution = ref(false);
const resolutionIssue = ref<Issue | null>(null);
const resolutionTargetStatus = ref<'diagnosed' | 'closed'>('diagnosed');
const resolutionNote = ref('');
const resolvedVersionId = ref('');
const resolutionError = ref<string | null>(null);
const savingResolution = ref(false);
let copiedResetTimer: ReturnType<typeof setTimeout> | null = null;

const visibleIssues = computed(() => issues.value.filter(issue => issue.status === filter.value));
const statusCount = (status: Issue['status']) => issues.value.filter(issue => issue.status === status).length;

function replaceIssue(updated: Issue) {
  const index = issues.value.findIndex(item => item.evaluation_id === updated.evaluation_id);
  if (index >= 0) issues.value[index] = updated;
}

function removeLocalIssue(issue: Issue) {
  issues.value = issues.value.filter(item => item.evaluation_id !== issue.evaluation_id);
}

async function load() {
  const promptId = activePromptData.value?.id;
  if (!promptId) return;
  loading.value = true;
  error.value = null;
  try { issues.value = await api.issues.list(promptId); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not load issues'; }
  finally { loading.value = false; }
}

async function toggle(issue: Issue) {
  if (issue.status !== 'closed') {
    resolutionIssue.value = issue;
    resolutionTargetStatus.value = issue.status === 'open' ? 'diagnosed' : 'closed';
    resolutionNote.value = issue.resolution_note ?? '';
    resolvedVersionId.value = issue.resolved_version_id?.toString() ?? '';
    resolutionError.value = null;
    showResolution.value = true;
    return;
  }
  try {
    const updated = await api.issues.update(issue.evaluation_id, { status: 'diagnosed' });
    replaceIssue(updated);
  } catch (cause) { alert(cause instanceof Error ? cause.message : 'Could not update issue'); }
}

async function saveResolution() {
  if (!resolutionIssue.value || savingResolution.value) return;
  savingResolution.value = true;
  resolutionError.value = null;
  try {
    const updated = await api.issues.update(resolutionIssue.value.evaluation_id, {
      status: resolutionTargetStatus.value,
      resolution_note: resolutionNote.value.trim() || null,
      resolved_version_id: resolvedVersionId.value ? Number(resolvedVersionId.value) : null,
    });
    replaceIssue(updated);
    showResolution.value = false;
    resolutionIssue.value = null;
  } catch (cause) {
    resolutionError.value = cause instanceof Error ? cause.message : 'Could not update issue diagnosis';
  } finally {
    savingResolution.value = false;
  }
}

function beginEdit(issue: Issue) {
  editingId.value = issue.evaluation_id;
  editTitle.value = issue.title;
  editNote.value = issue.note ?? '';
}

async function saveEdit(issue: Issue) {
  if (!editTitle.value.trim()) return;
  try {
    const updated = await api.issues.update(issue.evaluation_id, {
      title: editTitle.value.trim(), note: editNote.value.trim() || null,
    });
    replaceIssue(updated);
    editingId.value = null;
  } catch (cause) { alert(cause instanceof Error ? cause.message : 'Could not update issue'); }
}

async function remove(issue: Issue) {
  try {
    if (confirm('Remove the issue flag and keep this saved result?')) {
      await api.issues.delete(issue.evaluation_id);
      removeLocalIssue(issue);
      return;
    }

    if (issue.evaluation.batch_id !== null) {
      if (!confirm('Delete the containing comparison and both saved results?')) return;
      await api.records.deleteComparison(issue.evaluation.batch_id);
      issues.value = issues.value.filter(item => item.evaluation.batch_id !== issue.evaluation.batch_id);
      return;
    }

    if (!confirm('Delete this saved result and its issue metadata?')) return;
    await api.records.deleteEvaluation(issue.evaluation_id);
    removeLocalIssue(issue);
  } catch (cause) { alert(cause instanceof Error ? cause.message : 'Could not delete issue'); }
}

async function openPromptDoctor(issue: Issue) {
  showDoctor.value = true;
  doctorLoading.value = true;
  doctorPrompt.value = '';
  doctorError.value = null;
  doctorCopied.value = false;
  try {
    const result = await api.issues.promptDoctor(issue.evaluation_id);
    doctorPrompt.value = result.prompt;
  } catch (cause) {
    doctorError.value = cause instanceof Error ? cause.message : 'Could not prepare Prompt Doctor';
  } finally {
    doctorLoading.value = false;
  }
}

function closePromptDoctor() {
  showDoctor.value = false;
  if (copiedResetTimer) clearTimeout(copiedResetTimer);
  copiedResetTimer = null;
}

async function copyPromptDoctor() {
  if (!doctorPrompt.value) return;
  doctorError.value = null;
  try {
    await navigator.clipboard.writeText(doctorPrompt.value);
    doctorCopied.value = true;
    if (copiedResetTimer) clearTimeout(copiedResetTimer);
    copiedResetTimer = setTimeout(() => { doctorCopied.value = false; }, 1800);
  } catch (cause) {
    doctorError.value = cause instanceof Error ? cause.message : 'Could not copy prompt to clipboard';
  }
}

watch(() => activePromptData.value?.id, load, { immediate: true });
watch([issues, activeIssueEvaluationId], async () => {
  if (activeIssueEvaluationId.value === null) return;
  const issue = issues.value.find(item => item.evaluation_id === activeIssueEvaluationId.value);
  if (!issue) return;
  filter.value = issue.status;
  await nextTick();
  document.getElementById(`issue-${issue.evaluation_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, { immediate: true });
</script>

<template>
  <div class="issues-view">
    <header>
      <div><h1>Issues</h1><p>Flagged results, diagnosis notes, and resolution tracking.</p></div>
    </header>
    <div class="filters">
      <button :class="{ active: filter === 'open' }" @click="filter = 'open'">Open ({{ statusCount('open') }})</button>
      <button :class="{ active: filter === 'diagnosed' }" @click="filter = 'diagnosed'">Diagnosed ({{ statusCount('diagnosed') }})</button>
      <button :class="{ active: filter === 'closed' }" @click="filter = 'closed'">Closed ({{ statusCount('closed') }})</button>
    </div>

    <p v-if="loading" class="empty">Loading...</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="!visibleIssues.length" class="empty">No {{ filter }} issues.</p>

    <div class="issue-list">
      <ResultCard
        v-for="issue in visibleIssues"
        :id="`issue-${issue.evaluation_id}`"
        :key="issue.evaluation_id"
        :evaluation="issue.evaluation"
        :title="issue.title"
        :date-at="issue.created_at"
      >
        <template #badge>
          <span class="status" :class="issue.status">{{ issue.status }}</span>
        </template>

        <template #actions>
          <div class="issue-actions">
            <button
              v-if="issue.status === 'open'"
              class="btn doctor"
              title="Prepare a diagnostic prompt"
              @click.stop="openPromptDoctor(issue)"
            >
              <svg class="doctor-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" />
                <path d="M6 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
              </svg>
              <span>Prompt Doctor</span>
            </button>
            <KebabMenu label="Issue actions">
              <button role="menuitem" @click="beginEdit(issue)">Edit issue</button>
              <button role="menuitem" @click="toggle(issue)">
                {{ issue.status === 'open' ? 'Mark diagnosed' : issue.status === 'diagnosed' ? 'Close' : 'Reopen' }}
              </button>
              <button role="menuitem" class="danger" @click="remove(issue)">Delete</button>
            </KebabMenu>
          </div>
        </template>

        <template #note>
          <div v-if="editingId === issue.evaluation_id" class="issue-edit">
            <input v-model="editTitle" class="title-input" />
            <textarea v-model="editNote" rows="4" placeholder="Issue note" />
            <div class="actions">
              <button class="btn" @click.stop="editingId = null">Cancel</button>
              <button class="btn primary" @click.stop="saveEdit(issue)">Save</button>
            </div>
          </div>
          <p v-else-if="issue.note" class="note" @click.stop="beginEdit(issue)">{{ issue.note }}</p>
        </template>

        <template #after-evidence>
          <section v-if="issue.status !== 'open' && (issue.resolution_note || issue.resolved_version)" class="resolution">
            <strong>{{ issue.status === 'diagnosed' ? 'Diagnosis' : 'Resolution' }}</strong>
            <p v-if="issue.resolution_note">{{ issue.resolution_note }}</p>
            <span v-if="issue.resolved_version">
              {{ issue.status === 'diagnosed' ? 'Planned version' : 'Resolved in version' }}: {{ issue.resolved_version.name }}
            </span>
          </section>
        </template>
      </ResultCard>
    </div>

    <BaseModal v-if="showResolution" width="640px" @close="showResolution = false">
      <div class="resolution-modal" role="dialog" aria-modal="true" aria-labelledby="resolution-title">
        <h2 id="resolution-title">{{ resolutionTargetStatus === 'diagnosed' ? 'Mark issue as diagnosed' : 'Close issue' }}</h2>
        <p class="modal-sub">
          {{ resolutionTargetStatus === 'diagnosed'
            ? 'Capture the diagnosis and optionally link the version planned to implement the fix.'
            : 'Review the diagnosis, record the verified outcome, and link the version that resolved it.' }}
        </p>
        <label>
          <span>Diagnosis and resolution notes</span>
          <textarea
            v-model="resolutionNote"
            autofocus
            rows="12"
            placeholder="Paste the Prompt Doctor diagnosis, recommended changes, and verification notes."
          />
        </label>
        <label>
          <span>Resolved in version</span>
          <select v-model="resolvedVersionId">
            <option value="">No linked version</option>
            <option v-for="version in promptVersions" :key="version.id" :value="String(version.id)">
              {{ version.name }}{{ version.is_current ? ' ★' : '' }}
            </option>
          </select>
        </label>
        <p v-if="resolutionError" class="error">{{ resolutionError }}</p>
        <div class="actions">
          <button class="btn" :disabled="savingResolution" @click="showResolution = false">Cancel</button>
          <button class="btn primary" :disabled="savingResolution" @click="saveResolution">
            {{ savingResolution
              ? 'Saving...'
              : resolutionTargetStatus === 'diagnosed' ? 'Mark diagnosed' : 'Close issue' }}
          </button>
        </div>
      </div>
    </BaseModal>

    <BaseModal v-if="showDoctor" width="820px" @close="closePromptDoctor">
      <div class="doctor-modal" role="dialog" aria-modal="true" aria-labelledby="doctor-title">
        <div class="doctor-header">
          <div>
            <h2 id="doctor-title">Prompt Doctor</h2>
            <p>Copy this prompt into a cloud model to begin the diagnostic interview.</p>
          </div>
          <button class="modal-close" aria-label="Close Prompt Doctor" @click="closePromptDoctor">&times;</button>
        </div>
        <p v-if="doctorLoading" class="empty">Preparing diagnostic prompt...</p>
        <p v-if="doctorError" class="error">{{ doctorError }}</p>
        <textarea
          v-if="doctorPrompt"
          class="doctor-prompt"
          :value="doctorPrompt"
          readonly
          rows="24"
          aria-label="Generated Prompt Doctor prompt"
        />
        <div class="actions">
          <button class="btn primary" :disabled="doctorLoading || !doctorPrompt" @click="copyPromptDoctor">
            {{ doctorCopied ? 'Copied' : 'Copy prompt' }}
          </button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped>
.issues-view { flex: 1; overflow-y: auto; padding: 28px clamp(20px, 3vw, 38px) 60px; background: var(--canvas); }
header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
header p { margin-top: 5px; color: var(--text-muted); font-size: 13px; }
.filters { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
.filters button { padding: 7px 12px; border: none; border-bottom: 2px solid transparent; background: none; color: var(--text-muted); cursor: pointer; font: inherit; font-size: 12px; }
.filters button:hover { color: var(--text-secondary); }
.filters button.active { border-bottom-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
.issue-list { display: flex; flex-direction: column; gap: 14px; }
.issue-actions { display: flex; align-items: center; gap: 7px; flex: none; }
.status { padding: 2px 7px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
.status.open { background: var(--warning-soft); color: var(--warning-ink); }
.status.diagnosed { background: var(--ai-soft); color: var(--ai-ink); }
.status.closed { background: var(--bg-selected); color: var(--text-muted); }
.note { margin: 0 0 16px; padding: 7px 11px; border-left: 3px solid var(--accent); border-radius: 0 var(--r-ctl) var(--r-ctl) 0; background: var(--bg-sunken); color: var(--text-secondary); font-size: 12px; line-height: 1.45; cursor: pointer; white-space: pre-wrap; }
.note:hover { color: var(--text-primary); }
.issue-edit { margin: 0 0 16px; }
.resolution { margin-top: 14px; padding: 11px 12px; border-left: 3px solid var(--success); border-radius: 0 var(--r-ctl) var(--r-ctl) 0; background: var(--bg-sunken); color: var(--text-secondary); font-size: 12px; }
.resolution strong { display: block; margin-bottom: 5px; color: var(--text-primary); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.resolution p { white-space: pre-wrap; line-height: 1.5; }
.resolution span { display: block; margin-top: 7px; color: var(--success-ink); }
.actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 13px; }
.btn { padding: 6px 11px; border: 1px solid var(--border); border-radius: var(--r-ctl); background: var(--card); color: var(--text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.btn:hover { color: var(--text-primary); border-color: var(--border-strong, #aaa); }
.btn.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
/* Prompt Doctor is the AI affordance — the one action that carries the AI hue. */
.btn.doctor { display: inline-flex; align-items: center; gap: 5px; border-color: transparent; background: var(--ai-soft); color: var(--ai-ink); }
.btn.doctor:hover:not(:disabled) { background: color-mix(in srgb, var(--ai) 22%, #fff); }
.doctor-icon { width: 13px; height: 13px; flex: none; }
.btn.danger { color: var(--danger-ink); }
.btn.danger:hover { color: var(--danger-ink); border-color: var(--danger); }
.btn:disabled { opacity: .5; cursor: default; }
input, textarea { width: 100%; padding: 9px 10px; border: 1px solid transparent; border-radius: var(--r-ctl); background: var(--bg-sunken); color: var(--text-primary); font: inherit; }
input:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.title-input { margin-bottom: 9px; font-weight: 600; }
.empty { color: var(--text-faint); font-size: 13px; }
.error { color: var(--danger-ink); }
.modal-sub { color: var(--text-muted); font-size: 12px; line-height: 1.45; }
.resolution-modal, .doctor-modal { display: flex; flex-direction: column; gap: 13px; }
.resolution-modal h2, .doctor-header h2 { font-size: 16px; }
.resolution-modal label { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.resolution-modal textarea, .resolution-modal select { width: 100%; padding: 9px 10px; border: 1px solid transparent; border-radius: var(--r-ctl); background: var(--bg-sunken); color: var(--text-primary); font: inherit; font-size: 13px; text-transform: none; letter-spacing: 0; }
.resolution-modal textarea:focus, .resolution-modal select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.resolution-modal textarea { min-height: 180px; resize: vertical; }
.doctor-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
.doctor-header p { margin-top: 5px; color: var(--text-muted); font-size: 12px; }
.modal-close { flex: none; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: var(--r-ctl); background: var(--card); color: var(--text-muted); font-size: 20px; line-height: 20px; cursor: pointer; }
.modal-close:hover { color: var(--text-primary); border-color: var(--border-strong, #aaa); }
.doctor-prompt { min-height: 360px; max-height: 62vh; resize: vertical; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
</style>
