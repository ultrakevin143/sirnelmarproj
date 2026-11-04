<script setup lang="ts">
import type { PlanDay, PlannedExercise, WeeklyPlan } from '@/types/workout';
import WeekStrip from './WeekStrip.vue';
import SelectedDayPanel from './SelectedDayPanel.vue';

defineProps<{
  plan: WeeklyPlan | null;
  selectedDay: PlanDay | null;
  selectedDayIndex: number;
  planLoading: boolean;
  planBusy: boolean;
  planError: string;
  plannedSetCount: number;
  trainingDayCount: number;
  completedTrainingDays: number;
  weeklySplitSummary: Array<{ label: string; days: string }>;
  dayStatus: (dayIndex: number) => 'Done' | 'Live' | null;
  guideAssetUrl: (slug: string, frame: 1 | 2 | 3) => string;
}>();

const emit = defineEmits<{
  'update:selectedDayIndex': [value: number];
  exportPlan: [];
  importPlan: [];
  openTemplates: [];
  resetPlan: [];
  retryLoad: [];
  editDay: [];
  addMovement: [];
  moveExercise: [index: number, direction: -1 | 1];
  editPrescription: [item: PlannedExercise];
  removeExercise: [item: PlannedExercise];
}>();
</script>

<template>
  <section class="weekly-plan" aria-labelledby="weekly-plan-heading">
    <header class="plan-heading">
      <div class="heading-text">
        <p class="eyebrow">YOUR TRAINING WEEK</p>
        <h2 id="weekly-plan-heading" class="plan-title">Weekly Program & Schedule</h2>
        <p class="heading-copy">Configure each day’s focus, movements, and target working sets.</p>
      </div>
      <div class="plan-file-actions">
        <q-btn
          flat
          dense
          no-caps
          icon="bookmarks"
          label="Templates"
          class="action-btn"
          :disable="!plan || planBusy"
          @click="emit('openTemplates')"
        />
        <q-btn
          flat
          dense
          no-caps
          icon="file_download"
          label="Export"
          class="action-btn"
          :disable="!plan || planBusy"
          @click="emit('exportPlan')"
        />
        <q-btn
          flat
          dense
          no-caps
          icon="file_upload"
          label="Import"
          class="action-btn"
          :disable="planBusy"
          @click="emit('importPlan')"
        />
        <q-btn
          flat
          dense
          no-caps
          icon="restart_alt"
          label="Reset"
          class="action-btn action-btn-danger"
          :disable="!plan || planBusy"
          @click="emit('resetPlan')"
        />
        <slot name="import-input" />
      </div>
    </header>

    <div v-if="planLoading" class="week-loading" aria-label="Loading weekly plan">
      <q-skeleton v-for="index in 7" :key="index" height="76px" class="skeleton-day" />
    </div>
    <q-banner v-else-if="planError" class="plan-error" rounded role="alert">
      <template #avatar><q-icon name="cloud_off" /></template>
      <strong>Weekly plan unavailable</strong>
      <span>{{ planError }}</span>
      <template #action>
        <q-btn flat no-caps label="Retry" :loading="planLoading" @click="emit('retryLoad')" />
      </template>
    </q-banner>

    <template v-else-if="plan && selectedDay">
      <div class="week-progress" aria-live="polite">
        <div class="split-summary-tags">
          <span v-for="(group, index) in weeklySplitSummary" :key="group.label" class="split-tag">
            <span v-if="index" class="split-separator">·</span>
            {{ group.days }} {{ group.label }}
          </span>
        </div>
        <span class="days-done-badge">
          {{ completedTrainingDays }} of {{ trainingDayCount }} days complete
        </span>
      </div>
      <WeekStrip
        :days="plan.days"
        :selected-day-index="selectedDayIndex"
        :day-status="dayStatus"
        @update:selected-day-index="emit('update:selectedDayIndex', $event)"
      />
      <SelectedDayPanel
        :selected-day="selectedDay"
        :planned-set-count="plannedSetCount"
        :plan-busy="planBusy"
        :guide-asset-url="guideAssetUrl"
        @edit-day="emit('editDay')"
        @add-movement="emit('addMovement')"
        @move-exercise="(index, direction) => emit('moveExercise', index, direction)"
        @edit-prescription="emit('editPrescription', $event)"
        @remove-exercise="emit('removeExercise', $event)"
      />
    </template>
  </section>
</template>

<style scoped>
.weekly-plan {
  margin: 16px 0 32px;
}

.plan-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.heading-text {
  min-width: 260px;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.plan-title {
  margin: 0;
  font-family:
    'DM Sans',
    -apple-system,
    sans-serif;
  font-size: clamp(24px, 3.5vw, 32px);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.heading-copy {
  max-width: 520px;
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.plan-file-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.action-btn {
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-surface);
}

.action-btn:hover {
  background: var(--bg-surface-elevated);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.action-btn-danger:hover {
  color: var(--danger-primary);
}

.week-loading {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  margin-top: 20px;
}

.skeleton-day {
  border-radius: var(--radius-md);
}

.week-progress {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding: 8px 12px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
}

.split-summary-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.split-tag {
  font-weight: 600;
  color: var(--text-primary);
}

.split-separator {
  color: var(--text-muted);
  margin: 0 4px;
}

.days-done-badge {
  color: var(--accent-primary);
  font-weight: 700;
  font-size: 11px;
}

.plan-error {
  margin-top: 20px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-primary);
}

@media (max-width: 650px) {
  .plan-heading {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .plan-file-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .week-progress {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
}
</style>
