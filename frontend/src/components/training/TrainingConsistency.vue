<script setup lang="ts">
import { computed } from 'vue';
import { trainingWeeks } from '@/utils/trainingConsistency';
import { useTrainingPreferences } from '@/composables/useTrainingPreferences';

const props = defineProps<{ workouts: Parameters<typeof trainingWeeks>[0] }>();
const { preferences } = useTrainingPreferences();
const weeks = computed(() => trainingWeeks(props.workouts));
const current = computed(() => weeks.value.at(-1)!);
const goal = computed(() => preferences.value.trainingDays.length);
const progress = computed(() =>
  Math.min(100, (current.value.days / Math.max(goal.value, 1)) * 100),
);
</script>

<template>
  <section class="consistency-panel" aria-labelledby="consistency-title">
    <div class="consistency-heading">
      <div>
        <p class="eyebrow">SHOWING UP OVER TIME</p>
        <h2 id="consistency-title">Your training rhythm</h2>
      </div>
      <RouterLink to="/app/settings">Adjust your goal</RouterLink>
    </div>
    <p class="goal-readout">
      <strong>{{ current.days }} / {{ goal }}</strong> training days this week
      <span v-if="current.days >= goal && goal > 0">· Weekly goal reached</span>
    </p>
    <div
      class="goal-track"
      role="progressbar"
      :aria-valuenow="Math.min(current.days, goal)"
      :aria-valuemin="0"
      :aria-valuemax="goal"
      :aria-label="`${current.days} of ${goal} training days this week`"
    >
      <span :style="{ width: `${progress}%` }" />
    </div>
    <div class="week-bars" role="list" aria-label="Training days in each of the last eight weeks">
      <div
        v-for="(week, index) in weeks"
        :key="week.start"
        class="week-column"
        role="listitem"
        :aria-label="`Week of ${week.label}: ${week.days} training days, ${week.sessions} sessions${index === weeks.length - 1 ? ', current week' : ''}`"
      >
        <span class="bar-number">{{ week.days }}</span>
        <div class="bar-stage">
          <span
            :class="{ current: index === weeks.length - 1 }"
            :style="{ height: `${(week.days / 7) * 100}%` }"
          />
        </div>
        <span class="week-label">{{ week.label }}</span>
      </div>
    </div>
    <p class="consistency-note">
      One training day counts once, even with multiple sessions. Only finished workouts with a
      completed working set count. Weeks start Monday in your local time.
    </p>
  </section>
</template>

<style scoped>
.consistency-panel {
  margin-block: 24px 32px;
  padding-block: 24px;
  border-block: 1px solid var(--border-subtle);
}
.consistency-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 20px;
}
.eyebrow {
  margin: 0 0 8px;
  color: var(--text-secondary);
  font-size: 11px;
  letter-spacing: 0.12em;
}
h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
}
a {
  color: var(--accent-primary);
  font-size: 14px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.goal-readout {
  color: var(--text-secondary);
  margin-block: 20px 12px;
  font-size: 14px;
}
.goal-readout strong {
  color: var(--text-primary);
  font-size: 26px;
  font-variant-numeric: tabular-nums;
  margin-right: 8px;
}
.goal-readout span {
  color: var(--accent-primary);
}
.goal-track {
  height: 5px;
  background: var(--border-subtle);
  overflow: hidden;
  border-radius: 3px;
}
.goal-track > span {
  display: block;
  height: 100%;
  background: var(--accent-primary);
}
.week-bars {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: clamp(6px, 2vw, 24px);
  margin-top: 24px;
}
.week-column {
  min-width: 0;
  text-align: center;
}
.bar-stage {
  height: 72px;
  display: flex;
  align-items: end;
  justify-content: center;
  border-bottom: 1px solid var(--border-strong);
}
.bar-stage > span {
  display: block;
  width: min(100%, 44px);
  min-height: 2px;
  background: var(--text-muted);
  border-radius: 3px 3px 0 0;
}
.bar-stage > span.current {
  background: var(--accent-primary);
}
.bar-number {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.week-label {
  display: block;
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.consistency-note {
  max-width: 72ch;
  margin: 20px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
@media (max-width: 500px) {
  .consistency-heading {
    flex-direction: column;
    gap: 0;
  }
  h2 {
    font-size: 22px;
  }
  .week-label {
    font-size: 10px;
  }
}
</style>
