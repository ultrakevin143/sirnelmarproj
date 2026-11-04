<script setup lang="ts">
import type { PlanDay, PlannedExercise } from '@/types/workout';

const open = defineModel<boolean>({ required: true });

defineProps<{
  selectedDay: PlanDay | null;
  pendingPlanRemoval: PlannedExercise | null;
  planBusy: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
}>();
</script>

<template>
  <q-dialog v-model="open">
    <q-card class="editor-dialog">
      <q-card-section>
        <p class="eyebrow">REMOVE FROM {{ selectedDay?.dayName.toUpperCase() }}</p>
        <h2>{{ pendingPlanRemoval?.exerciseName }}</h2>
        <p class="dialog-hint">
          This removes the movement from the plan only. Workout history isn’t affected.
        </p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat no-caps label="Keep movement" v-close-popup />
        <q-btn
          unelevated
          no-caps
          color="negative"
          label="Remove movement"
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
  color: #778071;
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
.dialog-hint {
  margin: 10px 0 0;
  color: #737b6f;
  font-size: 12px;
  line-height: 1.5;
}
</style>
