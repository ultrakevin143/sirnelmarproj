<template>
  <q-page class="history-page">
    <div class="history-shell">
      <WeightUnitToggle class="q-mb-lg" />
      <header class="history-heading">
        <div>
          <p class="eyebrow">YOUR TRAINING</p>
          <h1>Workout history.</h1>
          <p class="intro">Completed workouts and unfinished sessions carried into a new week.</p>
        </div>
        <div class="history-heading-actions">
          <q-btn
            outline
            no-caps
            icon="download"
            label="Export CSV"
            @click="exportHistory"
            :loading="exporting"
            :disable="loading && !workouts.length"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Start a workout"
            class="start-workout-btn"
            to="/app"
          />
        </div>
      </header>

      <section v-if="summary" class="weekly-summary" aria-label="Weekly training summary">
        <p class="eyebrow">
          THIS WEEK · {{ dateParts(summary.from).weekday }} –
          {{ dateParts(new Date(Date.parse(summary.to) - 1).toISOString()).weekday }}
        </p>
        <div class="summary-metrics">
          <div>
            <strong>{{ summary.sessions }}</strong
            ><span>SESSIONS</span>
          </div>
          <div>
            <strong>{{ summary.completedSets }}</strong
            ><span>SETS</span>
          </div>
          <div>
            <strong>{{ (toDisplay(summary.volumeKg) ?? 0).toLocaleString() }}</strong
            ><span>{{ massUnit.toUpperCase() }} VOLUME</span>
          </div>
          <div class="muscle-summary">
            <strong>{{ summary.muscleGroups[0]?.muscle ?? '—' }}</strong
            ><span>MOST-TRAINED GROUP</span>
          </div>
        </div>
      </section>

      <nav class="history-view-switch" aria-label="History views">
        <button type="button" :aria-pressed="historyView === 'log'" @click="historyView = 'log'">
          Workout log</button
        ><button
          type="button"
          :aria-pressed="historyView === 'insights'"
          @click="historyView = 'insights'"
        >
          Training insights
        </button>
      </nav>
      <section v-show="historyView === 'log'" aria-label="Workout log">
        <div class="history-filters">
          <q-input
            v-model="historySearch"
            outlined
            dense
            clearable
            label="Search workouts or exercises"
          /><q-input
            v-model="historyFrom"
            outlined
            dense
            type="date"
            label="From date"
            stack-label
          /><q-input
            v-model="historyTo"
            outlined
            dense
            type="date"
            label="To date"
            stack-label
          /><q-btn
            flat
            no-caps
            label="Clear filters"
            @click="
              historySearch = '';
              historyFrom = '';
              historyTo = '';
            "
          />
        </div>
        <div v-if="errorMessage" class="history-feedback" role="alert">
          <p>{{ errorMessage }}</p>
          <q-btn outline no-caps label="Retry history" @click="loadHistory" />
        </div>
        <div
          v-if="loading && !workouts.length"
          class="history-list"
          aria-label="Loading workout history"
        >
          <q-skeleton v-for="row in 3" :key="row" height="112px" class="history-skeleton" />
        </div>
        <div v-else-if="errorMessage && !workouts.length" class="history-empty" role="alert">
          <q-icon name="cloud_off" size="28px" />
          <div>
            <strong>History is unavailable</strong>
            <p>{{ errorMessage }}</p>
          </div>
        </div>
        <div v-else-if="visibleWorkouts.length" class="history-list">
          <article v-for="workout in visibleWorkouts" :key="workout.id" class="history-entry">
            <div class="history-entry-date">
              <span>{{ dateParts(workout.startedAt).month }}</span>
              <strong>{{ dateParts(workout.startedAt).day }}</strong>
            </div>
            <div class="history-entry-info">
              <h2>{{ workout.name }}</h2>
              <p>
                {{ dateParts(workout.startedAt).weekday }} ·
                {{ workout.exercises.length }} movements · {{ setCount(workout) }} sets<span
                  v-if="workout.perceivedEffort"
                >
                  · effort {{ workout.perceivedEffort }}/10</span
                >
              </p>
            </div>
            <div class="history-entry-summary">
              <strong>{{
                workout.abandonedAt
                  ? 'Saved unfinished'
                  : workout.completedAt
                    ? duration(workout.startedAt, workout.completedAt)
                    : 'In progress'
              }}</strong>
              <span>{{
                workout.abandonedAt ? 'WEEK RESET' : workout.completedAt ? 'DURATION' : 'STATUS'
              }}</span>
            </div>
            <div class="history-movements">
              <span v-for="(exercise, index) in workout.exercises" :key="exercise.id">
                {{ exercise.exerciseName }}<i v-if="index < workout.exercises.length - 1"> · </i>
              </span>
              <span v-if="!workout.exercises.length" class="muted">No movements recorded</span>
            </div>
            <div class="history-entry-actions">
              <q-btn
                flat
                no-caps
                class="history-details-toggle"
                :label="expandedWorkoutId === workout.id ? 'Hide details' : 'View details'"
                @click="toggleDetails(workout)"
              />
              <q-btn
                flat
                no-caps
                label="Repeat workout"
                :loading="rowBusy[workout.id]"
                @click="repeatWorkout(workout)"
              />
            </div>
            <p v-if="actionErrors[workout.id]" class="history-action-message" role="alert">
              {{ actionErrors[workout.id] }}
            </p>
            <p v-if="actionMessages[workout.id]" class="history-action-message" role="status">
              {{ actionMessages[workout.id] }}
            </p>
            <section
              v-if="expandedWorkoutId === workout.id"
              class="workout-detail"
              :aria-label="`${workout.name} details`"
            >
              <div v-for="exercise in workout.exercises" :key="exercise.id" class="detail-exercise">
                <h3>{{ exercise.exerciseName }}</h3>
                <div v-if="exercise.sets.length" class="detail-set-list">
                  <div v-for="set in exercise.sets" :key="set.id" class="detail-set-row">
                    <span
                      >Set {{ set.setNumber }}{{ set.completed ? ' · complete' : ' · planned' }}
                      <span v-if="set.setType === 'warmup'"> · warm-up</span>
                      <span
                        v-for="record in set.personalRecords || []"
                        :key="record"
                        class="set-pr-badge"
                        :title="recordDescriptions[record]"
                      >
                        PR · {{ recordLabels[record] }}
                      </span>
                    </span>
                    <q-input
                      :model-value="toDisplay(draftSet(set).weightKg)"
                      :disable="rowBusy[workout.id]"
                      @update:model-value="draftSet(set).weightKg = fromDisplay($event)"
                      dense
                      outlined
                      type="number"
                      min="0"
                      step="any"
                      :aria-label="`${exercise.exerciseName} set ${set.setNumber} load ${massUnit}`"
                    />
                    <span>{{ massUnit }} ×</span>
                    <q-input
                      v-model.number="draftSet(set).reps"
                      :disable="rowBusy[workout.id]"
                      dense
                      outlined
                      type="number"
                      min="1"
                      :aria-label="`${exercise.exerciseName} set ${set.setNumber} reps`"
                    />
                    <span>reps</span>
                    <q-btn
                      flat
                      dense
                      no-caps
                      label="Save"
                      @click="saveHistorySet(workout.id, set)"
                    />
                    <q-btn
                      flat
                      dense
                      round
                      icon="delete_outline"
                      :aria-label="`Delete ${exercise.exerciseName} set ${set.setNumber}`"
                      @click="deleteHistorySet(workout.id, set)"
                    />
                  </div>
                </div>
                <p v-else class="muted">No sets recorded.</p>
              </div>
              <div class="workout-notes">
                <q-input
                  v-model="notesDrafts[workout.id]"
                  type="textarea"
                  outlined
                  autogrow
                  maxlength="5000"
                  label="Workout notes"
                />
                <q-btn
                  unelevated
                  no-caps
                  color="primary"
                  label="Save notes"
                  @click="saveNotes(workout)"
                />
              </div>
              <div class="history-effort-editor">
                <q-select
                  v-model="effortDrafts[workout.id]"
                  :options="effortOptions"
                  emit-value
                  map-options
                  clearable
                  outlined
                  dense
                  label="Perceived effort (1–10)"
                  aria-label="Workout perceived effort from 1 to 10"
                />
                <q-btn
                  outline
                  no-caps
                  label="Save effort"
                  aria-label="Save workout perceived effort"
                  @click="saveEffort(workout)"
                />
                <span class="muted">1 = very easy · 10 = maximum effort</span>
              </div>
            </section>
          </article>
        </div>
        <div v-else-if="workouts.length" class="history-empty">
          <strong>No workouts match these filters</strong
          ><q-btn
            flat
            no-caps
            label="Clear filters"
            @click="
              historySearch = '';
              historyFrom = '';
              historyTo = '';
            "
          />
        </div>
        <div v-else class="history-empty">
          <q-icon name="event_note" size="32px" />
          <strong>Your training history starts with your first session</strong>
          <p>Completed workouts will show up here with their movements and set counts.</p>
          <q-btn unelevated no-caps color="primary" label="Start your first workout" to="/app" />
        </div>
      </section>
      <section v-show="historyView === 'insights'" aria-label="Training insights">
        <h2 class="history-insights-heading">Training insights</h2>
        <div v-if="analyticsError" class="history-feedback" role="alert">
          <p>{{ analyticsError }}</p>
          <q-btn outline no-caps label="Refresh statistics" @click="reloadDerived" />
        </div>
        <TrainingConsistency
          v-if="workouts.length || (!loading && !errorMessage)"
          :workouts="workouts"
        />
        <section class="progress-panel" aria-labelledby="progress-heading">
          <div class="section-heading">
            <div>
              <p class="eyebrow">OVER TIME</p>
              <h2 id="progress-heading">Exercise progress</h2>
            </div>
            <q-select
              v-model="selectedProgressId"
              :options="progressOptions"
              emit-value
              map-options
              dense
              outlined
              clearable
              label="Choose an exercise"
              aria-label="Choose exercise progress"
            />
          </div>
          <div class="progress-controls">
            <q-select
              v-model="rangeDays"
              :options="rangeOptions"
              emit-value
              map-options
              outlined
              dense
              label="Date range"
            /><q-select
              v-model="metric"
              :options="metricOptions"
              emit-value
              map-options
              outlined
              dense
              label="Measure"
            />
          </div>
          <div v-if="progressError" class="history-feedback" role="alert">
            <p>{{ progressError }}</p>
            <q-btn outline no-caps label="Retry trend" @click="loadProgress" />
          </div>
          <q-skeleton
            v-else-if="progressLoading"
            height="180px"
            aria-label="Loading exercise trend"
          />
          <div v-else-if="progressPoints.length" class="progress-chart">
            <svg
              viewBox="0 0 600 170"
              role="img"
              :aria-label="`${progressName}: ${metricLabel}. Full values in the data table below.`"
            >
              <line x1="60" y1="140" x2="580" y2="140" />
              <text x="4" y="30" fill="currentColor" font-size="12">
                {{ Math.round(chartMax * 100) / 100 }}
              </text>
              <text x="36" y="140" fill="currentColor" font-size="12">0</text>
              <polyline :points="progressPolyline" />
              <circle
                v-for="(point, index) in chartDots"
                :key="point.workoutId"
                :cx="point.x"
                :cy="point.y"
                r="4"
              >
                <title>
                  {{ dateParts(progressPoints[index]!.date).weekday }} ·
                  {{ metricValue(progressPoints[index]!) }}
                </title>
              </circle>
            </svg>
            <div class="chart-caption">
              <span>{{ dateParts(progressPoints[0]!.date).weekday }}</span
              ><strong>{{ metricLabel }}</strong
              ><span>{{ dateParts(progressPoints[progressPoints.length - 1]!.date).weekday }}</span>
            </div>
            <details class="progress-data">
              <summary>View trend data</summary>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>{{ metricLabel }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="point in progressPoints" :key="point.workoutId">
                    <td>{{ dateParts(point.date).weekday }}</td>
                    <td>{{ metricValue(point) }}</td>
                  </tr>
                </tbody>
              </table>
            </details>
          </div>
          <div v-else class="quiet-state">
            {{
              selectedProgressId
                ? 'No completed working sets in this date range. Try a longer range.'
                : 'Complete a working set, then choose an exercise to see your progress.'
            }}
          </div>
        </section>

        <section class="records-panel" aria-labelledby="records-heading">
          <div class="section-heading">
            <div>
              <p class="eyebrow">COMPLETED SETS ONLY</p>
              <h2 id="records-heading">Personal records</h2>
            </div>
          </div>
          <p v-if="recordRules" class="record-rules">
            Records use completed working sets. Load and estimated strength apply to weighted sets;
            rep, duration and distance records also include bodyweight and timed exercises.
          </p>
          <div v-if="records.length" class="record-list">
            <article v-for="record in records" :key="record.exerciseId" class="record-row">
              <div>
                <strong>{{ record.exerciseName }}</strong
                ><span
                  >{{ record.targetMuscle || 'Exercise' }} · {{ record.workouts }} workouts</span
                >
              </div>
              <div class="record-values">
                <div v-for="metric in recordHighlights(record)" :key="metric.label">
                  <strong>{{ metric.value }}</strong
                  ><span>{{ metric.label }}</span>
                </div>
              </div>
            </article>
          </div>
          <div v-else class="quiet-state">
            Records appear after you finish a workout with completed working sets.
          </div>
        </section>
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import axios from 'axios';
import { exportFile } from '@/utils/exportFile';
import { useRoute, useRouter } from 'vue-router';
import { useTrainingPreferences } from '@/composables/useTrainingPreferences';
import TrainingConsistency from '@/components/training/TrainingConsistency.vue';
import WeightUnitToggle from '@/components/training/WeightUnitToggle.vue';
import { recordLabels, recordDescriptions } from '@/utils/personalRecords';
import type { PersonalRecord } from '@/types/workout';

type WorkoutSet = {
  id: number;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  completed: boolean;
  setType?: 'warmup' | 'working';
  personalRecords?: PersonalRecord[];
};
type WorkoutExercise = { id: number; exerciseName: string; sets: WorkoutSet[] };
type Workout = {
  id: number;
  name: string;
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  notes: string;
  perceivedEffort: number | null;
  exercises: WorkoutExercise[];
};
type Summary = {
  from: string;
  to: string;
  sessions: number;
  completedSets: number;
  volumeKg: number;
  muscleGroups: Array<{ muscle: string; sets: number; volumeKg: number }>;
};
type RecordRow = {
  exerciseId: string;
  exerciseName: string;
  targetMuscle: string | null;
  heaviestLoadKg: number;
  estimatedOneRepMaxKg: number | null;
  workouts: number;
  bestReps: number;
  longestSeconds: number;
  farthestMeters: number;
};
type ProgressPoint = {
  bestReps: number;
  totalReps: number;
  durationSeconds: number;
  distanceMeters: number;
  workoutId: number;
  date: string;
  topLoadKg: number;
  volumeKg: number;
  estimatedOneRepMaxKg: number | null;
};

const { massUnit, toDisplay, fromDisplay, formatLoad } = useTrainingPreferences();
const route = useRoute();
const router = useRouter();
function recordHighlights(record: RecordRow) {
  const values: Array<{ label: string; value: string }> = [];
  if (record.heaviestLoadKg > 0)
    values.push({ label: 'HEAVIEST', value: formatLoad(record.heaviestLoadKg) });
  if (record.estimatedOneRepMaxKg)
    values.push({ label: 'EST. 1RM', value: formatLoad(record.estimatedOneRepMaxKg) });
  if (record.bestReps > 0 && record.heaviestLoadKg === 0)
    values.push({ label: 'BEST REPS', value: `${record.bestReps} reps` });
  if (record.longestSeconds > 0)
    values.push({ label: 'LONGEST', value: `${record.longestSeconds} sec` });
  if (record.farthestMeters > 0)
    values.push({ label: 'FARTHEST', value: `${record.farthestMeters} m` });
  return values;
}
const workouts = ref<Workout[]>([]);
const summary = ref<Summary | null>(null);
const records = ref<RecordRow[]>([]);
const recordRules = ref<{ heaviestLoad: string; estimatedOneRepMax: string } | null>(null);
const progressOptions = ref<Array<{ label: string; value: string }>>([]);
const selectedProgressId = ref<string | null>(null);
const progressPoints = ref<ProgressPoint[]>([]);
const expandedWorkoutId = ref<number | null>(Number(route.query.workout) || null);
const notesDrafts = reactive<Record<number, string>>({});
const effortDrafts = reactive<Record<number, number | null>>({});
const setEdits = reactive<Record<number, { weightKg: number | null; reps: number | null }>>({});
const actionErrors = reactive<Record<number, string>>({});
const actionMessages = reactive<Record<number, string>>({});
const rowBusy = reactive<Record<number, boolean>>({});
const effortOptions = Array.from({ length: 10 }, (_, index) => ({
  label: `${index + 1} / 10`,
  value: index + 1,
}));
const loading = ref(true);
const historyView = ref<'log' | 'insights'>('log');
const errorMessage = ref('');
const exporting = ref(false);
async function exportHistory() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    await exportFile('/api/v1/workouts/export.csv', 'liftup-workout-history.csv', 'text/csv');
  } catch (error) {
    errorMessage.value = axios.isAxiosError(error)
      ? (error.response?.data?.error ?? 'Could not export your history. Try again.')
      : 'Could not export your history. Try again.';
  } finally {
    exporting.value = false;
  }
}
const analyticsError = ref('');
const progressError = ref('');
const progressLoading = ref(false);
const historySearch = ref<string | null>('');
const historyFrom = ref('');
const historyTo = ref('');
const rangeDays = ref(90);
const rangeOptions = [
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last year', value: 365 },
];
const metric = ref<keyof Omit<ProgressPoint, 'workoutId' | 'date'>>('topLoadKg');
const metricOptions = computed(() => [
  { label: `Top load (${massUnit.value})`, value: 'topLoadKg' },
  { label: `Volume (${massUnit.value} × reps)`, value: 'volumeKg' },
  { label: `Estimated 1RM (${massUnit.value})`, value: 'estimatedOneRepMaxKg' },
  { label: 'Best set (reps)', value: 'bestReps' },
  { label: 'Total reps', value: 'totalReps' },
  { label: 'Duration (seconds)', value: 'durationSeconds' },
  { label: 'Distance (metres)', value: 'distanceMeters' },
]);
const metricLabel = computed(
  () => metricOptions.value.find((m) => m.value === metric.value)?.label ?? 'Progress',
);
const metricValue = (p: ProgressPoint) => {
  const value = Number(p[metric.value] ?? 0);
  return ['topLoadKg', 'volumeKg', 'estimatedOneRepMaxKg'].includes(metric.value)
    ? (toDisplay(value) ?? 0)
    : value;
};
const chartMax = computed(() => Math.max(1, ...progressPoints.value.map(metricValue)));
const progressName = computed(
  () =>
    progressOptions.value.find((item) => item.value === selectedProgressId.value)?.label ??
    'Exercise',
);
const chartDots = computed(() => {
  const points = progressPoints.value;
  const first = Date.parse(points[0]?.date ?? '');
  const last = Date.parse(points.at(-1)?.date ?? '');
  return points.map((point) => ({
    workoutId: point.workoutId,
    x: first === last ? 304 : 60 + ((Date.parse(point.date) - first) / (last - first)) * 510,
    y: 140 - (metricValue(point) / chartMax.value) * 112,
  }));
});
const progressPolyline = computed(() =>
  chartDots.value.map((point) => `${point.x},${point.y}`).join(' '),
);
const visibleWorkouts = computed(() =>
  workouts.value.filter((w) => {
    const date = new Date(w.startedAt);
    const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const text = `${w.name} ${w.exercises.map((e) => e.exerciseName).join(' ')}`.toLowerCase();
    return (
      text.includes((historySearch.value ?? '').trim().toLowerCase()) &&
      (!historyFrom.value || local >= historyFrom.value) &&
      (!historyTo.value || local <= historyTo.value)
    );
  }),
);
function draftSet(set: WorkoutSet) {
  return (setEdits[set.id] ??= { weightKg: set.weightKg, reps: set.reps });
}
function errorText(e: unknown, fallback: string) {
  return axios.isAxiosError(e) ? (e.response?.data?.error ?? fallback) : fallback;
}
async function loadHistory() {
  loading.value = true;
  errorMessage.value = '';
  try {
    workouts.value = (await axios.get<{ workouts: Workout[] }>('/api/v1/workouts')).data.workouts;
    workouts.value.forEach((w) => {
      notesDrafts[w.id] ??= w.notes ?? '';
      effortDrafts[w.id] ??= w.perceivedEffort;
    });
  } catch {
    errorMessage.value =
      'Could not load your workout history. Check your connection and try again.';
  } finally {
    loading.value = false;
  }
}
async function reloadDerived() {
  analyticsError.value = '';
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const responses = await Promise.allSettled([
    axios.get<Summary>('/api/v1/analytics/summary', {
      params: { from: start.toISOString(), to: end.toISOString() },
    }),
    axios.get<{
      rules: { heaviestLoad: string; estimatedOneRepMax: string };
      records: RecordRow[];
    }>('/api/v1/records'),
    axios.get<{ exercises: Array<{ id: string; name: string; targetMuscle: string | null }> }>(
      '/api/v1/progress/exercises',
    ),
  ]);
  const [week, pr, choices] = responses;
  if (week.status === 'fulfilled') summary.value = week.value.data;
  if (pr.status === 'fulfilled') {
    records.value = pr.value.data.records;
    recordRules.value = pr.value.data.rules;
  }
  if (choices.status === 'fulfilled') {
    progressOptions.value = choices.value.data.exercises.map((e) => ({
      label: `${e.name}${e.targetMuscle ? ` · ${e.targetMuscle}` : ''}`,
      value: e.id,
    }));
    if (
      !selectedProgressId.value ||
      !progressOptions.value.some((e) => e.value === selectedProgressId.value)
    )
      selectedProgressId.value = progressOptions.value[0]?.value ?? null;
  }
  if (responses.some((r) => r.status === 'rejected'))
    analyticsError.value =
      'Some training statistics couldn’t load. Your history is still available.';
  await loadProgress();
}
let progressRequest = 0;
async function loadProgress() {
  const request = ++progressRequest;
  progressError.value = '';
  if (!selectedProgressId.value) {
    progressPoints.value = [];
    progressLoading.value = false;
    return;
  }
  progressLoading.value = true;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - rangeDays.value);
  try {
    const response = await axios.get<{ points: ProgressPoint[] }>(
      `/api/v1/progress/${encodeURIComponent(selectedProgressId.value)}`,
      { params: { from: from.toISOString(), to: to.toISOString() } },
    );
    if (request === progressRequest) {
      progressPoints.value = response.data.points;
      if (
        progressPoints.value.length &&
        progressPoints.value.every((p) => !p.topLoadKg) &&
        ['topLoadKg', 'estimatedOneRepMaxKg', 'volumeKg'].includes(metric.value)
      )
        metric.value = progressPoints.value.some((p) => p.bestReps)
          ? 'bestReps'
          : progressPoints.value.some((p) => p.durationSeconds)
            ? 'durationSeconds'
            : 'distanceMeters';
    }
  } catch {
    if (request === progressRequest) {
      progressError.value = 'Could not load this trend. Check your connection and try again.';
      progressPoints.value = [];
    }
  } finally {
    if (request === progressRequest) progressLoading.value = false;
  }
}
watch([selectedProgressId, rangeDays], () => void loadProgress());
onMounted(() => {
  void loadHistory();
  void reloadDerived();
});
function toggleDetails(w: Workout) {
  expandedWorkoutId.value = expandedWorkoutId.value === w.id ? null : w.id;
}
async function rowAction(id: number, action: () => Promise<void>) {
  if (rowBusy[id]) return;
  rowBusy[id] = true;
  actionErrors[id] = '';
  actionMessages[id] = '';
  try {
    await action();
  } catch (e) {
    actionErrors[id] = errorText(
      e,
      'Could not save this change. Your entries are kept here. Check your connection and try again.',
    );
  } finally {
    rowBusy[id] = false;
  }
}
function updateWorkout(workout: Workout) {
  const index = workouts.value.findIndex((w) => w.id === workout.id);
  if (index >= 0) workouts.value[index] = workout;
}
const saveNotes = (w: Workout) =>
  rowAction(w.id, async () => {
    updateWorkout(
      (
        await axios.patch<{ session: Workout }>(`/api/v1/workouts/${w.id}/notes`, {
          notes: notesDrafts[w.id] ?? '',
        })
      ).data.session,
    );
    actionMessages[w.id] = 'Notes saved.';
  });
