<script setup lang="ts">
import type { PlanDay, WeeklyPlan, WorkoutSession } from '@/types/workout';

const sessionName = defineModel<string>('sessionName', { required: true });

defineProps<{
  activeSession: WorkoutSession | null;
  plan: WeeklyPlan | null;
  selectedDay: PlanDay | null;
  completedSetCount: number;
  scheduledSetCount: number;
  sessionBusy: boolean;
  sessionReady: boolean;
  planLoading: boolean;
}>();

const emit = defineEmits<{
  start: [];
  finish: [];
}>();
</script>

<template>
  <section class="session-bar" aria-label="Workout session controls">
    <div class="session-copy">
      <strong>{{
        activeSession?.name ??
        (selectedDay
          ? selectedDay.isRestDay
            ? 'Free Workout'
            : `${selectedDay.dayName} · ${selectedDay.title}`
          : 'Strength Session')
      }}</strong>
      <span v-if="activeSession" class="session-meta">
        <template v-if="activeSession.planDayIndex !== null">
          {{ plan?.days[activeSession.planDayIndex]?.dayName }} plan ·
        </template>
        {{ activeSession.exercises.length }} movements ·
        <span class="tabular-nums">{{ completedSetCount }} / {{ scheduledSetCount }}</span> working
        sets complete
      </span>
      <span v-else class="session-meta">
        {{ selectedDay?.exercises.length ?? 0 }} planned movements ·
        {{ selectedDay?.isRestDay ? 'Recovery day' : (selectedDay?.focus ?? 'Scheduled session') }}
      </span>
    </div>
    <div class="session-actions">
      <q-input
        v-if="!activeSession"
        v-model="sessionName"
        outlined
        dense
        placeholder="Name this workout"
        aria-label="Workout name"
        class="session-name-input"
        :disable="!sessionReady || planLoading"
        @keyup.enter="emit('start')"
      />
      <q-btn
        v-if="!activeSession"
        unelevated
        no-caps
        color="primary"
        class="session-start-btn"
        :label="
          selectedDay?.isRestDay
            ? 'Start free workout'
            : `Start ${selectedDay?.shortDay ?? ''} workout`
        "
        :loading="sessionBusy"
        :disable="!sessionReady || sessionBusy || planLoading"
        @click="emit('start')"
      />
      <q-btn
        v-else
        unelevated
        no-caps
        color="primary"
        class="session-finish-btn"
        label="Finish workout"
        :loading="sessionBusy"
        @click="emit('finish')"
      />
    </div>
  </section>
</template>

<style scoped>
.session-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 94px;
  padding: 18px 22px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  transition: all 0.2s ease;
}

.session-copy {
  display: grid;
  gap: 4px;
}

.session-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.session-label {
  margin: 0;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.session-copy strong {
  line-height: 1.35;
  font-family:
    'DM Sans',
    -apple-system,
    sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.session-meta {
  color: var(--text-secondary);
  font-size: 13px;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.session-name-input {
  width: 220px;
}

.session-start-btn,
.session-finish-btn {
  min-height: 44px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 700;
}

@media (max-width: 700px) {
  .session-bar:has(.session-finish-btn) {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }
  .session-bar:has(.session-finish-btn) .session-copy strong {
    font-size: 18px;
    overflow-wrap: anywhere;
  }
  .session-bar:has(.session-finish-btn) .session-finish-btn {
    width: auto;
    min-width: 112px;
    padding: 0 12px;
  }
}

@media (max-width: 700px) {
  .session-bar {
    align-items: stretch;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }

  .session-actions {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .session-name-input {
    width: 100%;
  }

  .session-start-btn,
  .session-finish-btn {
    width: 100%;
    min-height: 46px;
  }
}
</style>
