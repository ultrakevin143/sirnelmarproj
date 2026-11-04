<script setup lang="ts">
const sessionNotesDraft = defineModel<string>('sessionNotesDraft', { required: true });
const effortDraft = defineModel<number | null>('effortDraft', { required: true });

defineProps<{
  sessionBusy?: boolean;
  notesSavedValue: string;
  effortSavedValue: number | null;
  detailBusy: 'notes' | 'effort' | null;
  effortOptions: Array<{ label: string; value: number }>;
}>();

const emit = defineEmits<{
  saveNotes: [];
  saveEffort: [];
}>();
</script>

<template>
  <div class="session-detail-panel">
    <div class="session-notes-editor">
      <q-input
        v-model="sessionNotesDraft"
        type="textarea"
        outlined
        autogrow
        maxlength="5000"
        label="Session notes"
        aria-label="Active workout notes"
        hint="Record performance, RPE, or setup notes"
      />
      <q-btn
        unelevated
        no-caps
        color="primary"
        label="Save notes"
        class="save-btn"
        aria-label="Save active workout notes"
        :loading="detailBusy === 'notes'"
        :disable="sessionBusy || detailBusy !== null || sessionNotesDraft === notesSavedValue"
        @click="emit('saveNotes')"
      />
    </div>
    <div class="effort-editor">
      <q-select
        v-model="effortDraft"
        :options="effortOptions"
        emit-value
        map-options
        clearable
        outlined
        dense
        label="Perceived Effort (1–10)"
        aria-label="Session perceived effort from 1 to 10"
      />
      <q-btn
        unelevated
        no-caps
        color="primary"
        label="Save effort"
        class="save-btn"
        aria-label="Save session perceived effort"
        :loading="detailBusy === 'effort'"
        :disable="sessionBusy || detailBusy !== null || effortDraft === effortSavedValue"
        @click="emit('saveEffort')"
      />
      <span class="field-hint">1 = very light · 10 = max failure</span>
    </div>
  </div>
</template>

<style scoped>
.session-detail-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(200px, 0.7fr);
  align-items: start;
  gap: 16px;
  padding: 20px 24px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--card-shadow);
}

.session-notes-editor,
.effort-editor {
  display: grid;
  align-content: start;
  gap: 8px;
}

.save-btn {
  justify-self: start;
  padding: 4px 14px;
  font-weight: 600;
  font-size: 13px;
}

.field-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
}

@media (max-width: 700px) {
  .session-detail-panel {
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .save-btn {
    justify-self: stretch;
  }
}
</style>
