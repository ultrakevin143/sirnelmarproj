<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { ExerciseSuggestion, LoggedSet, WorkoutExercise } from '@/types/workout';
import RestTimerPanel from './RestTimerPanel.vue';
import SessionDetailPanel from './SessionDetailPanel.vue';
import type { RestTimerState } from '@/composables/useRestTimer';
import { useTrainingPreferences } from '@/composables/useTrainingPreferences';
import { completedWorkingSets, scheduledWorkingSets, movementComplete } from '@/utils/setProgress';
const { massUnit, toDisplay, fromDisplay, formatLoad } = useTrainingPreferences();

const restDurationSeconds = defineModel<number>('restDurationSeconds', { required: true });
const sessionNotesDraft = defineModel<string>('sessionNotesDraft', { required: true });
const effortDraft = defineModel<number | null>('effortDraft', { required: true });

const props = defineProps<{
  exercises: WorkoutExercise[];
  sessionBusy: boolean;
  restTimerState: RestTimerState;
  restTimerLabel: string;
  soundEnabled: boolean;
  soundMessage: string;
  notesSavedValue: string;
  effortSavedValue: number | null;
  detailBusy: 'notes' | 'effort' | null;
  effortOptions: Array<{ label: string; value: number }>;
  suggestions?: Record<string, ExerciseSuggestion>;
  getExerciseImage: (slug: string) => string;
  draftFor: (exerciseId: number) => { weightKg: number | null; reps: number | null };
  draftForSet: (set: LoggedSet) => { weightKg: number | null; reps: number | null };
  setDraftChanged: (set: LoggedSet) => boolean;
}>();

const emit = defineEmits<{
  startTimer: [];
  pauseTimer: [];
  resumeTimer: [];
  resetTimer: [];
  toggleSound: [];
  testChime: [];
  saveNotes: [];
  saveEffort: [];
  removeExercise: [exerciseId: number];
  toggleSet: [exerciseId: number, set: LoggedSet, completed: boolean | null];
  toggleSetType: [exerciseId: number, set: LoggedSet];
  saveSet: [exerciseId: number, set: LoggedSet];
  deleteSet: [exerciseId: number, setId: number];
  logSet: [
    exerciseId: number,
    setType: 'working' | 'warmup',
    durationSeconds: number | null,
    distanceMeters: number | null,
  ];
  addMovement: [];
  openCalculator: [];
}>();

const selectedExerciseId = ref<number | null>(null);
const editingSets = reactive(new Set<number>());
const isComplete = movementComplete;
const currentExercise = computed(
  () =>
    props.exercises.find((item) => item.id === selectedExerciseId.value) ??
    props.exercises.find((item) => !isComplete(item)) ??
    props.exercises[0],
);
const visibleExercises = computed(() => (currentExercise.value ? [currentExercise.value] : []));
watch(
  () => currentExercise.value?.id,
  (id) => {
    if (id !== undefined) selectedExerciseId.value = id;
  },
  { immediate: true },
);
const previous = (item: WorkoutExercise) =>
  props.suggestions?.[item.exerciseSlug]?.last ?? props.suggestions?.[item.exerciseId]?.last;
function usePrevious(item: WorkoutExercise) {
  const last = previous(item);
  if (!last) return;
  Object.assign(props.draftFor(item.id), { weightKg: last.weightKg, reps: last.reps });
}
const suggestionFor = (item: WorkoutExercise) =>
  props.suggestions?.[item.exerciseSlug]?.suggestion ??
  props.suggestions?.[item.exerciseId]?.suggestion;
function useSuggestion(item: WorkoutExercise) {
  const suggestion = suggestionFor(item);
  if (suggestion)
    Object.assign(props.draftFor(item.id), {
      weightKg: suggestion.weightKg,
      reps: suggestion.reps,
    });
}
function cancelEdit(set: LoggedSet) {
  Object.assign(props.draftForSet(set), { weightKg: set.weightKg, reps: set.reps });
  editingSets.delete(set.id);
}
function askRemove(item: WorkoutExercise) {
  if (window.confirm(`Remove ${item.exerciseName} and its sets from this workout?`))
    emit('removeExercise', item.id);
}
function askDelete(item: WorkoutExercise, set: LoggedSet) {
  if (window.confirm(`Delete set ${set.setNumber} of ${item.exerciseName}?`))
    emit('deleteSet', item.id, set.id);
}

