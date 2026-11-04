<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { ExerciseType } from '@bryllim/workout-guide';
import type { CatalogExercise, PlanDay } from '@/types/workout';
import { useTrainingPreferences } from '@/composables/useTrainingPreferences';
import LibraryPagination from './LibraryPagination.vue';
const { massUnit, toDisplay, fromDisplay } = useTrainingPreferences();

const open = defineModel<boolean>({ required: true });
const search = defineModel<string>('search', { required: true });
const selectedMuscle = defineModel<string>('selectedMuscle', { required: true });
const selectedEquipment = defineModel<string | null>('selectedEquipment', { required: true });
const exercisePage = defineModel<number>('exercisePage', { required: true });
const content = ref<HTMLElement | null>(null);
async function changePage(page: number) {
  exercisePage.value = page;
  await nextTick();
  content.value?.scrollTo?.({ top: 0, behavior: 'smooth' });
}
const customMode = defineModel<boolean>('customMode', { required: true });
const customName = defineModel<string>('customName', { required: true });
const customTarget = defineModel<string>('customTarget', { required: true });
const customEquipment = defineModel<string>('customEquipment', { required: true });
const customCues = defineModel<string>('customCues', { required: true });
const customImageDataUrl = defineModel<string>('customImageDataUrl', { required: true });
const addSets = defineModel<number>('addSets', { required: true });
const addReps = defineModel<number>('addReps', { required: true });
const addWeightKg = defineModel<number>('addWeightKg', { required: true });

defineProps<{
  selectedDay: PlanDay | null;
  illustratedExerciseCount: number;
  customExerciseCount: number;
  muscleFilters: string[];
  equipmentOptions: string[];
  selectedToAdd: CatalogExercise | null;
  canAddCatalog: boolean;
  canCreateCustom: boolean;
  editingCustomId: number | null;
  planBusy: boolean;
  sessionBusy: boolean;
  activeSession: boolean;
  loading: boolean;
  errorMessage: string;
  filteredExercises: CatalogExercise[];
  paginatedExercises: CatalogExercise[];
  exercisePageCount: number;
  exerciseRangeStart: number;
  exerciseRangeEnd: number;
  formatExerciseType: (type: ExerciseType) => string;
}>();

const emit = defineEmits<{
  chooseCustomMode: [];
  saveCatalog: [];
  addCustom: [];
  readCustomImage: [event: Event];
  retryLoad: [];
  openExercise: [exercise: CatalogExercise];
  openCatalogAdd: [exercise: CatalogExercise];
  addToSession: [exercise: CatalogExercise];
  editCustom: [exercise: CatalogExercise];
  archiveCustom: [exercise: CatalogExercise];
}>();
</script>

