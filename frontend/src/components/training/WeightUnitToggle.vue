<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { useAuth } from '@/composables/useAuth';
import {
  setTrainingPreferences,
  useTrainingPreferences,
  type TrainingPreferences,
} from '@/composables/useTrainingPreferences';

const { currentUser } = useAuth();
const { massUnit } = useTrainingPreferences();
const busy = ref(false);
const error = ref('');

async function chooseUnit(unit: 'kg' | 'lb') {
  if (busy.value || unit === massUnit.value || !currentUser.value) return;
  const accountId = currentUser.value.id;
  busy.value = true;
  error.value = '';
  try {
    // Read the latest preferences so this shortcut preserves the rest of the account setup.
    const latest = await axios.get<{ settings: TrainingPreferences }>('/api/v1/training/settings');
    if (currentUser.value?.id !== accountId) return;
    const response = await axios.put<{ settings: TrainingPreferences }>(
      '/api/v1/training/settings',
      { ...latest.data.settings, massUnit: unit },
    );
    if (currentUser.value?.id !== accountId) return;
    setTrainingPreferences(response.data.settings);
    currentUser.value.settings = response.data.settings;
  } catch {
    error.value = 'Could not save your weight unit. Check your connection and try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="weight-unit-control" :aria-busy="busy">
    <div class="weight-unit-options" role="group" aria-label="Weight unit">
      <span>Weight unit</span>
      <button
        v-for="unit in ['kg', 'lb'] as const"
        :key="unit"
        type="button"
        :aria-pressed="massUnit === unit"
        :aria-label="unit === 'kg' ? 'Use kilograms' : 'Use pounds'"
        :disabled="busy"
        @click="chooseUnit(unit)"
      >
        {{ unit.toUpperCase() }}
      </button>
      <span v-if="busy" role="status">Saving…</span>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.weight-unit-control {
  max-width: 100%;
}
.weight-unit-options {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.weight-unit-options span {
  color: var(--text-secondary);
  font-size: 14px;
}
.weight-unit-options button {
  min-width: 52px;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.weight-unit-options button[aria-pressed='true'] {
  color: var(--text-on-accent, #0b0e14);
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}
.weight-unit-options button:disabled {
  opacity: 0.65;
  cursor: wait;
}
.weight-unit-options button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 3px;
}
p {
  max-width: 45ch;
  margin: 8px 0 0;
  color: var(--danger-primary);
  font-size: 14px;
}
</style>
