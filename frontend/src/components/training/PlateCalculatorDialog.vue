<script setup lang="ts">
import { computed, ref } from 'vue';
import { calculatePlates } from '@/utils/plateCalculator';
const model = defineModel<boolean>({ required: true });
const totalKg = ref<number | null>(60);
const result = computed(() => calculatePlates(totalKg.value ?? NaN));
</script>

<template>
  <q-dialog v-model="model">
    <q-card class="plate-calculator">
      <q-card-section class="plate-heading">
        <div>
          <p class="eyebrow">BARBELL TOOL</p>
          <h2>Load the bar.</h2>
        </div>
        <q-btn v-close-popup flat round icon="close" aria-label="Close plate calculator" />
      </q-card-section>
      <q-card-section>
        <q-input
          v-model.number="totalKg"
          type="number"
          outlined
          label="Total load, including bar"
          suffix="kg"
          min="20"
          max="1000"
          step="2.5"
          autofocus
        />
        <p class="plate-note">
          20 kg Olympic bar · matching plates on both sides · collars excluded.
        </p>
        <p v-if="result.error" role="alert">{{ result.error }}</p>
        <section v-else aria-live="polite">
          <h3>On each side</h3>
          <p v-if="!result.plates.length">Empty bar. No plates needed.</p>
          <ol v-else class="plate-list">
            <li v-for="plate in result.plates" :key="plate.weightKg">
              <strong>{{ plate.count }} × {{ plate.weightKg }} kg</strong>
              <span>{{ plate.count === 1 ? 'plate' : 'plates' }} per side</span>
            </li>
          </ol>
          <p class="plate-note">
            Load largest to smallest from the bar outward. Assumes enough pairs of each plate size.
          </p>
        </section>
        <p class="plate-note">Available sizes: 20, 10, 5, 2.5 and 1.25 kg.</p>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.plate-calculator {
  width: 440px;
  max-width: calc(100vw - 32px);
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}
.plate-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 {
  font-family: 'Barlow Condensed', sans-serif;
  margin: 0;
  font-size: 32px;
}
h3 {
  font-size: 17px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 0.12em;
  margin-bottom: 4px;
}
.plate-note {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.plate-list {
  list-style: none;
  padding: 0;
}
.plate-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.plate-list strong {
  font-variant-numeric: tabular-nums;
}
.plate-list span {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