const saveEffort = (w: Workout) =>
  rowAction(w.id, async () => {
    updateWorkout(
      (
        await axios.patch<{ session: Workout }>(`/api/v1/workouts/${w.id}/effort`, {
          perceivedEffort: effortDrafts[w.id] ?? null,
        })
      ).data.session,
    );
    actionMessages[w.id] = 'Effort saved.';
  });
const saveHistorySet = (id: number, set: WorkoutSet) =>
  rowAction(id, async () => {
    updateWorkout(
      (
        await axios.patch<{ session: Workout }>(`/api/v1/workouts/${id}/sets/${set.id}`, {
          ...draftSet(set),
          completed: set.completed,
        })
      ).data.session,
    );
    delete setEdits[set.id];
    actionMessages[id] = 'Set saved.';
    await refreshAfterSetChange();
  });
async function refreshAfterSetChange() {
  let historyRefreshFailed = false;
  try {
    workouts.value = (await axios.get<{ workouts: Workout[] }>('/api/v1/workouts')).data.workouts;
  } catch {
    historyRefreshFailed = true;
  }
  await reloadDerived();
  if (historyRefreshFailed)
    errorMessage.value =
      'Your change was saved, but history couldn’t refresh. Retry history to update its record badges.';
}
async function deleteHistorySet(id: number, set: WorkoutSet) {
  if (!window.confirm(`Delete set ${set.setNumber}? Training totals and records will recalculate.`))
    return;
  await rowAction(id, async () => {
    updateWorkout(
      (await axios.delete<{ session: Workout }>(`/api/v1/workouts/${id}/sets/${set.id}`)).data
        .session,
    );
    delete setEdits[set.id];
    actionMessages[id] = 'Set deleted.';
    await refreshAfterSetChange();
  });
}
const repeatWorkout = (w: Workout) =>
  rowAction(w.id, async () => {
    if (
      !window.confirm(
        `Start a new workout from ${w.name}? All copied sets will be marked incomplete.`,
      )
    )
      return;
    await axios.post(`/api/v1/workouts/${w.id}/repeat`);
    await router.push('/app');
  });

