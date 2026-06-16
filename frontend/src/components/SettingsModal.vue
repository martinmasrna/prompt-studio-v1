<script setup lang="ts">
// Settings modal. Lets the user pick which LLM model runs are sent to, without
// touching any config files. Opened from the sidebar's Settings button.
import {
  availableModels, activeModelId, modelsError,
  showSettings, setActiveModel, loadModels,
} from '../store/settings';
</script>

<template>
  <Teleport to="body">
    <div v-if="showSettings" class="overlay" @click.self="showSettings = false">
      <div class="modal">
        <h2 class="modal-title">Settings</h2>

        <div class="settings-block">
          <div class="settings-label-row">
            <span class="settings-label">Model</span>
            <button class="link-btn" title="Reload the model list" @click="loadModels">Refresh</button>
          </div>

          <!-- Error fetching the catalog -->
          <p v-if="modelsError" class="settings-error">{{ modelsError }}</p>

          <!-- No models declared -->
          <p v-else-if="availableModels.length === 0" class="settings-hint">
            No models configured. Add <code>backend/models.json</code> (see
            <code>models.example.json</code>).
          </p>

          <!-- Model picker -->
          <div v-else class="model-list">
            <button
              v-for="m in availableModels"
              :key="m.id"
              class="model-row"
              :class="{ active: m.id === activeModelId }"
              @click="setActiveModel(m.id)"
            >
              <span class="model-check">{{ m.id === activeModelId ? '✓' : '' }}</span>
              <span class="model-text">
                <span class="model-name">{{ m.label }}</span>
                <span class="model-meta">{{ m.uri }}</span>
              </span>
            </button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-primary" @click="showSettings = false">Done</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-block { display: flex; flex-direction: column; gap: 8px; }

.settings-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.settings-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.link-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}
.link-btn:hover { color: var(--text-primary); }

.settings-hint  { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.settings-hint code { font-family: var(--font-mono); font-size: 11px; }
.settings-error { font-size: 12px; color: #c04040; line-height: 1.5; }

.model-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  overflow-y: auto;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  border-radius: 4px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}
.model-row:hover  { background: var(--bg-hover); }
.model-row.active { background: var(--bg-selected); }

.model-check { width: 12px; flex-shrink: 0; color: var(--text-primary); align-self: flex-start; padding-top: 2px; }

.model-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.model-name { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.model-meta {
  font-size: 10.5px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
