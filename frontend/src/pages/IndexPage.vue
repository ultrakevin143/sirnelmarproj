<template>
  <q-page class="workout-page">
    <div class="page-shell">
      <!-- TAB 1: WORKOUT (Training Mode) -->
      <section v-if="activeTab === 'workout'" class="tab-view workout-view">
        <div
          v-if="planLoading || !sessionReady"
          class="state-panel"
          role="status"
          aria-label="Loading your workout"
        >
          <q-skeleton height="94px" /><q-skeleton height="220px" class="q-mt-md" />
          <p>Loading your workout…</p>
        </div>
        <div v-else-if="planError || sessionError" class="state-panel" role="alert">
          <strong>Couldn’t load all of your workout</strong>
          <p>{{ sessionError || planError }}</p>
          <q-btn outline no-caps label="Try again" @click="retryWorkout" />
        </div>
        <p
          v-if="!preferences.onboardingComplete && !activeSession && sessionReady"
          class="setup-prompt"
        >
          <RouterLink to="/app/settings?setup=1">Set up your training preferences</RouterLink> ·
          Choose your goal, equipment and days.
        </p>
        <template v-if="!planLoading && sessionReady && !sessionError && !planError">
          <header v-if="!activeSession" class="page-heading">
            <div>
              <h2>
                {{
                  selectedDayIndex === localDayIndex()
                    ? 'Today’s workout'
                    : `${selectedDay?.dayName ?? 'Selected day'}’s workout`
                }}
              </h2>
              <p>{{ selectedDayDate }}</p>
              <button
                v-if="selectedDayIndex !== localDayIndex()"
                class="return-today"
                type="button"
                @click="selectedDayIndex = localDayIndex()"
              >
                Return to today
              </button>
              <p class="heading-copy">
                {{
                  selectedDay?.isRestDay
                    ? 'Scheduled recovery day. Rest and recover, or start a free workout session below.'
                    : `${selectedDay?.exercises.length || 0} planned movement${selectedDay?.exercises.length === 1 ? '' : 's'} · ${plannedSetCount} working sets scheduled`
                }}
              </p>
            </div>
            <div class="heading-badges-row">
              <button
                type="button"
                class="beginner-guide-toggle-btn"
                :class="{ active: showBeginnerTips }"
                @click="showBeginnerTips = !showBeginnerTips"
              >
                {{ showBeginnerTips ? 'Hide guide' : 'Quick start guide' }}
              </button>
            </div>
          </header>

          <SessionBar
            v-model:session-name="sessionName"
            :active-session="activeSession"
            :plan="plan"
            :selected-day="selectedDay"
            :completed-set-count="completedSetCount"
            :scheduled-set-count="scheduledSetCount"
            :session-busy="sessionBusy"
            :session-ready="sessionReady"
            :plan-loading="planLoading"
            @start="startSession"
            @finish="finishReviewOpen = true"
          />

          <!-- Beginner Lifter Guide Banner (Clear, friendly, non-confusing) -->
          <transition name="fade">
            <div v-if="showBeginnerTips && !activeSession" class="beginner-banner">
              <div class="banner-top">
                <div class="banner-title-group">
                  <span class="banner-badge">🌱 QUICK START GUIDE</span>
                  <h4>New to Lifting? Follow These 3 Easy Steps</h4>
                </div>
                <button
                  type="button"
                  class="banner-close"
                  title="Dismiss guide"
                  @click="showBeginnerTips = false"
                >
                  ✕
                </button>
              </div>
              <div class="beginner-steps-cards">
                <div class="step-card">
                  <span class="step-number">01</span>
                  <div>
                    <strong>Check Today's Movements</strong>
                    <p>
                      Review the scheduled exercises below. Tap any movement to see animated 3-frame
                      form cues and muscle guides.
                    </p>
                  </div>
                </div>
                <div class="step-card">
                  <span class="step-number">02</span>
                  <div>
                    <strong>Start & Log Sets</strong>
                    <p>
                      Choose "Start workout" above. Enter your weight and completed reps, then
                      choose "Log set".
                    </p>
                  </div>
                </div>
                <div class="step-card">
                  <span class="step-number">03</span>
                  <div>
                    <strong>Rest With The Timer</strong>
                    <p>
                      Rest 60–90 seconds between sets. The live audio-visual timer alerts you when
                      it's time for set 2.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </transition>

          <!-- Active Workout List when session is running -->
          <ActiveWorkoutList
            v-if="activeSession"
            :suggestions="previousPerformances"
            v-model:rest-duration-seconds="restDurationSeconds"
            v-model:session-notes-draft="sessionNotesDraft"
            v-model:effort-draft="effortDraft"
            v-model:meta-drafts="metaDrafts"
            :exercises="activeSession.exercises"
            :session-busy="sessionBusy"
            :rest-timer-state="restTimerState"
            :rest-timer-label="restTimerLabel"
            :sound-enabled="soundEnabled"
            :sound-message="soundMessage"
            @toggle-sound="toggleSound"
            @test-chime="testChime"
            :notes-saved-value="activeSession.notes ?? ''"
            :effort-saved-value="activeSession.perceivedEffort ?? null"
            :detail-busy="detailBusy"
            :effort-options="effortOptions"
            :get-exercise-image="getExerciseImage"
            :draft-for="draftFor"
            :draft-for-set="draftForSet"
            :set-draft-changed="setDraftChanged"
            @start-timer="startRestTimer"
            @pause-timer="pauseRestTimer"
            @resume-timer="resumeRestTimer"
            @reset-timer="resetRestTimer"
            @save-notes="saveActiveNotes"
            @save-effort="saveActiveEffort"
            @remove-exercise="removeExercise"
            @toggle-set="toggleSet"
            @toggle-set-type="toggleSetType"
            @save-set="saveSet"
            @delete-set="deleteSet"
            @log-set="logSet"
            @add-movement="planLibraryOpen = true"
            @open-calculator="plateCalculatorOpen = true"
          />

          <p v-if="activeSession" class="draft-status" role="status">
            {{
              draftStorageFailed
                ? 'Device storage unavailable. Keep this tab open until your changes are saved.'
                : hasUnsavedChanges
                  ? 'Unsaved changes · draft saved on this device'
                  : 'Your logged sets are saved'
            }}<span v-if="!online">
              · Offline. Keep your entries here and retry when connected.</span
            >
          </p>
          <!-- Today's planned exercise preview cards when idle -->
          <div
            v-else-if="selectedDay && selectedDay.exercises.length && !selectedDay.isRestDay"
            class="today-lineup-panel"
          >
            <div class="lineup-header">
              <div>
                <p class="eyebrow">SESSION PREVIEW</p>
                <h3>Scheduled Movements</h3>
              </div>
              <RouterLink :to="{ path: '/app', query: { tab: 'plan' } }" class="lineup-plan-link">
                Edit in Weekly Plan →
              </RouterLink>
            </div>
            <div class="lineup-grid">
              <button
                v-for="item in selectedDay.exercises"
                :key="item.id"
                class="lineup-card"
                type="button"
                @click="openExerciseFromPlanned(item)"
              >
                <img
                  v-if="item.exerciseSlug"
                  :src="guideAssetUrl(item.exerciseSlug, 1)"
                  :alt="item.exerciseName"
                  class="lineup-img"
                  loading="lazy"
                />
                <div v-else class="custom-movement-mark mini">
                  {{ item.exerciseName.slice(0, 1) }}
                </div>
                <div class="lineup-details">
                  <h4>{{ item.exerciseName }}</h4>
                  <p>{{ item.targetMuscle }}</p>
                  <div class="lineup-target">
                    <span class="tabular-nums">{{ item.sets }} sets × {{ item.reps }} reps</span>
                    <span class="lineup-kg tabular-nums">{{ formatLoad(item.weightKg) }}</span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <!-- Quick state helper when no movements planned or rest day -->
          <div v-else-if="!activeSession" class="today-empty-helper">
            <div class="helper-content">
              <q-icon name="event_note" size="28px" class="helper-icon" />
              <div>
                <h4>
                  {{ selectedDay?.isRestDay ? 'Recovery Day' : 'No Movements Scheduled For Today' }}
                </h4>
                <p>
                  {{
                    selectedDay?.isRestDay
                      ? 'Take time to recover, sleep well, and hydrate. You can also start a free workout session above.'
                      : 'Schedule movements for today in your weekly plan or start a free workout session above.'
                  }}
                </p>
              </div>
            </div>
            <RouterLink :to="{ path: '/app', query: { tab: 'plan' } }" class="helper-link">
              Open Weekly Plan →
            </RouterLink>
          </div>
        </template>
      </section>

      <!-- TAB 2: PLAN (Weekly Plan & Schedule) -->
      <section v-else-if="activeTab === 'plan'" class="tab-view plan-view">
        <WeeklyPlanSection
          :plan="plan"
          :selected-day="selectedDay"
          :selected-day-index="selectedDayIndex"
          :plan-loading="planLoading"
          :plan-busy="planBusy"
          :plan-error="planError"
          :planned-set-count="plannedSetCount"
          :training-day-count="trainingDayCount"
          :completed-training-days="completedTrainingDays"
          :weekly-split-summary="weeklySplitSummary"
          :day-status="dayStatus"
          :guide-asset-url="guideAssetUrl"
          @update:selected-day-index="selectedDayIndex = $event"
          @export-plan="exportPlan"
          @import-plan="openImportPicker"
          @reset-plan="resetPlanOpen = true"
          @retry-load="loadPlan"
          @edit-day="openDayEditor"
          @add-movement="openLibraryForPlan"
          @move-exercise="movePlannedExercise"
          @edit-prescription="openPrescriptionEditor"
          @remove-exercise="askRemovePlannedExercise"
        >
          <template #import-input>
            <input
              ref="importInput"
              class="visually-hidden"
              type="file"
              accept="application/json,.json"
              aria-hidden="true"
              tabindex="-1"
              @change="readImportFile"
            />
          </template>
        </WeeklyPlanSection>
      </section>

      <!-- TAB 3: LIBRARY (Movement Directory) -->
      <section v-else-if="activeTab === 'library'" class="tab-view library-view">
        <header class="page-heading">
          <div>
            <p class="eyebrow">MOVEMENT DIRECTORY</p>
            <h2>Exercise Library</h2>
            <p class="heading-copy">
              {{ illustratedExerciseCount }} illustrated exercises with form guides ·
              {{ customExerciseCount }} custom
            </p>
          </div>
          <q-btn
            unelevated
            no-caps
            color="primary"
            icon="add"
            label="Create Custom"
            @click="chooseCustomMode"
          />
        </header>

        <!-- Search & Filter Controls -->
        <div class="library-filter-bar">
          <q-input
            v-model="search"
            outlined
            dense
            clearable
            placeholder="Search exercises by name..."
            label="Search exercises"
            aria-label="Search exercises"
            class="library-search-input"
          >
            <template #prepend>
              <q-icon name="search" />
            </template>
          </q-input>

          <div class="muscle-chip-group">
            <button
              v-for="muscle in muscleFilters"
              :key="muscle"
              class="muscle-filter-chip"
              :class="{ active: selectedMuscle === muscle }"
              :aria-pressed="selectedMuscle === muscle"
              @click="selectedMuscle = muscle"
            >
              {{ muscle }}
            </button>
          </div>
        </div>

        <div class="library-extra-filters">
          <q-select
            v-model="selectedEquipment"
            :options="equipmentOptions"
            clearable
            outlined
            dense
            label="Equipment"
          /><q-select
            v-model="libraryScope"
            :options="[
              { label: 'All exercises', value: 'all' },
              { label: 'Favorites', value: 'favorites' },
              { label: 'Recently used', value: 'recent' },
            ]"
            emit-value
            map-options
            outlined
            dense
            label="Show"
          />
        </div>
        <!-- Exercise Grid -->
        <div v-if="paginatedExercises.length" class="catalog-grid">
          <div v-for="item in paginatedExercises" :key="item.id" class="catalog-card">
            <button
              type="button"
              class="catalog-open"
              :aria-label="`View ${item.name} guide`"
              @click="openExercise(item)"
            >
              <img
                v-if="item.source === 'catalog'"
                :src="guideAssetUrl(item.slug, 1)"
                :alt="item.name"
                class="catalog-thumb"
                loading="lazy"
              />
              <div v-else class="custom-movement-mark">
                {{ item.name.slice(0, 1) }}
              </div>
              <div class="catalog-card-info">
                <h4>{{ item.name }}</h4>
                <div class="catalog-badges">
                  <span class="target-badge">{{ item.primaryMuscle }}</span>
                  <span class="equip-badge">{{ item.equipment }}</span>
                </div>
              </div>
            </button>
            <button
              type="button"
              class="favorite-toggle"
              :disabled="favoriteBusy"
              :aria-label="`${favorites.includes(exerciseKey(item)) ? 'Unfavorite' : 'Favorite'} ${item.name}`"
              :aria-pressed="favorites.includes(exerciseKey(item))"
              @click="toggleFavorite(item)"
            >
              <q-icon :name="favorites.includes(exerciseKey(item)) ? 'star' : 'star_outline'" />
            </button>
          </div>
        </div>
        <div v-else class="catalog-empty">
          <p>No exercises match your search or filters.</p>
          <q-btn
            flat
            no-caps
            label="Clear filters"
            @click="
              search = '';
              selectedMuscle = 'All';
            "
          />
        </div>

        <!-- Pagination -->
        <div v-if="exercisePageCount > 1" class="catalog-pagination">
          <q-pagination
            v-model="exercisePage"
            :max="exercisePageCount"
            :max-pages="6"
            direction-links
            flat
            color="primary"
          />
        </div>
      </section>
    </div>

    <ExerciseDetailDialog
      v-model="detailOpen"
      v-model:selected-frame="selectedFrame"
      :selected-exercise="selectedExercise"
      :selected-exercise-image="selectedExerciseImage"
      :selected-day="selectedDay"
      :active-session="Boolean(activeSession)"
      @add-to-workout="addExercise"
      @add-to-plan="openCatalogAdd"
    />

    <DayEditorDialog
      v-model="dayEditorOpen"
      v-model:title="dayDraft.title"
      v-model:focus="dayDraft.focus"
      v-model:is-rest-day="dayDraft.isRestDay"
      :selected-day="selectedDay"
      :plan-busy="planBusy"
      @save="saveDay"
    />

    <PrescriptionDialog
      v-model="prescriptionOpen"
      v-model:sets="prescriptionDraft.sets"
      v-model:reps="prescriptionDraft.reps"
      v-model:weight-kg="prescriptionDraft.weightKg"
      :editing-plan-exercise="editingPlanExercise"
      :plan-busy="planBusy"
      @save="savePrescription"
    />

    <ConfirmRemoveDialog
      v-model="removePlanExerciseOpen"
      :selected-day="selectedDay"
      :pending-plan-removal="pendingPlanRemoval"
      :plan-busy="planBusy"
      @confirm="removePlannedExercise"
    />

    <ExerciseLibraryDialog
      v-model="planLibraryOpen"
      v-model:search="search"
      v-model:selected-muscle="selectedMuscle"
      v-model:selected-equipment="selectedEquipment"
      v-model:exercise-page="exercisePage"
      v-model:custom-mode="customMode"
      v-model:custom-name="customName"
      v-model:custom-target="customTarget"
      v-model:custom-equipment="customEquipment"
      v-model:custom-cues="customCues"
      v-model:custom-image-data-url="customImageDataUrl"
      v-model:add-sets="addDraft.sets"
      v-model:add-reps="addDraft.reps"
      v-model:add-weight-kg="addDraft.weightKg"
      :selected-day="selectedDay"
      :illustrated-exercise-count="illustratedExerciseCount"
      :custom-exercise-count="customExerciseCount"
      :muscle-filters="muscleFilters"
      :equipment-options="equipmentOptions"
      :selected-to-add="selectedToAdd"
      :can-add-catalog="canAddCatalog"
      :can-create-custom="canCreateCustom"
      :editing-custom-id="editingCustomId"
      :plan-busy="planBusy"
      :session-busy="sessionBusy"
      :active-session="Boolean(activeSession)"
      :loading="loading"
      :error-message="errorMessage"
      :filtered-exercises="filteredExercises"
      :paginated-exercises="paginatedExercises"
      :exercise-page-count="exercisePageCount"
      :exercise-range-start="exerciseRangeStart"
      :exercise-range-end="exerciseRangeEnd"
      :format-exercise-type="formatExerciseType"
      @choose-custom-mode="chooseCustomMode"
      @save-catalog="saveCatalogExerciseToPlan"
      @add-custom="addCustomExercise"
      @read-custom-image="readCustomImage"
      @retry-load="loadExercises"
      @open-exercise="openExercise"
      @open-catalog-add="openCatalogAdd"
      @add-to-session="addExercise"
      @edit-custom="editCustomExercise"
      @archive-custom="archiveCustomExercise"
    />

    <ImportPreviewDialog
      v-model="importPreviewOpen"
      :import-preview="importPreview"
      :plan-busy="planBusy"
      @confirm="confirmPlanImport"
    />

    <ResetPlanDialog v-model="resetPlanOpen" :plan-busy="planBusy" @confirm="resetWeeklyPlan" />
    <PlateCalculatorDialog v-model="plateCalculatorOpen" />

    <q-dialog v-model="finishReviewOpen" :persistent="sessionBusy"
      ><q-card class="finish-review"
        ><q-card-section
          ><p class="eyebrow">BEFORE YOU FINISH</p>
          <h2>Review your workout</h2>
          <p>
            {{ completedSetCount }} of {{ scheduledSetCount }} sets complete ·
            {{ activeSession?.exercises.length }} movements
          </p>
          <p v-if="completedSetCount < scheduledSetCount">
            You can finish early. Incomplete sets stay marked as planned in history.
          </p>
          <p>Your edited sets, notes and effort will be saved when you finish.</p>
          <p v-if="hasUnloggedInputs">
            Inputs for a new set haven’t been logged. Return to log them, or explicitly leave them
            out.
          </p>
          <q-checkbox
            v-if="hasUnloggedInputs"
            v-model="discardUnlogged"
            label="Finish without my unlogged inputs"
          />
          <p v-if="finishError" role="alert">{{ finishError }}</p></q-card-section
        ><q-card-actions align="right"
          ><q-btn flat no-caps label="Keep training" :disable="sessionBusy" v-close-popup /><q-btn
            color="primary"
            no-caps
            label="Save changes & finish"
            :loading="sessionBusy"
            :disable="!!detailBusy || (hasUnloggedInputs && !discardUnlogged)"
            @click="finishSession" /></q-card-actions></q-card
    ></q-dialog>
    <q-dialog v-model="recapOpen"
      ><q-card class="finish-review"
        ><q-card-section
          ><p class="eyebrow">WORKOUT SAVED</p>
          <h2>{{ finishedWorkout?.name }}</h2>
          <p>
            {{ finishedSetCount }} completed sets ·
            {{ finishedWorkout?.exercises.length }} movements · {{ finishedMinutes }} minutes
          </p>
          <p>Your session is ready to review in history.</p></q-card-section
        ><q-card-actions align="right"
          ><q-btn flat no-caps label="Done" v-close-popup /><q-btn
            color="primary"
            no-caps
            label="View workout"
            :to="`/app/history?workout=${finishedWorkout?.id}`"
            v-close-popup /></q-card-actions></q-card
    ></q-dialog>
    <q-banner v-if="toastMessage" class="app-toast" rounded role="status">{{
      toastMessage
    }}</q-banner>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { getAssetUrl, type Exercise, type ExerciseType } from '@bryllim/workout-guide';
