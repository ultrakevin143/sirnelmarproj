<script setup lang="ts">
import type { PlanDay } from '@/types/workout';

const open = defineModel<boolean>({ required: true });
const title = defineModel<string>('title', { required: true });
const focus = defineModel<string>('focus', { required: true });
const isRestDay = defineModel<boolean>('isRestDay', { required: true });

defineProps<{
  selectedDay: PlanDay | null;
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
        <p class="eyebrow">EDIT {{ selectedDay?.dayName.toUpperCase() }}</p>
        <h2>Shape the day</h2>
        <q-input v-model="title" label="Day title" maxlength="80" outlined class="q-mt-md" />
        <q-input v-model="focus" label="Training focus" maxlength="120" outlined class="q-mt-sm" />
        <q-toggle
          v-model="isRestDay"
          label="Make this a rest day"
          :disable="Boolean(selectedDay?.exercises.length) && !selectedDay?.isRestDay"
        />
        <p v-if="selectedDay?.exercises.length && !selectedDay.isRestDay" class="field-hint">
          Remove the planned movements before marking this day as rest.
        </p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat no-caps label="Cancel" v-close-popup />
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Save day"
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
.field-hint {
  margin: 0 0 0 38px;
  color: #7c736c;
  font-size: 11px;
}
</style>
