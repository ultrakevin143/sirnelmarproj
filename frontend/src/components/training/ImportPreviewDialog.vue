<script setup lang="ts">
import type { PlanImportPreview } from '@/types/workout';

const open = defineModel<boolean>({ required: true });

defineProps<{
  importPreview: PlanImportPreview | null;
  planBusy: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
}>();
</script>

<template>
  <q-dialog v-model="open">
    <q-card class="editor-dialog import-preview-dialog">
      <q-card-section>
        <p class="eyebrow">IMPORT PREVIEW</p>
        <h2>{{ importPreview?.plan?.name }}</h2>
        <p>{{ importPreview?.exerciseCount }} planned movements across seven days.</p>
        <q-banner class="import-warning" rounded>{{ importPreview?.warning }}</q-banner>
        <div class="import-day-list">
          <div v-for="day in importPreview?.plan?.days ?? []" :key="day.dayIndex">
            <strong>{{ day.dayName }}</strong
            ><span>{{ day.title }}</span
            ><small>{{ day.isRestDay ? 'Rest day' : `${day.exercises.length} movements` }}</small>
          </div>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat no-caps label="Cancel" v-close-popup />
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Replace my weekly plan"
          :loading="planBusy"
          @click="emit('confirm')"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.eyebrow {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.editor-dialog {
  width: min(540px, 94vw);
  border-radius: 9px;
}
.editor-dialog h2 {
  margin: 0;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 34px;
}
.import-preview-dialog > .q-card__section {
  max-height: 80vh;
  overflow-y: auto;
}
.import-preview-dialog > .q-card__section > p:not(.eyebrow) {
  color: var(--text-secondary);
  font-size: 12px;
}
.import-warning {
  margin: 14px 0;
  background: #f3f1e7;
  color: #645d47;
  font-size: 12px;
}
.import-day-list {
  display: grid;
  gap: 1px;
  background: var(--border-subtle);
}
.import-day-list > div {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr) 100px;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  background: var(--bg-surface-elevated);
  color: var(--text-primary);
  font-size: 11px;
}
.import-day-list > div > span {
  color: var(--text-secondary);
}
.import-day-list small {
  color: var(--text-secondary);
  text-align: right;
}

@media (max-width: 700px) {
  .import-day-list > div {
    grid-template-columns: 74px minmax(0, 1fr);
  }
  .import-day-list small {
    grid-column: 2;
    text-align: left;
  }
}
</style>
