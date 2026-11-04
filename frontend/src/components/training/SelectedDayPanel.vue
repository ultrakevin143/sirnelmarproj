<script setup lang="ts">
import type { PlanDay, PlannedExercise } from '@/types/workout';
import { useTrainingPreferences } from '@/composables/useTrainingPreferences';
const { formatLoad } = useTrainingPreferences();

defineProps<{
  selectedDay: PlanDay;
  plannedSetCount: number;
  planBusy: boolean;
  guideAssetUrl: (slug: string, frame: 1 | 2 | 3) => string;
}>();

const emit = defineEmits<{
  editDay: [];
  addMovement: [];
  moveExercise: [index: number, direction: -1 | 1];
  editPrescription: [item: PlannedExercise];
  removeExercise: [item: PlannedExercise];
}>();
</script>

<template>
  <section
    class="selected-day-panel"
    :class="{ 'rest-panel': selectedDay.isRestDay }"
    aria-live="polite"
  >
    <div class="selected-day-heading">
      <div>
        <p class="eyebrow">
          {{ selectedDay.dayName }} ·
          {{ selectedDay.isRestDay ? 'RECOVERY' : selectedDay.focus }}
        </p>
        <h2>{{ selectedDay.title }}</h2>
        <p class="day-summary">
          {{
            selectedDay.isRestDay
              ? 'A day to recover and let your body adapt.'
              : `${selectedDay.exercises.length} planned movements · ${plannedSetCount} working sets`
          }}
        </p>
      </div>
      <div class="day-actions">
        <q-btn
          flat
          dense
          icon="edit"
          label="Edit Day"
          class="edit-day-btn"
          aria-label="Edit selected day"
          :disable="planBusy"
          @click="emit('editDay')"
        />
        <q-btn
          v-if="!selectedDay.isRestDay"
          unelevated
          no-caps
          color="primary"
          icon="add"
          label="Add movement"
          class="add-movement-btn"
          :disable="planBusy"
          @click="emit('addMovement')"
        />
      </div>
    </div>

    <div v-if="selectedDay.isRestDay" class="rest-message">
      <div class="rest-icon-box">
        <q-icon name="bedtime" size="24px" />
      </div>
      <div>
        <strong>Rest is part of the program.</strong>
        <p>
          Recovery days allow muscle protein synthesis, central nervous system replenishment, and
          joint recovery.
        </p>
      </div>
    </div>

    <div v-else-if="selectedDay.exercises.length" class="planned-list">
      <article v-for="(item, index) in selectedDay.exercises" :key="item.id" class="planned-item">
        <div class="plan-order-controls" :aria-label="`Position ${index + 1}`">
          <q-btn
            flat
            round
            dense
            size="sm"
            icon="keyboard_arrow_up"
            :aria-label="`Move ${item.exerciseName} up`"
            :disable="index === 0 || planBusy"
            @click="emit('moveExercise', index, -1)"
          />
          <q-btn
            flat
            round
            dense
            size="sm"
            icon="keyboard_arrow_down"
            :aria-label="`Move ${item.exerciseName} down`"
            :disable="index === selectedDay.exercises.length - 1 || planBusy"
            @click="emit('moveExercise', index, 1)"
          />
        </div>

        <img
          v-if="item.exerciseSlug"
          :src="guideAssetUrl(item.exerciseSlug, 1)"
          :alt="`${item.exerciseName} movement illustration`"
          class="exercise-thumbnail"
          loading="lazy"
        />
        <div v-else class="custom-movement-mark" aria-hidden="true">
          {{ item.exerciseName.slice(0, 1) }}
        </div>

        <div class="planned-copy">
          <div class="planned-name-line">
            <h3>{{ item.exerciseName }}</h3>
            <span v-if="!item.catalogExerciseId" class="custom-label">CUSTOM</span>
          </div>
          <p>{{ item.targetMuscle }}</p>
        </div>

        <div
          class="prescription"
          :aria-label="`${item.sets} sets, ${item.reps} reps, ${formatLoad(item.weightKg)}`"
        >
          <strong class="tabular-nums">{{ item.sets }} <small>sets</small></strong>
          <span class="cross">×</span>
          <strong class="tabular-nums">{{ item.reps }} <small>reps</small></strong>
          <span class="load-value tabular-nums">{{ formatLoad(item.weightKg) }}</span>
        </div>

        <div class="planned-actions">
          <q-btn
            flat
            round
            dense
            icon="tune"
            aria-label="Edit prescription"
            :disable="planBusy"
            @click="emit('editPrescription', item)"
          />
          <q-btn
            flat
            round
            dense
            icon="delete_outline"
            aria-label="Remove exercise"
            class="text-negative"
            :disable="planBusy"
            @click="emit('removeExercise', item)"
          />
        </div>
      </article>
    </div>

    <div v-else class="empty-day-state">
      <div class="empty-icon-box">
        <q-icon name="fitness_center" size="24px" />
      </div>
      <div class="empty-copy">
        <strong>No movements scheduled for {{ selectedDay.dayName }}.</strong>
        <p>Add movements from the exercise library or choose a training split template.</p>
      </div>
      <q-btn
        outline
        no-caps
        icon="add"
        label="Add movement"
        color="primary"
        class="empty-add-btn"
        :disable="planBusy"
        @click="emit('addMovement')"
      />
    </div>
  </section>