import { useRestTimer } from '@/composables/useRestTimer';
import { buildPreviousPerformances } from '@/utils/workoutLayout';
import { completedWorkingSets, scheduledWorkingSets } from '@/utils/setProgress';
import { localDayIndex, progressionFor } from '@/utils/trainingProgression';
import { readWorkoutDraft, writeWorkoutDraft } from '@/utils/workoutDraft';
import { useTrainingPreferences } from '@/composables/useTrainingPreferences';
import type {
  CatalogExercise,
  LoggedSet,
  PlanImportPreview,
  PlannedExercise,
  WeeklyPlan,
  WorkoutSession,
} from '@/types/workout';
import WeeklyPlanSection from '@/components/training/WeeklyPlanSection.vue';
import SessionBar from '@/components/training/SessionBar.vue';
import ActiveWorkoutList from '@/components/training/ActiveWorkoutList.vue';
import ExerciseDetailDialog from '@/components/training/ExerciseDetailDialog.vue';
import DayEditorDialog from '@/components/training/DayEditorDialog.vue';
import PrescriptionDialog from '@/components/training/PrescriptionDialog.vue';
import ConfirmRemoveDialog from '@/components/training/ConfirmRemoveDialog.vue';
import ExerciseLibraryDialog from '@/components/training/ExerciseLibraryDialog.vue';
import ImportPreviewDialog from '@/components/training/ImportPreviewDialog.vue';
import ResetPlanDialog from '@/components/training/ResetPlanDialog.vue';
import PlateCalculatorDialog from '@/components/training/PlateCalculatorDialog.vue';
import { useAuth } from '@/composables/useAuth';

