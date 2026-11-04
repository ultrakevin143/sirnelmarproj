<script setup lang="ts">
import type { PlannedExercise } from '@/types/workout';
import { useTrainingPreferences } from '@/composables/useTrainingPreferences';
const { massUnit, toDisplay, fromDisplay } = useTrainingPreferences();

const open = defineModel<boolean>({ required: true });
const sets = defineModel<number>('sets', { required: true });
const reps = defineModel<number>('reps', { required: true });
const weightKg = defineModel<number>('weightKg', { required: true });

defineProps<{
  editingPlanExercise: PlannedExercise | null;
  planBusy: boolean;
}>();

const emit = defineEmits<{
  save: [];
}>();
</script>

<template>
  <q-dialog v-model="open">
    <q-card class="editor-dialog">
      <q-card-section>
        <p class="eyebrow">PLANNED MOVEMENT</p>
        <h2>{{ editingPlanExercise?.exerciseName }}</h2>
        <div class="prescription-fields">
          <q-input v-model.number="sets" label="Sets" type="number" min="1" max="20" outlined />
          <q-input v-model.number="reps" label="Reps" type="number" min="1" max="1000" outlined />
          <q-input
            :model-value="toDisplay(weightKg)"
            @update:model-value="weightKg = fromDisplay($event) ?? 0"
            :label="`Suggested load (${massUnit})`"
            type="number"
            min="0"
            :max="massUnit === 'lb' ? 2204.62 : 1000"
            step="any"
            outlined
          />
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat no-caps label="Cancel" v-close-popup />
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Save targets"
          :loading="planBusy"
          @click="emit('save')"
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
.prescription-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

@media (max-width: 700px) {
  .prescription-fields {
    grid-template-columns: 1fr;
  }
}
</style>