<template>
  <q-dialog v-model="open" maximized transition-show="slide-up" transition-hide="slide-down">
    <q-card class="plan-library-dialog">
      <q-toolbar class="plan-library-toolbar">
        <div>
          <p class="eyebrow">
            {{
              customMode
                ? 'YOUR MOVEMENTS'
                : `ADD TO ${selectedDay?.dayName.toUpperCase() ?? 'YOUR PLAN'}`
            }}
          </p>
          <h2>Choose a movement</h2>
        </div>
        <q-space />
        <q-btn round flat icon="close" aria-label="Close exercise library" v-close-popup />
      </q-toolbar>
      <div ref="content" class="plan-library-content">
        <div class="library-heading plan-library-heading">
          <div>
            <h3>Exercise library</h3>
            <p>
              {{ illustratedExerciseCount }} illustrated movements ·
              {{ customExerciseCount }} custom
            </p>
          </div>
          <q-btn flat no-caps label="Create custom" @click="emit('chooseCustomMode')" />
          <q-input
            v-model="search"
            outlined
            dense
            clearable
            placeholder="Search movement or muscle"
            aria-label="Search movements"
            class="search-input"
          >
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
        <div class="filter-row" aria-label="Filter exercises by muscle group">
          <button
            v-for="muscle in muscleFilters"
            :key="muscle"
            class="filter-chip"
            :class="{ selected: selectedMuscle === muscle }"
            :aria-pressed="selectedMuscle === muscle"
            @click="selectedMuscle = muscle"
          >
            {{ muscle }}
          </button>
          <button
            class="filter-chip"
            :class="{ selected: selectedMuscle === 'Custom' }"
            :aria-pressed="selectedMuscle === 'Custom'"
            @click="selectedMuscle = 'Custom'"
          >
            Custom
          </button>
          <q-select
            v-model="selectedEquipment"
            :options="equipmentOptions"
            dense
            outlined
            clearable
            label="Equipment"
            aria-label="Filter by equipment"
            class="equipment-filter"
          />
        </div>
        <section
          v-if="selectedToAdd && !customMode"
          class="selected-catalog-entry"
          aria-label="Set planned movement targets"
        >
          <img
            v-if="selectedToAdd.imageUrl"
            :src="selectedToAdd.imageUrl"
            :alt="`${selectedToAdd.name} movement image`"
          />
          <span v-else class="custom-art-fallback">CUSTOM<br />MOVEMENT</span>
          <div class="selected-catalog-copy">
            <strong>{{ selectedToAdd.name }}</strong
            ><span>{{ selectedToAdd.primaryMuscle }} · {{ selectedToAdd.equipment }}</span>
          </div>
          <q-input
            v-model.number="addSets"
            label="Sets"
            type="number"
            min="1"
            max="20"
            outlined
            dense
          />
          <q-input
            v-model.number="addReps"
            label="Reps"
            type="number"
            min="1"
            max="1000"
            outlined
            dense
          />
          <q-input
            :model-value="toDisplay(addWeightKg)"
            @update:model-value="addWeightKg = fromDisplay($event) ?? 0"
            :label="`Load (${massUnit})`"
            type="number"
            min="0"
            :max="massUnit === 'lb' ? 2204.62 : 1000"
            step="any"
            outlined
            dense
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Add to selected day"
            :loading="planBusy"
            :disable="!canAddCatalog"
            @click="emit('saveCatalog')"
          />
        </section>
        <div v-if="customMode" class="custom-entry">
          <div class="custom-entry-heading">
            <span class="custom-movement-mark">+</span>
            <div>
              <strong>Add a custom movement</strong>
              <p>Use this when it isn’t in the catalog.</p>
            </div>
          </div>
          <div class="custom-entry-fields">
            <q-input v-model="customName" label="Movement name" outlined maxlength="100" />
            <q-input v-model="customTarget" label="Target muscle" outlined maxlength="80" />
            <q-input v-model="customEquipment" label="Equipment" outlined maxlength="80" />
            <q-input
              v-model="customCues"
              label="Form cues (optional)"
              outlined
              maxlength="2000"
              type="textarea"
            />
            <label class="custom-image-field"
              >Optional image<input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                @change="emit('readCustomImage', $event)"
            /></label>
            <img
              v-if="customImageDataUrl"
              class="custom-image-preview"
              :src="customImageDataUrl"
              alt="Custom movement preview"
            />
            <q-btn
              unelevated
              no-caps
              color="primary"
              :label="editingCustomId ? 'Save changes' : 'Save to exercise library'"
              :loading="planBusy"
              :disable="!canCreateCustom"
              @click="emit('addCustom')"
            />
          </div>
        </div>
        <div
          v-if="loading"
          class="exercise-grid library-dialog-grid"
          aria-label="Loading exercise catalog"
        >
          <div v-for="index in 6" :key="index">
            <q-skeleton height="140px" /><q-skeleton class="q-mt-sm" height="18px" />
          </div>
        </div>
        <div v-else-if="errorMessage" class="state-panel error-panel" role="alert">
          <q-icon name="cloud_off" size="28px" />
          <div>
            <strong>Exercise library unavailable</strong>
            <p>{{ errorMessage }}</p>
            <q-btn flat no-caps label="Try again" @click="emit('retryLoad')" />
          </div>
        </div>
        <div v-else-if="filteredExercises.length" class="exercise-results">
          <div class="exercise-grid library-dialog-grid">
            <article
              v-for="exercise in paginatedExercises"
              :key="exercise.id"
              class="exercise-item"
            >
              <button
                class="exercise-art"
                :aria-label="
                  exercise.source === 'catalog'
                    ? `View ${exercise.name} movement illustration`
                    : `${exercise.name} custom exercise`
                "
                @click="exercise.source === 'catalog' && emit('openExercise', exercise)"
              >
                <img
                  v-if="exercise.source === 'catalog'"
                  :src="exercise.imageUrl"
                  :alt="`${exercise.name} exercise illustration`"
                  loading="lazy"
                /><img
                  v-else-if="exercise.imageUrl"
                  :src="exercise.imageUrl"
                  :alt="`${exercise.name} custom exercise image`"
                  loading="lazy"
                /><span v-else class="custom-art-fallback">CUSTOM<br />MOVEMENT</span
                ><span v-if="exercise.source === 'catalog'" class="art-frame-count">3 FRAMES</span>
              </button>
              <div class="exercise-details">
                <div class="exercise-title-line">
                  <div>
                    <h3>{{ exercise.name }}</h3>
                    <p>{{ exercise.primaryMuscle }} <span>·</span> {{ exercise.equipment }}</p>
                    <p v-if="exercise.cues" class="exercise-cues">{{ exercise.cues }}</p>
                  </div>
                </div>
                <div class="catalog-actions">
                  <q-btn
                    dense
                    flat
                    no-caps
                    color="primary"
                    label="Set targets"
                    :disable="planBusy || selectedDay?.isRestDay"
                    @click="emit('openCatalogAdd', exercise)"
                  />
                  <q-btn
                    v-if="activeSession"
                    dense
                    flat
                    no-caps
                    color="grey-8"
                    label="Add to session"
                    :disable="sessionBusy"
                    @click="emit('addToSession', exercise)"
                  />
                  <template v-if="exercise.source === 'custom'">
                    <q-btn dense flat no-caps label="Edit" @click="emit('editCustom', exercise)" />
                    <q-btn
                      dense
                      flat
                      no-caps
                      color="negative"
                      label="Archive"
                      @click="emit('archiveCustom', exercise)"
                    />
                  </template>
                </div>
                <span class="type-label">{{ formatExerciseType(exercise.exerciseType) }}</span>
              </div>
            </article>
          </div>
          <LibraryPagination
            :model-value="exercisePage"
            @update:model-value="changePage"
            :page-count="exercisePageCount"
            :range-start="exerciseRangeStart"
            :range-end="exerciseRangeEnd"
            :total="filteredExercises.length"
          />
        </div>
        <div v-else class="state-panel empty-panel">
          <q-icon name="search_off" size="30px" /><strong>No movements match that search</strong>
          <p>Try another name or muscle group, or choose Custom.</p>
        </div>
        <p class="asset-credit">
          Exercise artwork by
          <a href="https://bryllim.com" target="_blank" rel="noreferrer">Bryl Lim</a> under
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer"
            >CC BY-SA 4.0</a
          >. Some first-frame art is adapted from
          <a href="https://github.com/everkinetic/data" target="_blank" rel="noreferrer"
            >Everkinetic</a
          >.
        </p>
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.eyebrow {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.plan-library-dialog {
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}
.plan-library-toolbar {
  flex: 0 0 auto;
  min-height: 88px;
  padding: 12px max(24px, calc((100vw - 1320px) / 2));
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-page);
}