const { isBeginner, currentUser } = useAuth();
const { preferences, formatLoad } = useTrainingPreferences();
const guideKey = () => `liftup-guide-dismissed:${currentUser?.value?.id ?? 'session'}`;
const showBeginnerTips = ref(
  (() => {
    try {
      return isBeginner.value && localStorage.getItem(guideKey()) !== '1';
    } catch {
      return isBeginner.value;
    }
  })(),
);
watch(showBeginnerTips, (value) => {
  try {
    localStorage.setItem(guideKey(), value ? '0' : '1');
  } catch {
    /* Optional preference storage. */
  }
});

const route = useRoute();
const activeTab = computed(() => {
  const t = route.query.tab as string;
  if (t === 'plan') return 'plan';
  if (t === 'library') return 'library';
  return 'workout';
});

const exercises = ref<CatalogExercise[]>([]);
const recentWorkouts = ref<WorkoutSession[]>([]);
const activeSession = ref<WorkoutSession | null>(null);
const previousPerformances = computed(() => {
  const result = buildPreviousPerformances(recentWorkouts.value);
  for (const value of Object.values(result)) {
    const workout = recentWorkouts.value.find((w) => w.id === value.last?.workoutId);
    const exercise = workout?.exercises.find((e) => e.exerciseId === value.exerciseId);
    if (workout && exercise)
      value.suggestion = progressionFor(exercise, workout, preferences.value);
  }
  return result;
});
const plan = ref<WeeklyPlan | null>(null);
const selectedDayIndex = ref(localDayIndex());
const selectedDayDate = computed(() => {
  const date = getLocalWeekStart();
  date.setDate(date.getDate() + selectedDayIndex.value);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
});
const planLoading = ref(true);
const planBusy = ref(false);
const resetPlanOpen = ref(false);
const plateCalculatorOpen = ref(false);
const planError = ref('');
const dayEditorOpen = ref(false);
const dayDraft = reactive({ title: '', focus: '', isRestDay: false });
const prescriptionOpen = ref(false);
const editingPlanExercise = ref<PlannedExercise | null>(null);
const prescriptionDraft = reactive({ sets: 3, reps: 10, weightKg: 0 });
const removePlanExerciseOpen = ref(false);
const pendingPlanRemoval = ref<PlannedExercise | null>(null);
const planLibraryOpen = ref(false);
const customMode = ref(false);
const selectedToAdd = ref<CatalogExercise | null>(null);
const customName = ref('');
const customTarget = ref('');
const customEquipment = ref('Bodyweight');
const customCues = ref('');
const customImageDataUrl = ref('');
const editingCustomId = ref<number | null>(null);
const selectedEquipment = ref<string | null>(null);
const addDraft = reactive({ sets: 3, reps: 10, weightKg: 0 });
const importInput = ref<HTMLInputElement | null>(null);
const importPreviewOpen = ref(false);
const importPreview = ref<PlanImportPreview | null>(null);
const importDocument = ref<Record<string, unknown> | null>(null);
const loading = ref(true);
const sessionBusy = ref(false);
const sessionReady = ref(false);
const errorMessage = ref('');
const sessionError = ref('');
const favorites = ref<string[]>([]);
const libraryScope = ref('all');
const favoriteBusy = ref(false);
const finishReviewOpen = ref(false);
const finishError = ref('');
const recapOpen = ref(false);
const discardUnlogged = ref(false);
const finishedWorkout = ref<WorkoutSession | null>(null);
const finishedSetCount = computed(
  () =>
    finishedWorkout.value?.exercises.reduce(
      (n, e) => n + e.sets.filter((s) => s.completed).length,
      0,
    ) ?? 0,
);
const finishedMinutes = computed(() =>
  finishedWorkout.value
    ? Math.max(
        1,
        Math.round(
          (Date.parse(finishedWorkout.value.completedAt!) -
            Date.parse(finishedWorkout.value.startedAt)) /
            60000,
        ),
      )
    : 0,
);
const online = ref(typeof navigator === 'undefined' || navigator.onLine);
const draftStorageFailed = ref(false);
const metaDrafts = ref<
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
>({});
const search = ref('');
const selectedMuscle = ref('All');
const exercisePage = ref(1);
const exercisesPerPage = 24;
const sessionName = ref('Strength session');
const selectedExercise = ref<CatalogExercise | null>(null);
const selectedFrame = ref<1 | 2 | 3>(1);
const detailOpen = ref(false);

