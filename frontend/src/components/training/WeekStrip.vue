<script setup lang="ts">
import type { PlanDay } from '@/types/workout';
function dateFor(dayIndex: number) {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + dayIndex);
  return date.getDate();
}

defineProps<{
  days: PlanDay[];
  selectedDayIndex: number;
  dayStatus: (dayIndex: number) => 'Done' | 'Live' | null;
}>();

const emit = defineEmits<{
  'update:selectedDayIndex': [value: number];
}>();
</script>

<template>
  <nav class="week-strip" aria-label="Select a workout day">
    <button
      v-for="day in days"
      :key="day.dayIndex"
      class="week-day"
      :class="{
        selected: day.dayIndex === selectedDayIndex,
        'is-rest': day.isRestDay,
        'is-complete': dayStatus(day.dayIndex) === 'Done',
        'is-live': dayStatus(day.dayIndex) === 'Live',
      }"
      :aria-pressed="day.dayIndex === selectedDayIndex"
      @click="emit('update:selectedDayIndex', day.dayIndex)"
    >
      <span class="day-short">{{ day.shortDay }}</span>
      <strong class="day-num tabular-nums">{{ dateFor(day.dayIndex) }}</strong>
      <span class="day-meta">
        <template v-if="day.isRestDay">Rest</template>
        <template v-else-if="dayStatus(day.dayIndex) === 'Live'">
          <span class="mini-live-dot" /> Live
        </template>
        <template v-else-if="dayStatus(day.dayIndex) === 'Done'"> ✓ Done </template>
        <template v-else>{{ day.exercises.length }} moves</template>
      </span>
    </button>
  </nav>
</template>

<style scoped>
.week-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  margin: 16px 0;
}

.week-day {
  display: grid;
  min-height: 82px;
  justify-items: center;
  align-content: center;
  gap: 4px;
  padding: 10px 4px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.week-day:hover {
  border-color: var(--border-strong);
  background: var(--bg-surface-elevated);
  transform: translateY(-1px);
}

.week-day:active {
  transform: translateY(1px);
}

.week-day:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

.week-day.selected {
  border-color: var(--accent-primary);
  background: var(--accent-surface);
  color: var(--text-primary);
  box-shadow: 0 0 0 1px var(--accent-primary);
}

.day-short {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.week-day.selected .day-short {
  color: var(--accent-primary);
}

.day-num {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: var(--text-primary);
}

.day-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
}

.week-day.selected .day-meta {
  color: var(--text-secondary);
}

.week-day.is-rest:not(.selected) {
  opacity: 0.75;
  background: var(--bg-page);
}

.week-day.is-complete:not(.selected) {
  border-color: var(--border-strong);
}

.week-day.is-complete .day-meta {
  color: var(--accent-primary);
}

.mini-live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-primary);
  display: inline-block;
}

@media (max-width: 650px) {
  .week-strip {
    grid-template-columns: repeat(7, minmax(38px, 1fr));
    overflow-x: auto;
    gap: 4px;
    padding-bottom: 4px;
  }

  .week-day {
    min-height: 72px;
    padding: 8px 2px;
  }

  .day-num {
    font-size: 18px;
  }

  .day-meta {
    font-size: 9px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
}
</style>