</template>

<style scoped>
.selected-day-panel {
  margin-top: 16px;
  padding: 24px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--card-shadow);
  transition: all 0.2s ease;
}

.selected-day-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.selected-day-heading h2 {
  margin: 0;
  font-family:
    'DM Sans',
    -apple-system,
    sans-serif;
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.day-summary {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.day-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-day-btn {
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
}

.edit-day-btn:hover {
  background: var(--bg-surface-elevated);
  color: var(--text-primary);
}

.add-movement-btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
}

/* Planned Exercise List */
.planned-list {
  display: grid;
  gap: 8px;
}

.planned-item {
  display: grid;
  grid-template-columns: auto auto 1fr auto auto;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: border-color 0.15s ease;
}

.planned-item:hover {
  border-color: var(--border-strong);
}

.plan-order-controls {
  display: flex;
  flex-direction: column;
}

.plan-order-controls .q-btn {
  color: var(--text-muted);
}

.plan-order-controls .q-btn:hover {
  color: var(--text-primary);
}

.exercise-thumbnail {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-sm);
  background: var(--art-stage-bg, #141926);
  border: 1px solid var(--art-stage-border, #283348);
  object-fit: contain;
  padding: 4px;
}

.custom-movement-mark {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--accent-surface);
  color: var(--accent-primary);
  font-size: 20px;
  font-weight: 700;
  border: 1px solid var(--accent-border);
}

.planned-copy {
  min-width: 0;
}

.planned-name-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.planned-copy h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.planned-copy p {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.custom-label {
  padding: 2px 6px;
  background: var(--badge-bg);
  color: var(--badge-text);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  border-radius: var(--radius-sm);
}

.prescription {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.prescription strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.prescription small {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
}

.prescription .cross {
  color: var(--text-muted);
  font-size: 12px;
}

.prescription .load-value {
  min-width: 56px;
  padding: 3px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--accent-primary);
  font-weight: 700;
  font-size: 13px;
  text-align: right;
}

.planned-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.planned-actions .q-btn {
  color: var(--text-secondary);
}

.planned-actions .q-btn:hover {
  color: var(--text-primary);
}

/* Empty & Rest States */
.rest-message,
.empty-day-state {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  background: var(--bg-surface-elevated);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

.rest-icon-box,
.empty-icon-box {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--accent-primary);
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.rest-message strong,
.empty-copy strong {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.rest-message p,
.empty-copy p {
  margin: 3px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.empty-add-btn {
  margin-left: auto;
  font-weight: 600;
}

@media (max-width: 760px) {
  .selected-day-panel {
    padding: 16px;
  }

  .selected-day-heading {
    flex-direction: column;
    align-items: flex-start;
  }

  .planned-item {
    grid-template-columns: auto auto 1fr auto;
    gap: 10px;
    padding: 10px 12px;
  }

  .planned-actions {
    grid-column: 4 / 5;
  }

  .prescription {
    grid-column: 1 / 5;
    justify-content: flex-start;
    padding-top: 6px;
    border-top: 1px solid var(--border-subtle);
  }

  .empty-day-state {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }

  .empty-add-btn {
    margin-left: 0;
    width: 100%;
  }
}
</style>