function openExerciseFromPlanned(planned: PlannedExercise) {
  const catalogItem = exercises.value.find(
    (e) =>
      (planned.catalogExerciseId && String(e.id) === String(planned.catalogExerciseId)) ||
      e.slug === planned.exerciseSlug,
  );
  if (catalogItem) {
    openExercise(catalogItem);
  }
}
const toastMessage = ref('');
const sessionNotesDraft = ref('');
const effortDraft = ref<number | null>(null);
const effortOptions = Array.from({ length: 10 }, (_, index) => ({
  label: `${index + 1} / 10`,
  value: index + 1,
}));
const detailBusy = ref<'notes' | 'effort' | null>(null);
const setDrafts = reactive<Record<number, { weightKg: number | null; reps: number | null }>>({});
const loggedSetDrafts = reactive<Record<number, { weightKg: number | null; reps: number | null }>>(
  {},
);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let weeklyRolloverTimeout: number | undefined;
let lastCheckedWeekStart = '';
const newDraftBaselines = reactive<Record<number, string>>({});
let draftsReady = false;
const draftKey = () =>
  currentUser?.value?.id && activeSession.value
    ? `liftup-draft:${currentUser.value.id}:${activeSession.value.id}`
    : null;
const hasUnloggedInputs = computed(
  () =>
    !!activeSession.value &&
    activeSession.value.exercises.some(
      (e) =>
        (newDraftBaselines[e.id] && JSON.stringify(setDrafts[e.id]) !== newDraftBaselines[e.id]) ||
        metaDrafts.value[e.id]?.durationMinutes ||
        metaDrafts.value[e.id]?.durationSeconds ||
        metaDrafts.value[e.id]?.distanceMeters,
    ),
);
const hasUnsavedChanges = computed(
  () =>
    !!activeSession.value &&
    (hasUnloggedInputs.value ||
      sessionNotesDraft.value !== activeSession.value.notes ||
      effortDraft.value !== activeSession.value.perceivedEffort ||
      activeSession.value.exercises.some((e) => e.sets.some((set) => setDraftChanged(set)))),
);
function persistDrafts() {
  const key = draftKey();
  if (!key || !draftsReady) return;
  draftStorageFailed.value = !writeWorkoutDraft(key, {
    notes: sessionNotesDraft.value,
    effort: effortDraft.value,
    sets: setDrafts,
    edits: loggedSetDrafts,
    meta: metaDrafts.value,
    baselines: newDraftBaselines,
  });
}
function restoreDrafts() {
  const key = draftKey();
  const draft = key && readWorkoutDraft(key);
  if (draft && activeSession.value) {
    const valid = (value: unknown): value is { weightKg: number | null; reps: number | null } => {
      if (!value || typeof value !== 'object') return false;
      const v = value as { weightKg: unknown; reps: unknown };
      return (
        (v.weightKg === null ||
          (typeof v.weightKg === 'number' &&
            Number.isFinite(v.weightKg) &&
            v.weightKg >= 0 &&
            v.weightKg <= 1000)) &&
        (v.reps === null ||
          (typeof v.reps === 'number' && Number.isInteger(v.reps) && v.reps >= 1 && v.reps <= 1000))
      );
    };
    sessionNotesDraft.value = draft.notes;
    effortDraft.value = draft.effort;
    for (const e of activeSession.value.exercises) {
      if (valid(draft.sets[e.id])) {
        Object.assign(draftFor(e.id), draft.sets[e.id]);
        try {
          const baseline = JSON.parse(draft.baselines?.[e.id] ?? 'null');
          if (valid(baseline)) newDraftBaselines[e.id] = JSON.stringify(baseline);
        } catch {
          /* Use server baseline. */
        }
      }
      for (const set of e.sets)
        if (valid(draft.edits[set.id])) Object.assign(draftForSet(set), draft.edits[set.id]);
      const meta = draft.meta[e.id];
      if (
        meta &&
        ['durationMinutes', 'durationSeconds', 'distanceMeters'].every(
          (k) =>
            meta[k] === null || (Number.isFinite(meta[k]) && meta[k] >= 0 && meta[k] <= 100000),
        )
      )
        metaDrafts.value[e.id] = {
          ...meta,
          setType: meta.setType === 'warmup' ? 'warmup' : 'working',
        };
    }
    notify('Restored your device draft. Review changes before saving.');
  }
  draftsReady = true;
}
watch([sessionNotesDraft, effortDraft, setDrafts, loggedSetDrafts, metaDrafts], persistDrafts, {
  deep: true,
});
function connectionChanged() {
  online.value = navigator.onLine;
}
function beforeLeave(event: BeforeUnloadEvent) {
  persistDrafts();
  if (hasUnsavedChanges.value && draftStorageFailed.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
function exerciseKey(item: CatalogExercise) {
  return item.source === 'custom' ? `custom-${item.customExerciseId}` : item.id;
}
async function loadFavorites() {
  try {
    favorites.value =
      (await axios.get<{ favorites: string[] }>('/api/v1/favorites')).data.favorites ?? [];
  } catch {
    notify('Favorites are unavailable. Your exercises are still available.');
  }
}
async function toggleFavorite(item: CatalogExercise) {
  if (favoriteBusy.value) return;
  favoriteBusy.value = true;
  const key = exerciseKey(item);
  try {
    const next = !favorites.value.includes(key);
    await axios.put(`/api/v1/favorites/${encodeURIComponent(key)}`, { favorite: next });
    favorites.value = next ? [...favorites.value, key] : favorites.value.filter((k) => k !== key);
  } catch (e) {
    notify(getErrorMessage(e, 'Could not update favorites. Try again.'));
  } finally {
    favoriteBusy.value = false;
  }
}
async function retryWorkout() {
  await Promise.all([loadPlan(), loadActiveSession(), loadRecentWorkouts()]);
}

const {
  soundEnabled,
  soundMessage,
  toggleSound,
  testChime,
  restDurationSeconds,
  restTimerState,
  restTimerLabel,
  startRestTimer,
  pauseRestTimer,
  resumeRestTimer,
  resetRestTimer,
  restoreRestTimer,
  clearRestTimerStorage,
} = useRestTimer({
  getActiveWorkoutId: () => activeSession.value?.id,
  onInvalidDuration: (message) => notify(message),
  onVisible: () => {
    void loadActiveSession(true);
  },
});

const muscleFilters = ['All', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'];
const equipmentOptions = computed(() =>
  [...new Set(exercises.value.map((item) => item.equipment))].sort(),
);
const illustratedExerciseCount = computed(
  () => exercises.value.filter((item) => item.source === 'catalog').length,
);
const customExerciseCount = computed(
  () => exercises.value.filter((item) => item.source === 'custom').length,
);
const selectedDay = computed(() => plan.value?.days[selectedDayIndex.value] ?? null);
const plannedSetCount = computed(
  () => selectedDay.value?.exercises.reduce((total, item) => total + item.sets, 0) ?? 0,
);
const trainingDayCount = computed(
  () => plan.value?.days.filter((day) => !day.isRestDay).length ?? 0,
);
const weeklySplitSummary = computed(() => {
  const groups = new Map<string, { label: string; days: string[] }>();
  for (const day of plan.value?.days ?? []) {
    const label = day.isRestDay ? 'Rest' : day.title;
    const group = groups.get(label) ?? { label, days: [] };
    group.days.push(day.shortDay);
    groups.set(label, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    days: group.days.join(' / '),
  }));
});
const completedTrainingDays = computed(
  () =>
    plan.value?.days.filter((day) => !day.isRestDay && dayStatus(day.dayIndex) === 'Done').length ??
    0,
);
const canAddCatalog = computed(() =>
  Boolean(
    selectedToAdd.value &&
    Number.isInteger(addDraft.sets) &&
    addDraft.sets >= 1 &&
    addDraft.sets <= 20 &&
    Number.isInteger(addDraft.reps) &&
    addDraft.reps >= 1 &&
    addDraft.reps <= 1000 &&
    Number.isFinite(addDraft.weightKg) &&
    addDraft.weightKg >= 0 &&
    addDraft.weightKg <= 1000,
  ),
);
const canCreateCustom = computed(() =>
  Boolean(customName.value.trim() && customTarget.value.trim() && customEquipment.value.trim()),
);
const scheduledSetCount = computed(
  () =>
    activeSession.value?.exercises.reduce((count, item) => count + scheduledWorkingSets(item), 0) ??
    0,
);
const completedSetCount = computed(
  () =>
    activeSession.value?.exercises.reduce((count, item) => count + completedWorkingSets(item), 0) ??
    0,
);
const filteredExercises = computed(() => {
  const muscleMap: Record<string, string[]> = {
    Arms: ['Biceps', 'Triceps', 'Forearms'],
    Legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Legs'],
  };
  const muscle = muscleMap[selectedMuscle.value] ?? selectedMuscle.value;
  return exercises.value.filter((exercise) => {
    const matchesSearch =
      !search.value ||
      `${exercise.name} ${exercise.primaryMuscle} ${exercise.equipment} ${exercise.secondaryMuscles.join(' ')}`
        .toLowerCase()
        .includes(search.value.toLowerCase());
    const matchesMuscle =
      selectedMuscle.value === 'All' ||
      (selectedMuscle.value === 'Custom' && exercise.source === 'custom') ||
      (Array.isArray(muscle)
        ? muscle.includes(exercise.primaryMuscle)
        : exercise.primaryMuscle === muscle);
    const matchesEquipment =
      !selectedEquipment.value || exercise.equipment === selectedEquipment.value;
    const matchesScope =
      libraryScope.value === 'all' ||
      (libraryScope.value === 'favorites'
        ? favorites.value.includes(exerciseKey(exercise))
        : recentWorkouts.value.some((w) =>
            w.exercises.some(
              (e) => e.exerciseId === exercise.id || e.exerciseSlug === exercise.slug,
            ),
          ));
    return matchesSearch && matchesMuscle && matchesEquipment && matchesScope;
  });
});
const exercisePageCount = computed(() =>
  Math.max(1, Math.ceil(filteredExercises.value.length / exercisesPerPage)),
);
const paginatedExercises = computed(() => {
  const start = (exercisePage.value - 1) * exercisesPerPage;
  return filteredExercises.value.slice(start, start + exercisesPerPage);
});
const exerciseRangeStart = computed(() => (exercisePage.value - 1) * exercisesPerPage + 1);
const exerciseRangeEnd = computed(() =>
  Math.min(exercisePage.value * exercisesPerPage, filteredExercises.value.length),
);
watch([search, selectedMuscle, selectedEquipment, libraryScope], () => {
  exercisePage.value = 1;
});
watch(exercisePageCount, (pageCount) => {
  if (exercisePage.value > pageCount) exercisePage.value = pageCount;
});
const selectedExerciseImage = computed(() =>
  selectedExercise.value ? guideAssetUrl(selectedExercise.value.slug, selectedFrame.value) : '',
);

onMounted(async () => {
  window.addEventListener('online', connectionChanged);
  window.addEventListener('offline', connectionChanged);
  window.addEventListener('beforeunload', beforeLeave);
  scheduleWeeklyRollover();
  await Promise.all([loadPlan(), loadExercises(), loadActiveSession(), loadRecentWorkouts()]);
  await loadFavorites();
});

onBeforeUnmount(() => {
  persistDrafts();
  window.removeEventListener('online', connectionChanged);
  window.removeEventListener('offline', connectionChanged);
  window.removeEventListener('beforeunload', beforeLeave);
  if (toastTimer) clearTimeout(toastTimer);
  window.clearTimeout(weeklyRolloverTimeout);
});

async function loadPlan() {
  planLoading.value = true;
  planError.value = '';
  try {
    const response = await axios.get<{ plan: WeeklyPlan }>('/api/v1/plans/default');
    plan.value = response.data.plan;
    selectedDayIndex.value = Math.min(
      selectedDayIndex.value,
      Math.max(0, response.data.plan.days.length - 1),
    );
  } catch (error) {
    planError.value = getErrorMessage(
      error,
      'Could not load your weekly plan. Check your connection and try again.',
    );
  } finally {
    planLoading.value = false;
  }
}

async function loadRecentWorkouts() {
  try {
    const response = await axios.get<{ workouts: WorkoutSession[] }>('/api/v1/workouts');
    recentWorkouts.value = response.data.workouts;
  } catch (error) {
    notify(getErrorMessage(error, 'Could not load this week’s workout progress.'));
  }
}

function dayStatus(dayIndex: number): 'Done' | 'Live' | null {
  if (activeSession.value?.planDayIndex === dayIndex) return 'Live';
  const weekStart = getLocalWeekStart().getTime();
  const now = Date.now();
  const hasCompletedSession = recentWorkouts.value.some((workout) => {
    const startedAt = Date.parse(workout.startedAt);
    return (
      workout.planDayIndex === dayIndex &&
      workout.completedAt !== null &&
      startedAt >= weekStart &&
      startedAt <= now
    );
  });
  return hasCompletedSession ? 'Done' : null;
}

function acceptPlanResponse(response: { plan: WeeklyPlan }) {
  plan.value = response.plan;
  selectedDayIndex.value = Math.min(
    selectedDayIndex.value,
    Math.max(0, response.plan.days.length - 1),
  );
}

async function updatePlanRequest(
  action: () => Promise<{ plan: WeeklyPlan }>,
  successMessage?: string,
) {
  planBusy.value = true;
  planError.value = '';
  try {
    acceptPlanResponse(await action());
    if (successMessage) notify(successMessage);
    return true;
  } catch (error) {
    const message = getErrorMessage(
      error,
      'Could not save the plan. Your changes have not been saved.',
    );
    planError.value = message;
    notify(message);
    return false;
  } finally {
    planBusy.value = false;
  }
}

async function resetWeeklyPlan() {
  const saved = await updatePlanRequest(
    async () =>
      (await axios.post<{ plan: WeeklyPlan }>('/api/v1/plans/default/reset', { confirm: true }))
        .data,
    'Movements cleared and your new weekly split is ready. Workout history is unchanged.',
  );
  if (saved) {
    selectedDayIndex.value = 0;
    resetPlanOpen.value = false;
  }
}

function openDayEditor() {
  if (!selectedDay.value) return;
  dayDraft.title = selectedDay.value.title;
  dayDraft.focus = selectedDay.value.focus;
  dayDraft.isRestDay = selectedDay.value.isRestDay;
  dayEditorOpen.value = true;
}

async function saveDay() {
  if (!selectedDay.value) return;
  const saved = await updatePlanRequest(
    async () =>
      (
        await axios.patch<{ plan: WeeklyPlan }>(
          `/api/v1/plans/default/days/${selectedDay.value!.dayIndex}`,
          { ...dayDraft },
        )
      ).data,
    'Day updated.',
  );
  if (saved) dayEditorOpen.value = false;
}

function openPrescriptionEditor(item: PlannedExercise) {
  editingPlanExercise.value = item;
  prescriptionDraft.sets = item.sets;
  prescriptionDraft.reps = item.reps;
  prescriptionDraft.weightKg = item.weightKg;
  prescriptionOpen.value = true;
}

async function savePrescription() {
  if (!editingPlanExercise.value) return;
  const saved = await updatePlanRequest(
    async () =>
      (
        await axios.patch<{ plan: WeeklyPlan }>(
          `/api/v1/plans/default/exercises/${editingPlanExercise.value!.id}`,
          { ...prescriptionDraft },
        )
      ).data,
    'Targets saved.',
  );
  if (saved) prescriptionOpen.value = false;
}

async function movePlannedExercise(index: number, direction: -1 | 1) {
  if (!selectedDay.value) return;
  const ids = selectedDay.value.exercises.map((item) => item.id);
  const target = index + direction;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  await updatePlanRequest(
    async () =>
      (
        await axios.put<{ plan: WeeklyPlan }>(
          `/api/v1/plans/default/days/${selectedDay.value!.dayIndex}/exercises/order`,
          { exerciseIds: ids },
        )
      ).data,
    'Exercise order saved.',
  );
}

function askRemovePlannedExercise(item: PlannedExercise) {
  pendingPlanRemoval.value = item;
  removePlanExerciseOpen.value = true;
}

async function removePlannedExercise() {
  if (!pendingPlanRemoval.value) return;
  const saved = await updatePlanRequest(
    async () =>
      (
        await axios.delete<{ plan: WeeklyPlan }>(
          `/api/v1/plans/default/exercises/${pendingPlanRemoval.value!.id}`,
        )
      ).data,
    'Movement removed from the plan.',
  );
  if (saved) {
    removePlanExerciseOpen.value = false;
    pendingPlanRemoval.value = null;
  }
}

function openLibraryForPlan() {
  customMode.value = false;
  selectedToAdd.value = null;
  search.value = '';
  selectedMuscle.value = 'All';
  selectedEquipment.value = null;
  planLibraryOpen.value = true;
}

function openCatalogAdd(exercise: CatalogExercise) {
  if (selectedDay.value?.isRestDay) return;
  selectedToAdd.value = exercise;
  customMode.value = false;
  addDraft.sets = 3;
  addDraft.reps = 10;
  addDraft.weightKg = 0;
  detailOpen.value = false;
  planLibraryOpen.value = true;
}

async function saveCatalogExerciseToPlan() {
  if (!selectedDay.value || !selectedToAdd.value || !canAddCatalog.value) return;
  const exercise = selectedToAdd.value;
  const saved = await updatePlanRequest(
    async () =>
      (
        await axios.post<{ plan: WeeklyPlan }>(
          `/api/v1/plans/default/days/${selectedDay.value!.dayIndex}/exercises`,
          {
            ...(exercise.source === 'custom'
              ? { customExerciseId: exercise.customExerciseId }
              : { catalogExerciseId: exercise.id }),
            sets: addDraft.sets,
            reps: addDraft.reps,
            weightKg: addDraft.weightKg,
          },
        )
      ).data,
    `${exercise.name} added to ${selectedDay.value.dayName}.`,
  );
  if (saved) {
    selectedToAdd.value = null;
    planLibraryOpen.value = false;
  }
}

function chooseCustomMode() {
  customMode.value = !customMode.value;
  selectedToAdd.value = null;
  if (customMode.value) {
    editingCustomId.value = null;
    customName.value = '';
    customTarget.value = '';
    customEquipment.value = 'Bodyweight';
    customCues.value = '';
    customImageDataUrl.value = '';
    addDraft.sets = 3;
    addDraft.reps = 10;
    addDraft.weightKg = 0;
  }
}

async function addCustomExercise() {
  if (!customName.value.trim() || !customTarget.value.trim() || !customEquipment.value.trim())
    return;
  planBusy.value = true;
  try {
    const body = {
      name: customName.value.trim(),
      primaryMuscle: customTarget.value.trim(),
      equipment: customEquipment.value.trim(),
      cues: customCues.value.trim(),
      ...(customImageDataUrl.value ? { imageDataUrl: customImageDataUrl.value } : {}),
    };
    if (editingCustomId.value)
      await axios.patch(`/api/v1/exercises/custom/${editingCustomId.value}`, body);
    else await axios.post('/api/v1/exercises/custom', body);
    await loadExercises();
    customMode.value = false;
    editingCustomId.value = null;
    selectedMuscle.value = 'Custom';
    notify('Custom movement saved to the exercise library.');
  } catch (error) {
    notify(getErrorMessage(error, 'Could not save this custom movement.'));
  } finally {
    planBusy.value = false;
  }
}

function editCustomExercise(exercise: CatalogExercise) {
  if (!exercise.customExerciseId) return;
  editingCustomId.value = exercise.customExerciseId;
  customName.value = exercise.name;
  customTarget.value = exercise.primaryMuscle;
  customEquipment.value = exercise.equipment;
  customCues.value = exercise.cues ?? '';
  customImageDataUrl.value = '';
  customMode.value = true;
}

function readCustomImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  ) {
    notify('Choose a PNG, JPEG, or WebP image up to 2 MB.');
    (event.target as HTMLInputElement).value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    customImageDataUrl.value = typeof reader.result === 'string' ? reader.result : '';
  };
  reader.readAsDataURL(file);
}