:global(body.capacitor) .plan-library-toolbar {
  padding-top: calc(10px + var(--q-safe-area-inset-top, env(safe-area-inset-top, 0px)));
}
:global(body.capacitor) .plan-library-content {
  padding-bottom: calc(34px + var(--q-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
}
.plan-library-toolbar .eyebrow {
  margin: 0 0 4px;
}
.plan-library-toolbar h2 {
  margin: 0;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 30px;
}
.plan-library-content {
  width: min(100%, 1320px);
  flex: 1;
  overflow-y: auto;
  margin: 0 auto;
  padding: 26px 28px 44px;
}
.library-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 19px;
}
.plan-library-heading {
  align-items: center;
}
.plan-library-heading h3 {
  margin: 0;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 28px;
}
.plan-library-heading p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}
.search-input {
  width: min(320px, 38vw);
}
.filter-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 18px;
}
.filter-chip {
  padding: 8px 13px;
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    transform 150ms ease;
}
.filter-chip:hover {
  border-color: var(--border-strong);
}
.filter-chip:active {
  transform: translateY(1px);
}
.filter-chip.selected {
  border-color: var(--accent-primary);
  background: var(--accent-primary);
  color: var(--accent-contrast);
}
.equipment-filter {
  min-width: 140px;
}
.catalog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  margin-top: 8px;
}
.catalog-actions .q-btn {
  font-size: 10px;
}
.selected-catalog-entry,
.custom-entry {
  display: grid;
  grid-template-columns: 58px minmax(140px, 1fr) repeat(3, minmax(92px, 130px)) auto;
  align-items: center;
  gap: 12px;
  margin: 4px 0 18px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  background: var(--bg-surface-elevated);
}
.selected-catalog-entry > img {
  width: 56px;
  height: 52px;
  border-radius: 5px;
  background: #263a36;
  object-fit: contain;
}
.selected-catalog-copy {
  display: grid;
  gap: 5px;
}
.selected-catalog-copy strong {
  font-size: 12px;
}
.selected-catalog-copy span {
  color: var(--text-secondary);
  font-size: 10px;
}
.custom-entry {
  display: block;
}
.custom-entry-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 15px;
}
.custom-movement-mark {
  display: grid;
  width: 50px;
  height: 50px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 5px;
  background: var(--accent-surface);
  color: var(--accent-primary);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 22px;
  font-weight: 700;
}
.custom-entry-heading strong {
  font-size: 13px;
}
.custom-entry-heading p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
}
.custom-entry-fields {
  display: grid;
  grid-template-columns: 1.4fr 1fr repeat(3, minmax(90px, 0.6fr)) auto;
  align-items: start;
  gap: 10px;
}
.custom-image-field {
  display: grid;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 11px;
}
.custom-image-preview {
  max-width: 120px;
  max-height: 80px;
  border-radius: 5px;
  object-fit: contain;
  background: #263a36;
}
.exercise-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}
.library-dialog-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.library-dialog-grid .exercise-art {
  aspect-ratio: 1.8;
}
.library-dialog-grid .exercise-art img {
  object-fit: contain;
}
.library-dialog-grid .exercise-details {
  padding: 12px;
}
.exercise-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 20px 0 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12px;
}
.exercise-pagination .q-pagination {
  flex: 0 0 auto;
}
.exercise-item {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  transition:
    border-color 160ms cubic-bezier(0.32, 0.72, 0, 1),
    transform 160ms cubic-bezier(0.32, 0.72, 0, 1),
    box-shadow 160ms cubic-bezier(0.32, 0.72, 0, 1);
}
.exercise-item:hover {
  transform: translateY(-2px);
  border-color: var(--accent-border);
  box-shadow: 0 4px 18px -2px var(--accent-surface);
}
.exercise-art {
  position: relative;
  display: grid;
  width: 100%;
  aspect-ratio: 1.55;
  place-items: center;
  overflow: hidden;
  border: 0;
  background: var(--art-stage-bg, #141926);
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
}
.exercise-art img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 220ms ease;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5));
}
.exercise-item:hover .exercise-art img {
  transform: scale(1.05);
}
.art-frame-count {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 3px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.75);
  color: var(--accent-primary);
  border: 1px solid var(--accent-border);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.custom-art-fallback {
  color: var(--accent-primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-align: center;
  line-height: 1.4;
}
.exercise-details {
  padding: 14px 15px 13px;
}
.exercise-title-line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 5px;
}
.exercise-title-line h3 {
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.35;
  text-overflow: ellipsis;
  color: var(--text-primary);
}
.exercise-title-line p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
}
.exercise-title-line p span {
  margin: 0 3px;
  color: var(--text-muted);
}
.exercise-cues {
  margin-top: 4px !important;
  font-size: 10px !important;
  line-height: 1.4;
  color: var(--text-muted);
}
.type-label {
  display: inline-block;
  margin-top: 11px;
  color: var(--accent-primary);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.11em;
}
.asset-credit {
  margin: 22px 0 0;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.6;
}
.asset-credit a {
  color: var(--accent-primary);
  text-decoration-color: var(--accent-border);
  text-underline-offset: 2px;
}
.state-panel {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 28px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
}
.state-panel strong {
  color: var(--text-primary);
}
.state-panel p {
  margin: 5px 0 0;
  font-size: 12px;
}
.error-panel > .q-icon {
  color: var(--danger-primary);
}
.empty-panel {
  flex-direction: column;
  justify-content: center;
  min-height: 200px;
  text-align: center;
}

