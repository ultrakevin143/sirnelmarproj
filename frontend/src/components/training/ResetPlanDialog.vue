<script setup lang="ts">
const open = defineModel<boolean>({ required: true });

defineProps<{
  planBusy: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
}>();
</script>

<template>
  <q-dialog v-model="open" persistent>
    <q-card class="editor-dialog reset-plan-dialog">
      <q-card-section>
        <p class="eyebrow">START A NEW PROGRAM</p>
        <h2>Clear planned movements?</h2>
        <p class="detail-copy">
          This clears exercises and targets from all seven days, then sets up your weekly split:
          chest/triceps/shoulders, back/biceps, and legs/core/forearms repeated twice, with Sunday
          for rest. Workout history stays untouched.
        </p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat no-caps label="Keep my plan" v-close-popup :disable="planBusy" />
        <q-btn
          unelevated
          no-caps
          color="negative"
          label="Clear and set up new split"
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
.detail-copy {
  color: #737b6f;
  font-size: 12px;
}
</style>