async function archiveCustomExercise(exercise: CatalogExercise) {
  if (
    !exercise.customExerciseId ||
    !window.confirm(`Archive ${exercise.name}? Existing plans and workout history will be kept.`)
  )
    return;
  try {
    await axios.post(`/api/v1/exercises/custom/${exercise.customExerciseId}/archive`);
    await loadExercises();
    notify('Custom movement archived. Existing history is unchanged.');
  } catch (error) {
    notify(getErrorMessage(error, 'Could not archive this movement.'));
  }
}

function exportPlan() {
  window.location.assign('/api/v1/plans/default/export');
}

function openImportPicker() {
  if (importInput.value) {
    importInput.value.value = '';
    importInput.value.click();
  }
}

async function readImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 512 * 1024) {
    notify('The plan file must be smaller than 512 KB.');
    return;
  }
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Choose a weekly plan JSON file.');
    importDocument.value = parsed as Record<string, unknown>;
    planBusy.value = true;
    const response = await axios.post<PlanImportPreview>(
      '/api/v1/plans/default/import/preview',
      parsed,
    );
    importPreview.value = response.data;
    importPreviewOpen.value = true;
  } catch (error) {
    notify(
      getErrorMessage(
        error,
        error instanceof SyntaxError
          ? 'This file is not valid JSON.'
          : 'Could not preview this plan file.',
      ),
    );
  } finally {
    planBusy.value = false;
    input.value = '';
  }
}