@media (max-width: 1050px) {
  .library-dialog-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .selected-catalog-entry {
    grid-template-columns: 52px minmax(120px, 1fr) repeat(3, minmax(82px, 110px));
  }
  .selected-catalog-entry .q-btn {
    grid-column: 2 / -1;
    justify-self: end;
  }
  .custom-entry-fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .custom-entry-fields .q-btn {
    grid-column: 1 / -1;
    justify-self: end;
  }
}

@media (max-width: 700px) {
  .exercise-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
  .plan-library-content {
    padding: 20px 16px 34px;
  }
  .plan-library-toolbar {
    padding: 10px 16px;
  }
  .plan-library-heading {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }
  .plan-library-heading .search-input {
    width: 100%;
  }
  .library-dialog-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 11px;
  }
  .library-dialog-grid .exercise-title-line h3 {
    font-size: 11px;
  }
  .selected-catalog-entry {
    grid-template-columns: 46px minmax(0, 1fr) repeat(2, minmax(80px, 1fr));
    gap: 8px;
    padding: 10px;
  }
  .selected-catalog-entry > img {
    width: 44px;
    height: 44px;
  }
  .selected-catalog-copy {
    grid-column: 2 / -1;
  }
  .selected-catalog-entry .q-btn {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
  .custom-entry-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .custom-entry-fields .q-btn {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
}
</style>
