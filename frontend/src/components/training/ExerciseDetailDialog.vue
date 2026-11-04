<script setup lang="ts">
import type { CatalogExercise, PlanDay } from '@/types/workout';

const open = defineModel<boolean>({ required: true });
const selectedFrame = defineModel<1 | 2 | 3>('selectedFrame', { required: true });

defineProps<{
  selectedExercise: CatalogExercise | null;
  selectedExerciseImage: string;
  selectedDay: PlanDay | null;
  activeSession: boolean;
}>();

const emit = defineEmits<{
  addToWorkout: [exercise: CatalogExercise];
  addToPlan: [exercise: CatalogExercise];
}>();
</script>

<template>
  <q-dialog v-model="open">
    <q-card v-if="selectedExercise" class="exercise-dialog">
      <q-card-section class="dialog-art">
        <img
          v-if="selectedExerciseImage"
          :src="selectedExerciseImage"
          :alt="`${selectedExercise.name} movement illustration`"
        />
        <span v-else class="detail-copy">Custom movement</span>
        <q-btn
          round
          flat
          icon="close"
          aria-label="Close exercise details"
          class="dialog-close"
          @click="open = false"
        />
        <div class="frame-controls" aria-label="Exercise movement frames">
          <button
            v-for="frame in selectedExercise.frames"
            :key="frame.index"
            :class="{ active: selectedFrame === frame.index }"
            :aria-label="`Show movement frame ${frame.index}`"
            @click="selectedFrame = frame.index as 1 | 2 | 3"
          >
            {{ frame.index }}
          </button>
        </div>
      </q-card-section>
      <q-card-section>
        <p class="eyebrow">
          {{ selectedExercise.primaryMuscle }} · {{ selectedExercise.equipment }}
        </p>
        <h2>{{ selectedExercise.name }}</h2>
        <p class="detail-copy">
          Works
          {{
            selectedExercise.secondaryMuscles.length
              ? selectedExercise.secondaryMuscles.join(', ')
              : selectedExercise.primaryMuscle
          }}.
        </p>
        <p v-if="selectedExercise.cues" class="detail-copy">{{ selectedExercise.cues }}</p>
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Add to workout"
          class="full-width"
          :disable="!activeSession"
          @click="emit('addToWorkout', selectedExercise)"
        />
        <q-btn
          v-if="!selectedDay?.isRestDay"
          flat
          no-caps
          color="primary"
          label="Add to selected plan day"
          class="full-width q-mt-sm"
          @click="emit('addToPlan', selectedExercise)"
        />
        <p v-if="!activeSession" class="dialog-hint">Start a workout to add this movement.</p>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.eyebrow {
  margin: 0 0 8px;
  color: var(--accent-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.exercise-dialog {
  width: min(520px, 92vw);
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--card-shadow);
}

.dialog-art {
  position: relative;
  display: grid;
  min-height: 320px;
  place-items: center;
  background: var(--art-stage-bg, #141926);
  border-bottom: 1px solid var(--border-subtle);
}

.dialog-art > img {
  width: min(100%, 340px);
  height: 290px;
  object-fit: contain;
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.6));
}

.dialog-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: var(--bg-surface-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}

.frame-controls {
  position: absolute;
  bottom: 14px;
  display: flex;
  gap: 8px;
}

.frame-controls button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-strong);
  border-radius: 9999px;
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  transition: all 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

.frame-controls button:hover {
  border-color: var(--accent-primary);
}

.frame-controls button.active {
  border-color: var(--accent-primary);
  background: var(--accent-primary);
  color: var(--accent-contrast);
  box-shadow: 0 2px 10px rgba(163, 230, 53, 0.35);
}

.exercise-dialog h2 {
  margin: 0 0 8px;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 32px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
}

.detail-copy {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 18px;
}

.dialog-hint {
  color: var(--text-muted);
  font-size: 12px;
  margin: 12px 0 0;
  line-height: 1.5;
  text-align: center;
}
</style>