async function confirmPlanImport() {
  if (!importDocument.value) return;
  const saved = await updatePlanRequest(
    async () =>
      (
        await axios.post<{ plan: WeeklyPlan }>('/api/v1/plans/default/import', {
          ...importDocument.value,
          replace: true,
        })
      ).data,
    'Weekly plan imported.',
  );
  if (saved) {
    importPreviewOpen.value = false;
    importPreview.value = null;
    importDocument.value = null;
  }
}

async function loadExercises() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const response = await axios.get<{
      exercises: Array<
        Exercise & {
          source?: 'catalog' | 'custom';
          customExerciseId?: number;
          cues?: string;
          imageUrl?: string | null;
        }
      >;
    }>('/api/v1/exercises');
    exercises.value = response.data.exercises.map((exercise) => ({
      ...exercise,
      source: exercise.source ?? 'catalog',
      imageUrl:
        exercise.source === 'custom' ? (exercise.imageUrl ?? '') : guideAssetUrl(exercise.slug, 1),
    }));
  } catch (error) {
    errorMessage.value = getErrorMessage(
      error,
      error instanceof Error
        ? error.message
        : 'Could not load the exercise catalog from the API. Check that the Express server is running.',
    );
  } finally {
    loading.value = false;
  }
}

async function loadActiveSession(onlyForNewWeek = false) {
  const weekStartsAt = getLocalWeekStart().toISOString();
  if (onlyForNewWeek && weekStartsAt === lastCheckedWeekStart) return;
  sessionError.value = '';
  persistDrafts();
  const previousId = activeSession.value?.id;
  draftsReady = false;
  try {
    const response = await axios.post<{
      session: WorkoutSession | null;
      abandonedSession?: WorkoutSession;
    }>('/api/v1/workouts/weekly-rollover', { weekStartsAt });
    lastCheckedWeekStart = weekStartsAt;
    activeSession.value = response.data.session;
    if (previousId !== response.data.session?.id) {
      Object.keys(setDrafts).forEach((key) => delete setDrafts[Number(key)]);
      Object.keys(loggedSetDrafts).forEach((key) => delete loggedSetDrafts[Number(key)]);
      Object.keys(newDraftBaselines).forEach((key) => delete newDraftBaselines[Number(key)]);
      metaDrafts.value = {};
    }
    if (response.data.abandonedSession) {
      notify(
        'Last week’s unfinished workout was saved in history. Your new week is ready to start.',
      );
    }
    if (response.data.session) {
      hydrateSessionDetails(response.data.session);
      restoreRestTimer(response.data.session.id);
    } else {
      clearRestTimerStorage();
    }
    prepareDrafts();
    restoreDrafts();
  } catch (error) {
    sessionError.value = getErrorMessage(
      error,
      'Could not load your active workout. Check your connection and try again.',
    );
  } finally {
    draftsReady = !!activeSession.value;
    sessionReady.value = true;
  }
}

function getLocalWeekStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function scheduleWeeklyRollover() {
  window.clearTimeout(weeklyRolloverTimeout);
  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setHours(0, 0, 0, 0);
  const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  weeklyRolloverTimeout = window.setTimeout(
    () => {
      void loadActiveSession();
      scheduleWeeklyRollover();
    },
    nextMonday.getTime() - now.getTime() + 1000,
  );
}

async function startSession() {
  sessionBusy.value = true;
  try {
    const planDayIndex =
      selectedDay.value && !selectedDay.value.isRestDay ? selectedDay.value.dayIndex : null;
    const response = await axios.post<{ session: WorkoutSession }>('/api/v1/workouts', {
      name: sessionName.value.trim(),
      planDayIndex,
    });
    activeSession.value = response.data.session;
    recentWorkouts.value = [response.data.session, ...recentWorkouts.value];
    hydrateSessionDetails(response.data.session);
    clearRestTimerStorage();
    prepareDrafts();
    draftsReady = true;
    notify(
      planDayIndex === null
        ? 'Free workout started.'
        : `${selectedDay.value?.dayName} workout started with your planned movements and sets.`,
    );
  } catch (error) {
    notify(getErrorMessage(error, 'Could not start the workout.'));
  } finally {
    sessionBusy.value = false;
  }
}

