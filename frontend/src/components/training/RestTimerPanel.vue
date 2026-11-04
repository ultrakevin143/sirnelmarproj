<script setup lang="ts">
import type { RestTimerState } from '@/composables/useRestTimer';

const restDurationSeconds = defineModel<number>('restDurationSeconds', { required: true });

defineProps<{
  restTimerState: RestTimerState;
  restTimerLabel: string;
  soundEnabled: boolean;
  soundMessage: string;
}>();

const emit = defineEmits<{
  start: [];
  pause: [];
  resume: [];
  reset: [];
  toggleSound: [];
  testChime: [];
}>();
</script>

<template>
  <div
    class="rest-timer-panel"
    :class="{
      'timer-running': restTimerState === 'running',
      'timer-complete': restTimerState === 'complete',
    }"
  >
    <div class="timer-readout">
      <div class="timer-badge">
        <span v-if="restTimerState === 'running'" class="pulse-dot" />
        <span class="session-label">REST TIMER</span>
      </div>
      <output
        role="timer"
        class="timer-clock tabular-nums"
        :aria-label="`Rest timer ${restTimerLabel}`"
        >{{ restTimerLabel }}</output
      >
      <span
        v-if="restTimerState === 'complete'"
        class="timer-status text-positive"
        role="status"
        aria-live="polite"
      >
        Rest complete · ready for next set
      </span>
      <span v-else-if="restTimerState === 'running'" class="timer-status" aria-live="off">
        Resting between sets...
      </span>
      <span v-else-if="restTimerState === 'paused'" class="timer-status">Paused</span>
      <span v-else class="timer-status text-muted"> Auto-starts after a set </span>
    </div>
    <div class="timer-controls">
      <div class="timer-buttons">
        <q-btn
          v-if="restTimerState === 'idle' || restTimerState === 'complete'"
          unelevated
          no-caps
          color="primary"
          icon="play_arrow"
          label="Start"
          class="timer-action-btn"
          aria-label="Start rest timer"
          @click="emit('start')"
        />
        <q-btn
          v-else-if="restTimerState === 'running'"
          unelevated
          no-caps
          icon="pause"
          label="Pause"
          class="timer-action-btn pause-btn"
          aria-label="Pause rest timer"
          @click="emit('pause')"
        />
        <q-btn
          v-else
          unelevated
          no-caps
          color="primary"
          icon="play_arrow"
          label="Resume"
          class="timer-action-btn"
          aria-label="Resume rest timer"
          @click="emit('resume')"
        />
        <q-btn
          flat
          dense
          no-caps
          icon="replay"
          class="timer-reset-btn"
          aria-label="Reset rest timer"
          :disable="restTimerState === 'idle'"
          @click="emit('reset')"
        />
      </div>
    </div>
    <details class="timer-settings">
      <summary>Timer settings</summary>
      <q-input
        v-model.number="restDurationSeconds"
        type="number"
        min="5"
        max="3600"
        step="5"
        outlined
        dense
        suffix="sec"
        label="Rest length"
        aria-label="Rest timer duration in seconds"
        :disable="restTimerState === 'running'"
      />
      <div class="timer-sound-controls">
        <q-btn
          flat
          dense
          no-caps
          :icon="soundEnabled ? 'volume_up' : 'volume_off'"
          :label="soundEnabled ? 'Sound on' : 'Sound off'"
          :aria-pressed="soundEnabled"
          aria-label="Toggle rest timer sound"
          @click="emit('toggleSound')"
        />
        <q-btn flat dense no-caps label="Test chime" @click="emit('testChime')" />
        <p role="status">{{ soundMessage }}</p>
      </div>
    </details>
  </div>
</template>

<style scoped>
.rest-timer-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
}
.timer-running {
  border-color: var(--accent-border);
}
.timer-complete {
  background: var(--accent-surface);
  border-color: var(--accent-border);
}
.timer-readout {
  display: grid;
  gap: 6px;
}
.timer-badge {
  display: flex;
  gap: 6px;
  align-items: center;
}
.session-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.timer-clock {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.timer-status {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
  grid-column: 1 / -1;
}
.timer-buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.timer-action-btn,
.timer-reset-btn {
  min-height: 44px;
  padding: 0 8px;
  font-size: 12px;
}
.timer-action-btn:not(.bg-primary),
.timer-reset-btn {
  color: var(--text-primary);
  background: var(--bg-surface-elevated);
}
.timer-settings {
  grid-column: 1 / -1;
  border-top: 1px solid var(--border-subtle);
}
.timer-settings summary {
  min-height: 44px;
  padding: 12px 0 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.timer-settings summary:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 3px;
}
.timer-settings :deep(.q-field) {
  margin-top: 12px;
}
.timer-sound-controls {
  margin-top: 8px;
}
.timer-sound-controls :deep(.q-btn) {
  min-height: 44px;
}
.timer-sound-controls p {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 8px 0 0;
}
@media (max-width: 767px) {
  .rest-timer-panel {
    gap: 8px 16px;
    padding: 12px 16px;
  }
  .timer-readout {
    grid-template-columns: auto auto;
    align-items: center;
    gap: 4px 12px;
  }
  .timer-clock {
    font-size: 28px;
  }
  .timer-buttons {
    flex-direction: row;
    align-items: center;
  }
  .timer-status {
    font-size: 11px;
  }
  .timer-settings summary {
    padding-top: 10px;
  }
}
</style>