const metaDrafts = defineModel<
  Record<
    number,
    {
      setType: 'working' | 'warmup';
      showTimed: boolean;
      durationMinutes: number | null;
      durationSeconds: number | null;
      distanceMeters: number | null;
    }
  >
>('metaDrafts', { default: () => ({}) });

function getMeta(id: number) {
  metaDrafts.value[id] ??= {
    setType: 'working',
    showTimed: false,
    durationMinutes: null,
    durationSeconds: null,
    distanceMeters: null,
  };
  return metaDrafts.value[id];
}

function handleLogSet(id: number) {
  const m = getMeta(id);
  const totalSeconds =
    m.durationMinutes !== null || m.durationSeconds !== null
      ? (m.durationMinutes ?? 0) * 60 + (m.durationSeconds ?? 0)
      : null;
  const item = props.exercises.find((entry) => entry.id === id);
  const pending = item?.sets.find(
    (set) => !set.completed && (set.setType ?? 'working') === m.setType,
  );
  if (pending && !totalSeconds && !m.distanceMeters) {
    Object.assign(props.draftForSet(pending), props.draftFor(id));
    emit('toggleSet', id, pending, true);
  } else {
    emit('logSet', id, m.setType, totalSeconds, m.distanceMeters);
  }
}

// Only clear cardio fields after the server returns a newly logged set.
watch(
  () => props.exercises,
  (next, before) => {
    next.forEach((item) => {
      const old = before?.find((entry) => entry.id === item.id);
      if (old && item.sets.length > old.sets.length && metaDrafts.value[item.id]) {
        Object.assign(getMeta(item.id), {
          durationMinutes: null,
          durationSeconds: null,
          distanceMeters: null,
        });
      }
    });
  },
);

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s > 0 ? `${s}s` : ''}` : `${s}s`;
}
</script>

<template>
  <section class="active-workout">
    <RestTimerPanel
      class="workout-timer"
      v-model:rest-duration-seconds="restDurationSeconds"
      :rest-timer-state="restTimerState"
      :rest-timer-label="restTimerLabel"
      :sound-enabled="soundEnabled"
      :sound-message="soundMessage"
      @toggle-sound="emit('toggleSound')"
      @test-chime="emit('testChime')"
      @start="emit('startTimer')"
      @pause="emit('pauseTimer')"
      @resume="emit('resumeTimer')"
      @reset="emit('resetTimer')"
    />
    <div class="workout-stage">
      <label v-if="exercises.length" class="mobile-movement-picker">
        Movement
        <select v-model="selectedExerciseId" aria-label="Current movement">
          <option v-for="(item, index) in exercises" :key="item.id" :value="item.id">
            {{ index + 1 }} / {{ exercises.length }} · {{ item.exerciseName }}
          </option>
        </select>
      </label>
      <div v-if="exercises.length" class="workout-exercise-list">
        <article v-for="item in visibleExercises" :key="item.id" class="workout-exercise">
          <div class="workout-exercise-heading">
            <img
              v-if="!item.exerciseSlug.startsWith('custom-plan-')"
              :src="getExerciseImage(item.exerciseSlug)"
              alt=""
              class="exercise-thumbnail"
            />
            <span v-else class="custom-movement-mark" aria-hidden="true">{{
              item.exerciseName.slice(0, 1)
            }}</span>
            <div class="movement-title">
              <h2>{{ item.exerciseName }}</h2>
              <p>
                {{ completedWorkingSets(item) }} / {{ scheduledWorkingSets(item) }} working sets
                complete
              </p>
            </div>
            <q-btn
              flat
              round
              icon="more_horiz"
              :aria-label="`Options for ${item.exerciseName}`"
              :disable="sessionBusy"
            >
              <q-menu
                ><q-list>
                  <q-item clickable v-close-popup @click="emit('openCalculator')"
                    ><q-item-section>Plate calculator</q-item-section></q-item
                  >
                  <q-item clickable v-close-popup @click="askRemove(item)"
                    ><q-item-section>Remove movement</q-item-section></q-item
                  >
                </q-list></q-menu
              >
            </q-btn>
          </div>
          <div v-if="previous(item)" class="previous-performance">
            <span
              >Last session
              <strong
                >{{ formatLoad(previous(item)?.weightKg) }} ×
                {{ previous(item)?.reps }} reps</strong
              ></span
            >
            <button type="button" :disabled="sessionBusy" @click="usePrevious(item)">
              Use last set
            </button>
          </div>
          <div v-if="suggestionFor(item)" class="progression-suggestion">
            <p>{{ suggestionFor(item)?.message }}</p>
            <button type="button" :disabled="sessionBusy" @click="useSuggestion(item)">
              Use {{ formatLoad(suggestionFor(item)?.weightKg) }} ×
              {{ suggestionFor(item)?.reps }} reps
            </button>
          </div>
          <p v-if="isComplete(item)" class="movement-complete" role="status">
            Planned working sets complete. Choose your next movement, or log an extra set below.
          </p>
          <form class="set-input-section" @submit.prevent="handleLogSet(item.id)">
            <h3>Log your next set</h3>
            <div class="set-input-row">
              <q-input
                :model-value="toDisplay(draftFor(item.id).weightKg)"
                @update:model-value="draftFor(item.id).weightKg = fromDisplay($event)"
                outlined
                type="number"
                min="0"
                step="0.5"
                :label="`Weight (${massUnit})`"
                :disable="sessionBusy"
                :aria-label="`Weight in ${massUnit}`"
              />
              <q-input
                v-model.number="draftFor(item.id).reps"
                outlined
                type="number"
                min="1"
                step="1"
                label="Repetitions"
                :disable="sessionBusy"
                aria-label="Repetitions"
              />
              <q-btn
                type="submit"
                unelevated
                no-caps
                color="primary"
                label="Log set"
                class="log-set-btn"
                :loading="sessionBusy"
              />
            </div>
            <details class="set-options">
              <summary>Set type, duration &amp; distance</summary>
              <div class="type-segmented" aria-label="New set type">
                <button
                  type="button"
                  :class="{ active: getMeta(item.id).setType === 'working' }"
                  :aria-pressed="getMeta(item.id).setType === 'working'"
                  :disabled="sessionBusy"
                  @click="getMeta(item.id).setType = 'working'"
                >
                  Working set
                </button>
                <button
                  type="button"
                  :class="{ active: getMeta(item.id).setType === 'warmup' }"
                  :aria-pressed="getMeta(item.id).setType === 'warmup'"
                  :disabled="sessionBusy"
                  @click="getMeta(item.id).setType = 'warmup'"
                >
                  Warmup set
                </button>
              </div>
              <div class="timed-options-row">
                <q-input
                  v-model.number="getMeta(item.id).durationMinutes"
                  outlined
                  dense
                  type="number"
                  min="0"
                  label="Minutes"
                  :disable="sessionBusy"
                  aria-label="Duration minutes"
                />
                <q-input
                  v-model.number="getMeta(item.id).durationSeconds"
                  outlined
                  dense
                  type="number"
                  min="0"
                  max="59"
                  label="Seconds"
                  :disable="sessionBusy"
                  aria-label="Duration seconds"
                />
                <q-input
                  v-model.number="getMeta(item.id).distanceMeters"
                  outlined
                  dense
                  type="number"
                  min="0"
                  step="10"
                  label="Distance (m)"
                  :disable="sessionBusy"
                  aria-label="Distance meters"
                />
              </div>
            </details>
          </form>
          <div class="set-list">
            <div class="set-table-heading" aria-hidden="true">
              <span>Done</span><span>Set</span><span>Weight</span><span>Reps</span><span></span>
            </div>
            <div
              v-for="set in item.sets"
              :key="set.id"
              class="set-row"
              :class="{ 'set-complete': set.completed, 'set-editing': editingSets.has(set.id) }"
            >
              <q-checkbox
                :model-value="set.completed"
                :disable="sessionBusy"
                :aria-label="`${set.completed ? 'Undo' : 'Complete'} set ${set.setNumber} of ${item.exerciseName}`"
                @update:model-value="emit('toggleSet', item.id, set, $event)"
              />
              <div class="set-label-col">
                <span class="set-tag">{{ set.setNumber }}</span
                ><small>{{ set.setType === 'warmup' ? 'Warmup' : 'Working' }}</small>
              </div>
              <template v-if="editingSets.has(set.id)">
                <q-input
                  :model-value="toDisplay(draftForSet(set).weightKg)"
                  @update:model-value="draftForSet(set).weightKg = fromDisplay($event)"
                  outlined
                  dense
                  type="number"
                  min="0"
                  step="0.5"
                  :disable="sessionBusy"
                  :aria-label="`${item.exerciseName} set ${set.setNumber} weight in ${massUnit}`"
                />
                <q-input
                  v-model.number="draftForSet(set).reps"
                  outlined
                  dense
                  type="number"
                  min="1"
                  step="1"
                  :disable="sessionBusy"
                  :aria-label="`${item.exerciseName} set ${set.setNumber} repetitions`"
                />
              </template>
              <template v-else
                ><span class="set-value">{{ formatLoad(set.weightKg) }}</span
                ><span class="set-value">{{ set.reps ?? '—' }}</span></template
              >
              <q-btn
                flat
                round
                icon="more_horiz"
                :aria-label="`Options for set ${set.setNumber} of ${item.exerciseName}`"
                :disable="sessionBusy"
              >
                <q-menu
                  ><q-list>
                    <q-item clickable v-close-popup @click="editingSets.add(set.id)"
                      ><q-item-section>Edit weight / reps</q-item-section></q-item
                    >
                    <q-item clickable v-close-popup @click="emit('toggleSetType', item.id, set)"
                      ><q-item-section
                        >Mark as
                        {{ set.setType === 'warmup' ? 'working' : 'warmup' }}</q-item-section
                      ></q-item
                    >
                    <q-item clickable v-close-popup @click="askDelete(item, set)"
                      ><q-item-section>Delete set</q-item-section></q-item
                    >
                  </q-list></q-menu
                >
              </q-btn>
              <div v-if="set.durationSeconds || set.distanceMeters" class="cardio-tag">
                <span v-if="set.durationSeconds">{{ formatDuration(set.durationSeconds) }}</span
                ><span v-if="set.distanceMeters">{{ set.distanceMeters }} m</span>
              </div>
              <div v-if="editingSets.has(set.id)" class="set-edit-actions">
                <q-btn
                  flat
                  no-caps
                  label="Save changes"
                  :disable="sessionBusy || !setDraftChanged(set)"
                  @click="emit('saveSet', item.id, set)"
                />
                <q-btn
                  flat
                  no-caps
                  :label="setDraftChanged(set) ? 'Cancel' : 'Done'"
                  :disable="sessionBusy"
                  @click="cancelEdit(set)"
                />
              </div>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="state-panel empty-panel compact-empty">
        <strong>Add your first movement</strong>
        <p>Choose an exercise to start logging this session.</p>
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Choose exercise"
          @click="emit('addMovement')"
        />
      </div>
      <details class="session-notes-disclosure">
        <summary>Session notes &amp; effort <span>Optional</span></summary>
        <SessionDetailPanel
          :session-busy="sessionBusy"
          v-model:session-notes-draft="sessionNotesDraft"
          v-model:effort-draft="effortDraft"
          :notes-saved-value="notesSavedValue"
          :effort-saved-value="effortSavedValue"
          :detail-busy="detailBusy"
          :effort-options="effortOptions"
          @save-notes="emit('saveNotes')"
          @save-effort="emit('saveEffort')"
        />
      </details>
    </div>
    <aside class="workout-support" aria-label="Movement queue">
      <nav v-if="exercises.length" class="movement-queue" aria-label="Workout movements">
        <h2>
          Your movements <span>{{ exercises.length }}</span>
        </h2>
        <button
          v-for="(item, index) in exercises"
          :key="item.id"
          type="button"
          :class="{ selected: currentExercise?.id === item.id, completed: isComplete(item) }"
          :aria-current="currentExercise?.id === item.id ? 'step' : undefined"
          @click="selectedExerciseId = item.id"
        >
          <span class="queue-number"
            ><q-icon v-if="isComplete(item)" name="check" /><template v-else>{{
              index + 1
            }}</template></span
          >
          <span class="queue-copy"
            ><strong>{{ item.exerciseName }}</strong
            ><small
              >{{ completedWorkingSets(item) }} / {{ scheduledWorkingSets(item) }} working sets
              done</small
            ></span
          >
        </button>
      </nav>
      <q-btn
        outline
        no-caps
        icon="add"
        label="Add movement"
        class="add-movement-btn"
        @click="emit('addMovement')"
      />
    </aside>
  </section>
</template>

<style scoped>
.progression-suggestion {
  margin: 16px 0;
  padding-block: 12px;
  border-block: 1px solid var(--border-subtle);
  font-size: 14px;
  color: var(--text-secondary);
}
.progression-suggestion button {
  min-height: 44px;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  cursor: pointer;
  text-align: left;
  padding: 0 6px;
}
.progression-suggestion button:focus-visible {
  outline: 2px solid var(--accent-primary);
}
.active-workout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 272px;
  grid-template-rows: auto 1fr;
  gap: 24px;
  align-items: start;
  margin: 24px 0 40px;
}
.workout-support {
  grid-column: 2;
  grid-row: 2;
  display: grid;
  gap: 20px;
  min-width: 0;
}
.workout-stage {
  grid-column: 1;
  grid-row: 1 / span 2;
  min-width: 0;
}

.mobile-movement-picker {
  display: none;
}

.workout-timer {
  grid-column: 2;
  grid-row: 1;
  position: sticky;
  top: 88px;
  z-index: 2;
}
.workout-exercise {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
  background: var(--bg-surface);
}
.workout-exercise-heading {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 24px;
}
.workout-exercise-heading img,
.custom-movement-mark {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  object-fit: contain;
  border-radius: var(--radius-md);
}
.custom-movement-mark {
  display: grid;
  place-items: center;
  background: var(--accent-surface);
  color: var(--accent-primary);
  font-size: 24px;
  font-weight: 700;
}
.movement-title {
  flex: 1;
  min-width: 0;
}
.movement-title h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.movement-queue h2,
.set-input-section h3 {
  line-height: 1.35;
}
.set-list {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}
.movement-title p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}
.previous-performance {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 12px 0;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}
.previous-performance strong {
  color: var(--text-primary);
  margin-left: 8px;
}
.previous-performance button {
  min-height: 44px;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.movement-complete {
  color: var(--accent-primary);
  font-size: 14px;
}
.set-list {
  display: grid;
  gap: 8px;
}
.set-row,
.set-table-heading {
  display: grid;
  grid-template-columns: 44px 64px minmax(0, 1fr) minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
}
.set-table-heading {
  color: var(--text-secondary);
  font-size: 12px;
  padding: 0 8px 4px;
}
.set-row {
  padding: 8px;
  border-bottom: 1px solid var(--border-subtle);
  min-height: 64px;
}
.set-complete {
  background: var(--accent-surface);
  border-radius: var(--radius-sm);
  border-bottom-color: transparent;
}
.set-label-col {
  display: grid;
  gap: 4px;
}
.set-label-col small {
  color: var(--text-secondary);
  font-size: 11px;
}
.set-tag,
.set-value {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.set-value small {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 400;
}
.set-edit-actions,
.cardio-tag {
  grid-column: 2 / -1;
  display: flex;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}
.set-input-section {
  margin-top: 24px;
}
.set-input-section h3 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 700;
}
.set-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.log-set-btn {
  min-height: 56px;
  min-width: 100px;
}

.set-input-row :deep(input) {
  font-size: 16px;
}
.set-options {
  margin-top: 16px;
  color: var(--text-secondary);
}
summary {
  min-height: 44px;
  padding: 12px 0;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
summary:focus-visible,
button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 3px;
}
.type-segmented {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}
.type-segmented button {
  flex: 1;
  min-height: 44px;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.type-segmented button.active {
  background: var(--accent-surface);
  color: var(--accent-primary);
  border-color: var(--accent-border);
}
.timed-options-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}
.session-notes-disclosure {
  margin-top: 24px;
  border-top: 1px solid var(--border-subtle);
}
.session-notes-disclosure summary {
  color: var(--text-primary);
  padding: 16px 0;
}
.session-notes-disclosure summary span {
  margin-left: 8px;
  font-weight: 400;
  color: var(--text-secondary);
}
.movement-queue h2 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 700;
}
.movement-queue h2 span {
  color: var(--text-secondary);
  font-weight: 400;
  margin-left: 4px;
}
.movement-queue button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 12px 8px;
  text-align: left;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
}
.movement-queue button:hover {
  background: var(--bg-surface-hover);
}
.movement-queue button.selected {
  background: var(--accent-surface);
  color: var(--text-primary);
}
.queue-number {
  width: 24px;
  flex-shrink: 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
}
.completed .queue-number {
  color: var(--accent-primary);
}
.queue-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.queue-copy strong {
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.queue-copy small {
  color: var(--text-secondary);
  font-size: 12px;
}
.add-movement-btn {
  min-height: 44px;
}
.state-panel {
  padding: 40px 24px;
  text-align: center;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
}
.state-panel strong {
  font-size: 20px;
}
.state-panel p {
  color: var(--text-secondary);
  margin: 12px 0 24px;
}
@media (max-width: 1199px) {
  .active-workout {
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 16px;
  }
  .workout-exercise {
    padding: 20px;
  }
  .set-input-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .log-set-btn {
    grid-column: 1 / -1;
    min-height: 48px;
  }
}
@media (max-width: 767px) {
  .mobile-movement-picker {
    display: grid;
    gap: 8px;
    margin-bottom: 16px;
    color: var(--text-secondary);
    font-size: 12px;
  }
  .mobile-movement-picker select {
    min-height: 44px;
    width: 100%;
    padding: 0 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
    color: var(--text-primary);
    font: inherit;
    font-size: 14px;
  }
  .mobile-movement-picker select:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  .workout-support .movement-queue {
    display: none;
  }
  .active-workout {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 16px;
  }
  .workout-support {
    position: static;
    width: 100%;
    gap: 12px;
  }
  .workout-timer {
    width: 100%;
    position: sticky;
    top: 64px;
    z-index: 10;
  }
  .movement-queue {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .movement-queue h2 {
    display: none;
  }
  .movement-queue button {
    flex: 0 0 172px;
    min-height: 56px;
    padding: 8px;
    border: 1px solid var(--border-subtle);
  }
  .workout-support .add-movement-btn {
    justify-self: start;
  }
  .workout-stage {
    width: 100%;
  }
  .workout-exercise {
    padding: 16px;
  }
  .workout-exercise-heading {
    gap: 12px;
    margin-bottom: 16px;
  }
  .workout-exercise-heading img,
  .custom-movement-mark {
    width: 56px;
    height: 56px;
  }
  .movement-title h2 {
    font-size: 20px;
  }
  .set-row,
  .set-table-heading {
    grid-template-columns: 36px 48px minmax(0, 1fr) minmax(0, 1fr) 36px;
    gap: 4px;
    padding-left: 0;
    padding-right: 0;
  }
  .set-row :deep(.q-btn) {
    min-width: 36px;
    min-height: 44px;
    padding: 0;
  }
  .set-row :deep(.q-field__control) {
    padding: 0 6px;
  }
  .set-row :deep(input) {
    font-size: 16px;
  }
  .timed-options-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .timed-options-row > :last-child {
    grid-column: 1 / -1;
  }
}
</style>