function setCount(workout: Workout) {
  return workout.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.completed).length,
    0,
  );
}

function dateParts(value: string) {
  const date = new Date(value);
  return {
    month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(date),
    weekday: new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(date),
  };
}

function duration(start: string, end: string) {
  const minutes = Math.max(
    1,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000),
  );
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
</script>

<style scoped>
.history-view-switch {
  display: flex;
  gap: 8px;
  margin: 24px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.history-view-switch button {
  min-height: 44px;
  padding: 10px 18px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
.history-view-switch button[aria-pressed='true'] {
  color: var(--accent-primary);
  background: var(--accent-surface);
  border-color: var(--accent-border);
}
.history-view-switch button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
.history-entry-actions {
  grid-column: 2 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.history-entry-actions .q-btn {
  min-height: 44px;
  white-space: nowrap;
}

.record-row .record-values {
  grid-column: 2 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.record-values > div {
  display: grid;
  gap: 4px;
}

.history-insights-heading {
  margin: 24px 0 20px;
  padding-top: 28px;
  border-top: 1px solid var(--border-subtle);
  font-size: 26px;
  line-height: 1.3;
}
.progress-controls,
.history-filters {
  display: flex;
  gap: 12px;
  margin-block: 20px;
  flex-wrap: wrap;
}
.progress-controls > *,
.history-filters > * {
  flex: 1;
  min-width: 160px;
}
.history-filters > :first-child {
  flex: 2;
}
.history-feedback {
  margin-block: 20px;
  padding: 16px;
  border: 1px solid var(--danger-primary);
  border-radius: var(--radius-md);
}
.history-action-message {
  grid-column: 1 / -1;
  margin: 8px 0;
}
.history-action-message[role='alert'] {
  color: var(--danger-primary);
}
.progress-data {
  margin-top: 20px;
}
.progress-data summary {
  cursor: pointer;
  min-height: 44px;
}
.progress-data table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 14px;
}
.progress-data td,
.progress-data th {
  padding: 10px;
  border-bottom: 1px solid var(--border-subtle);
}
@media (max-width: 500px) {
  .history-filters,
  .progress-controls {
    flex-direction: column;
  }
}
.history-heading-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.set-pr-badge {
  display: inline-block;
  background: var(--accent-primary);
  color: #192314;
  padding: 3px 5px;
  margin: 3px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 3px;
  white-space: nowrap;
}
.history-page {
  min-height: 100dvh;
  padding: 24px 20px 80px;
}

.history-shell {
  max-width: 1060px;
  margin: 0 auto;
}

.history-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.start-workout-btn {
  white-space: nowrap;
  font-weight: 700;
  min-height: 40px;
  padding: 0 16px;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  font-family:
    'DM Sans',
    -apple-system,
    sans-serif;
  font-size: clamp(28px, 4vw, 36px);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.intro {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.history-list {
  display: grid;
  gap: 12px;
}

.weekly-summary,
.progress-panel,
.records-panel {
  margin-bottom: 20px;
  padding: 22px 24px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--card-shadow);
}

.weekly-summary {
  background: var(--bg-surface-elevated);
  border-color: var(--border-strong);
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 10px;
}

.summary-metrics > div,
.record-row > div {
  display: grid;
  gap: 4px;
}

.summary-metrics strong {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.summary-metrics span,
.record-row span {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.summary-metrics .muscle-summary strong {
  font-size: 20px;
  color: var(--accent-primary);
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.section-heading h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-heading .eyebrow {
  margin-bottom: 4px;
}

.section-heading .q-select {
  width: min(100%, 280px);
}

.progress-chart svg {
  display: block;
  width: 100%;
  max-height: 230px;
  overflow: visible;
}

.progress-chart line {
  stroke: var(--border-subtle);
  stroke-width: 1;
}

.progress-chart polyline {
  fill: none;
  stroke: var(--accent-primary);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.progress-chart circle {
  fill: var(--accent-primary);
  stroke: var(--bg-surface);
  stroke-width: 2;
}

.chart-caption {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-muted);
  font-size: 11px;
  margin-top: 8px;
}

.chart-caption strong {
  color: var(--text-primary);
}

.record-rules {
  max-width: 75ch;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
  margin-bottom: 14px;
}

.record-list {
  display: grid;
  gap: 0;
}

.record-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 130px 130px;
  gap: 14px;
  padding: 12px 0;
  border-top: 1px solid var(--border-subtle);
}

.record-row strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.quiet-state {
  padding: 24px 0 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.history-entry {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 18px 22px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--card-shadow);
  transition: border-color 0.15s ease;
}

.history-entry:hover {
  border-color: var(--border-strong);
}

.history-entry-date {
  display: grid;
  width: 52px;
  height: 58px;
  align-content: center;
  justify-items: center;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
}

.history-entry-date span {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.history-entry-date strong {
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
}

.history-entry-info h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.history-entry-info p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.history-entry-summary {
  display: grid;
  justify-items: end;
  gap: 3px;
}

.history-entry-summary strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.history-entry-summary span {
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.history-movements {
  grid-column: 2 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
  margin-top: -6px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.history-details-toggle {
  grid-column: 2 / -1;
  justify-self: start;
  min-height: 30px;
  padding: 0 4px;
  color: var(--accent-primary);
  font-weight: 600;
}

.workout-detail {
  grid-column: 1 / -1;
  display: grid;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.detail-exercise h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.detail-set-list {
  display: grid;
  gap: 6px;
}

.detail-set-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.detail-set-row > span:first-child {
  width: 140px;
}

.detail-set-row .q-input {
  width: 90px;
}

.detail-set-row .q-btn {
  color: var(--accent-primary);
}

.workout-notes {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.workout-notes .q-input {
  flex: 1;
}

.history-effort-editor {
  display: grid;
  grid-template-columns: minmax(180px, 260px) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.history-movements i {
  color: var(--text-muted);
  font-style: normal;
}

.muted {
  color: var(--text-muted);
}

.history-skeleton {
  border-radius: var(--radius-lg);
}

.history-empty {
  display: grid;
  min-height: 240px;
  justify-items: center;
  align-content: center;
  gap: 12px;
  padding: 28px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  color: var(--text-secondary);
  text-align: center;
}

.history-empty strong {
  color: var(--text-primary);
  font-size: 16px;
}

.history-empty p {
  max-width: 400px;
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 700px) {
  .history-page {
    padding: 16px 14px 80px;
  }

  .history-heading {
    flex-direction: column;
    align-items: flex-start;
  }

  .history-entry {
    grid-template-columns: 48px minmax(0, 1fr) auto;
    gap: 12px;
    padding: 14px;
  }

  .summary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 16px;
  }

  .section-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .record-row {
    grid-template-columns: minmax(0, 1fr) 85px 85px;
    gap: 8px;
  }

  .detail-set-row {
    flex-wrap: wrap;
  }

  .detail-set-row > span:first-child {
    width: 100%;
  }

  .workout-notes {
    align-items: stretch;
    flex-direction: column;
  }

  .history-effort-editor {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
</style>