async function finishSession() {
  if (!activeSession.value || sessionBusy.value || detailBusy.value) return;
  if (hasUnloggedInputs.value && !discardUnlogged.value) return;
  finishError.value = '';
  sessionBusy.value = true;
  const key = draftKey();
  try {
    const response = await axios.post<{ session: WorkoutSession }>(
      `/api/v1/workouts/${activeSession.value.id}/finish`,
      {
        notes: sessionNotesDraft.value,
        perceivedEffort: effortDraft.value,
        setChanges: activeSession.value.exercises
          .flatMap((e) => e.sets)
          .filter((set) => setDraftChanged(set))
          .map((set) => ({ id: set.id, ...draftForSet(set) })),
      },
    );
    finishedWorkout.value = response.data.session;
    recapOpen.value = true;
    finishReviewOpen.value = false;
    discardUnlogged.value = false;
    recentWorkouts.value = [
      response.data.session,
      ...recentWorkouts.value.filter((workout) => workout.id !== response.data.session.id),
    ];
    activeSession.value = null;
    draftsReady = false;
    metaDrafts.value = {};
    Object.keys(newDraftBaselines).forEach((key) => delete newDraftBaselines[Number(key)]);
    Object.keys(loggedSetDrafts).forEach((key) => delete loggedSetDrafts[Number(key)]);
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* Storage is optional. */
      }
    }
    clearRestTimerStorage();
    sessionNotesDraft.value = '';
    effortDraft.value = null;
    Object.keys(setDrafts).forEach((key) => delete setDrafts[Number(key)]);
    notify('Workout saved to your history.');
  } catch (error) {
    finishError.value = getErrorMessage(
      error,
      'Could not finish the workout. Your changes are kept here. Try again.',
    );
  } finally {
    sessionBusy.value = false;
  }
}

async function addExercise(exercise: CatalogExercise) {
  if (!activeSession.value) return;
  sessionBusy.value = true;
  try {
    const response = await axios.post<{ session: WorkoutSession }>(
      `/api/v1/workouts/${activeSession.value.id}/exercises`,
      exercise.source === 'custom'
        ? { customExerciseId: exercise.customExerciseId }
        : { exerciseId: exercise.id, exerciseSlug: exercise.slug, exerciseName: exercise.name },
    );
    activeSession.value = response.data.session;
    prepareDrafts();
    detailOpen.value = false;
    notify(`${exercise.name} added to your workout.`);
  } catch (error) {
    notify(getErrorMessage(error, 'Could not add that movement.'));
  } finally {
    sessionBusy.value = false;
  }
}

async function removeExercise(exerciseId: number) {
  if (!activeSession.value) return;
  try {
    const response = await axios.delete<{ session: WorkoutSession }>(
      `/api/v1/workouts/${activeSession.value.id}/exercises/${exerciseId}`,
    );
    activeSession.value = response.data.session;
    prepareDrafts();
    notify('Movement removed from workout.');
  } catch (error) {
    notify(getErrorMessage(error, 'Could not remove that movement.'));
  }
}

async function logSet(
  exerciseId: number,
  setType: 'working' | 'warmup' = 'working',
  durationSeconds: number | null = null,
  distanceMeters: number | null = null,
) {
  if (!activeSession.value) return;
  const draft = setDrafts[exerciseId];
  if (!draft || ((draft.reps === null || draft.reps < 1) && !durationSeconds && !distanceMeters)) {
    notify('Enter reps, duration, or distance before logging this set.');
    return;
  }
  sessionBusy.value = true;
  try {
    const response = await axios.post<{ session: WorkoutSession }>(
      `/api/v1/workouts/${activeSession.value.id}/sets`,
      {
        workoutExerciseId: exerciseId,
        weightKg: draft.weightKg,
        reps: draft.reps,
        setType,
        durationSeconds,
        distanceMeters,
      },
    );
    activeSession.value = response.data.session;
    prepareDrafts();
    notify('Set logged. Keep it moving.');
    newDraftBaselines[exerciseId] = JSON.stringify(draftFor(exerciseId));
    startRestTimer();
  } catch (error) {
    notify(getErrorMessage(error, 'Could not log this set.'));
  } finally {
    sessionBusy.value = false;
  }
}

function draftForSet(set: LoggedSet) {
  loggedSetDrafts[set.id] ??= { weightKg: set.weightKg, reps: set.reps };
  return loggedSetDrafts[set.id]!;
}

async function toggleSetType(_exerciseId: number, set: LoggedSet) {
  if (!activeSession.value) return;
  try {
    activeSession.value = (
      await axios.patch<{ session: WorkoutSession }>(
        `/api/v1/workouts/${activeSession.value.id}/sets/${set.id}`,
        { setType: set.setType === 'warmup' ? 'working' : 'warmup' },
      )
    ).data.session;
  } catch (error) {
    notify(getErrorMessage(error, 'Could not update the set type.'));
  }
}

function setDraftChanged(set: LoggedSet) {
  const draft = draftForSet(set);
  return draft.weightKg !== set.weightKg || draft.reps !== set.reps;
}

async function saveSet(exerciseId: number, set: LoggedSet, completed?: boolean): Promise<boolean> {
  if (!activeSession.value) return false;
  const draft = draftForSet(set);
  sessionBusy.value = true;
  try {
    const response = await axios.patch<{ session: WorkoutSession }>(
      `/api/v1/workouts/${activeSession.value.id}/sets/${set.id}`,
      {
        weightKg: draft.weightKg,
        reps: draft.reps,
        ...(completed === undefined ? {} : { completed }),
      },
    );
    activeSession.value = response.data.session;
    const saved = response.data.session.exercises
      .flatMap((item) => item.sets)
      .find((item) => item.id === set.id);
    if (saved) Object.assign(draft, { weightKg: saved.weightKg, reps: saved.reps });
    prepareDrafts();
    if (completed !== undefined) notify(completed ? 'Set completed.' : 'Set marked incomplete.');
    else notify('Set values saved.');
    return true;
  } catch (error) {
    notify(getErrorMessage(error, `Could not update set ${set.setNumber}.`));
    return false;
  } finally {
    sessionBusy.value = false;
  }
}

function toggleSet(exerciseId: number, set: LoggedSet, completed: boolean | null) {
  if (completed !== null)
    void saveSet(exerciseId, set, completed).then((saved) => {
      if (saved && completed) {
        newDraftBaselines[exerciseId] = JSON.stringify(draftFor(exerciseId));
        startRestTimer();
      }
    });
}

function hydrateSessionDetails(session: WorkoutSession) {
  sessionNotesDraft.value = session.notes ?? '';
  effortDraft.value = session.perceivedEffort ?? null;
}

async function saveActiveNotes() {
  if (!activeSession.value || sessionBusy.value || detailBusy.value) return;
  const submittedNotes = sessionNotesDraft.value;
  detailBusy.value = 'notes';
  try {
    const response = await axios.patch<{ session: WorkoutSession }>(
      `/api/v1/workouts/${activeSession.value.id}/notes`,
      { notes: submittedNotes },
    );
    activeSession.value = response.data.session;
    if (sessionNotesDraft.value === submittedNotes)
      sessionNotesDraft.value = response.data.session.notes ?? '';
    notify('Workout notes saved.');
  } catch (error) {
    notify(getErrorMessage(error, 'Could not save workout notes. Try again.'));
  } finally {
    detailBusy.value = null;
  }
}

async function saveActiveEffort() {
  if (!activeSession.value || sessionBusy.value || detailBusy.value) return;
  const submittedEffort = effortDraft.value;
  detailBusy.value = 'effort';
  try {
    const response = await axios.patch<{ session: WorkoutSession }>(
      `/api/v1/workouts/${activeSession.value.id}/effort`,
      { perceivedEffort: submittedEffort },
    );
    activeSession.value = response.data.session;
    if (effortDraft.value === submittedEffort)
      effortDraft.value = response.data.session.perceivedEffort ?? null;
    notify('Session effort saved.');
  } catch (error) {
    notify(getErrorMessage(error, 'Could not save session effort. Try again.'));
  } finally {
    detailBusy.value = null;
  }
}

async function deleteSet(exerciseId: number, setId: number) {
  if (!activeSession.value) return;
  try {
    const response = await axios.delete<{ session: WorkoutSession }>(
      `/api/v1/workouts/${activeSession.value.id}/sets/${setId}`,
    );
    activeSession.value = response.data.session;
    notify('Set removed.');
  } catch (error) {
    notify(getErrorMessage(error, 'Could not remove this set.'));
  }
}

function prepareDrafts() {
  const exerciseIds = new Set(activeSession.value?.exercises.map((item) => item.id));
  const setIds = new Set(
    activeSession.value?.exercises.flatMap((item) => item.sets.map((set) => set.id)),
  );
  Object.keys(setDrafts).forEach((key) => {
    if (!exerciseIds.has(Number(key))) delete setDrafts[Number(key)];
  });
  Object.keys(loggedSetDrafts).forEach((key) => {
    if (!setIds.has(Number(key))) delete loggedSetDrafts[Number(key)];
  });
  activeSession.value?.exercises.forEach((item) => {
    const pending = item.sets.find((set) => !set.completed);
    setDrafts[item.id] ??= { weightKg: pending?.weightKg ?? null, reps: pending?.reps ?? 8 };
    newDraftBaselines[item.id] ??= JSON.stringify(setDrafts[item.id]);
    item.sets.forEach((set) => {
      loggedSetDrafts[set.id] ??= { weightKg: set.weightKg, reps: set.reps };
    });
  });
}

function draftFor(exerciseId: number) {
  setDrafts[exerciseId] ??= { weightKg: null, reps: 8 };
  return setDrafts[exerciseId];
}

function openExercise(exercise: CatalogExercise) {
  selectedExercise.value = exercise;
  selectedFrame.value = 1;
  detailOpen.value = true;
}

function getExerciseImage(slug: string) {
  return guideAssetUrl(slug, 1);
}

function guideAssetUrl(slug: string, frame: 1 | 2 | 3) {
  // The shipped guide files are labeled in the opposite direction to the
  // movement sequence we want people to follow in the UI.
  const orderedAssetFrame = (4 - frame) as 1 | 2 | 3;
  return (
    getAssetUrl(slug, orderedAssetFrame, {
      baseUrl: new URL('/workout-guide/', window.location.origin).toString(),
    }) ?? ''
  );
}

function formatExerciseType(type: ExerciseType) {
  return {
    weight_reps: 'WEIGHT + REPS',
    bodyweight_reps: 'BODYWEIGHT + REPS',
    duration: 'DURATION',
    distance_duration: 'DISTANCE + TIME',
    assisted_bodyweight: 'ASSISTED + REPS',
  }[type];
}

function getErrorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) ? (error.response?.data?.error ?? fallback) : fallback;
}

function notify(message: string) {
  toastMessage.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = '';
  }, 3200);
}
</script>

<style scoped>
.return-today,
.catalog-open,
.favorite-toggle {
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.return-today {
  background: transparent;
  border: 0;
  color: var(--accent-primary);
  min-height: 44px;
  padding: 0;
  text-decoration: underline;
}
.setup-prompt,
.draft-status {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 16px 0;
}
.setup-prompt a {
  color: var(--accent-primary);
}
.catalog-card {
  position: relative;
}
.catalog-open {
  display: block;
  width: 100%;
  padding: 0;
  background: transparent;
  border: 0;
  text-align: left;
}
.catalog-card .catalog-open .catalog-card-info {
  padding-inline-end: 44px;
}
.favorite-toggle {
  position: absolute;
  right: 8px;
  bottom: 12px;
  width: 44px;
  height: 44px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}
.favorite-toggle[aria-pressed='true'] {
  color: var(--accent-primary);
}
.catalog-open:focus-visible,
.favorite-toggle:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 3px;
}
.library-extra-filters {
  display: flex;
  gap: 16px;
  margin-block: 16px 24px;
}
.library-extra-filters > * {
  flex: 1;
  min-width: 0;
}
.finish-review {
  width: min(560px, 94vw);
  background: var(--bg-surface);
  color: var(--text-primary);
}
.finish-review h2 {
  font-size: 25px;
  line-height: 1.25;
}
.finish-review p {
  color: var(--text-secondary);
}
.finish-review [role='alert'] {
  color: var(--danger-primary);
}
@media (max-width: 500px) {
  .library-extra-filters {
    flex-direction: column;
  }
}
.workout-page {
  min-height: 100dvh;
  padding: 24px 20px 80px;
}

.page-shell {
  max-width: 1200px;
  margin: 0 auto;
}

.workout-view .lineup-card {
  width: 100%;
  text-align: left;
  font: inherit;
  color: var(--text-primary);
  cursor: pointer;
}
.workout-view .lineup-card:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 3px;
}
.workout-view .page-heading {
  margin-bottom: 20px;
}

.tab-view {
  animation: fadeIn 0.18s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.page-heading h2 {
  margin: 0;
  font-family:
    'DM Sans',
    -apple-system,
    sans-serif;
  font-size: clamp(24px, 3.5vw, 32px);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.heading-copy {
  max-width: 540px;
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.session-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
}

.session-indicator.is-live {
  border-color: var(--accent-border);
  color: var(--accent-primary);
}

.session-indicator.is-live .status-dot {
  background: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-surface);
}

.heading-badges-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.beginner-guide-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.beginner-guide-toggle-btn:hover,
.beginner-guide-toggle-btn.active {
  border-color: var(--accent-border);
  background: var(--accent-surface);
  color: var(--accent-primary);
}

.beginner-banner {
  margin-bottom: 24px;
  padding: 20px 22px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--card-shadow);
}

.banner-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.banner-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.banner-badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-surface);
  color: var(--accent-primary);
}

.banner-title-group h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.banner-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.banner-close:hover {
  color: var(--text-primary);
}

.beginner-steps-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.step-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.step-number {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 18px;
  font-weight: 900;
  color: var(--accent-primary);
  line-height: 1;
  padding-top: 2px;
}

.step-card strong {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.step-card p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.45;
}

/* Today's Scheduled Movements Lineup */
.today-lineup-panel {
  margin-top: 24px;
  padding: 24px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--card-shadow);
}

.lineup-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 18px;
}

.lineup-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.lineup-plan-link {
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.lineup-plan-link:hover {
  text-decoration: underline;
}

.lineup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.lineup-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
}

.lineup-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.lineup-img {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  background: var(--art-stage-bg, #141926);
  border: 1px solid var(--art-stage-border, #283348);
  object-fit: contain;
  padding: 3px;
}

.custom-movement-mark.mini {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--accent-surface);
  color: var(--accent-primary);
  border: 1px solid var(--accent-border);
  font-size: 18px;
  font-weight: 700;
}

.lineup-details {
  min-width: 0;
  flex: 1;
}

.lineup-details h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lineup-details p {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 11px;
}

.lineup-target {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.lineup-kg {
  padding: 1px 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--accent-primary);
  font-size: 11px;
  font-weight: 700;
}

/* Today Empty Helper */
.today-empty-helper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 24px;
  padding: 24px;
  background: var(--bg-surface);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
}

.helper-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.helper-icon {
  color: var(--accent-primary);
}

.helper-content h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.helper-content p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.helper-link {
  color: var(--accent-primary);
  font-weight: 700;
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
}

.helper-link:hover {
  text-decoration: underline;
}

/* Library View Styles */
.library-filter-bar {
  display: grid;
  gap: 14px;
  margin-bottom: 24px;
}

.library-search-input {
  max-width: 440px;
}

.muscle-chip-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.muscle-filter-chip {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.muscle-filter-chip:hover {
  border-color: var(--border-strong);
  background: var(--bg-surface-elevated);
  color: var(--text-primary);
}

.muscle-filter-chip.active {
  background: var(--accent-surface);
  border-color: var(--accent-border);
  color: var(--accent-primary);
  font-weight: 700;
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.catalog-card {
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--card-shadow);
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.catalog-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
}

.catalog-thumb {
  width: 100%;
  aspect-ratio: 16/10;
  object-fit: contain;
  padding: 8px;
  border-radius: var(--radius-sm);
  background: var(--art-stage-bg, #141926);
  border: 1px solid var(--art-stage-border, #283348);
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.05);
}

.catalog-card-info h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.catalog-badges {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.target-badge {
  padding: 2px 7px;
  background: var(--accent-surface);
  color: var(--accent-primary);
  font-size: 10px;
  font-weight: 700;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.equip-badge {
  padding: 2px 7px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-sm);
}

.catalog-empty {
  padding: 40px;
  text-align: center;
  background: var(--bg-surface);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
}

.catalog-pagination {
  display: flex;
  justify-content: center;
  margin-top: 28px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.app-toast {
  position: fixed;
  z-index: 7000;
  right: 24px;
  bottom: 24px;
  max-width: min(420px, calc(100vw - 32px));
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  box-shadow: var(--card-shadow);
}

@media (max-width: 700px) {
  .workout-page {
    padding: 16px 14px 80px;
  }

  .page-heading {
    flex-direction: column;
    align-items: flex-start;
  }

  .today-empty-helper {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
