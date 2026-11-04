<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { exportFile } from '@/utils/exportFile';
import { useAuth, type UserProfile } from '@/composables/useAuth';
import { preferenceIssue, preferencesEqual } from '@/utils/trainingPreferences';
import { LiftUpConnectionError } from '@/utils/apiAvailability';
import {
  useTrainingPreferences,
  setTrainingPreferences,
  type TrainingPreferences,
} from '@/composables/useTrainingPreferences';

const { currentUser } = useAuth();
const { preferences, toDisplay, fromDisplay } = useTrainingPreferences();
const router = useRouter();
const route = useRoute();
const selectBehavior = Capacitor.isNativePlatform() ? 'dialog' : 'menu';
const setup = computed(() => route.query.setup === '1');
const profile = reactive({
  name: currentUser.value?.name ?? '',
  experienceLevel: currentUser.value?.experienceLevel ?? 'beginner',
});
const draft = reactive<TrainingPreferences>({
  ...preferences.value,
  trainingDays: [...preferences.value.trainingDays],
});
const passwords = reactive({ currentPassword: '', newPassword: '' });
const deletion = reactive({ password: '', confirm: '' });
const busy = ref('');
const message = ref('');
const error = ref('');
const exporting = ref(false);
async function exportHistory() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    await exportFile('/api/v1/workouts/export.csv', 'liftup-workout-history.csv', 'text/csv');
  } catch {
    error.value = 'Could not export your history. Try again.';
  } finally {
    exporting.value = false;
  }
}
const loaded = ref(false);
const preferenceError = computed(() => preferenceIssue(draft));
const preferencesDirty = computed(
  () => loaded.value && !preferencesEqual(draft, preferences.value),
);
const profileDirty = computed(
  () =>
    loaded.value &&
    (profile.name !== currentUser.value?.name ||
      profile.experienceLevel !== currentUser.value?.experienceLevel),
);
const unsaved = computed(() => preferencesDirty.value || profileDirty.value);
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (unsaved.value && currentUser.value) {
    event.preventDefault();
    event.returnValue = '';
  }
};
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
onBeforeRouteLeave(
  () =>
    !currentUser.value ||
    !unsaved.value ||
    window.confirm('Leave settings without saving your changes?'),
);
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const planReview = ref(false);
const deleteReview = ref(false);
const goals = [
  { label: 'Build muscle', value: 'muscle' },
  { label: 'Build strength', value: 'strength' },
  { label: 'General fitness', value: 'fitness' },
];
const equipment = [
  { label: 'Full gym', value: 'gym' },
  { label: 'Dumbbells', value: 'dumbbells' },
  { label: 'Bodyweight', value: 'bodyweight' },
];
const dayOptions = weekdays.map((label, value) => ({ label, value }));
const starterNames = computed(() =>
  ({
    gym: ['Bench Press', 'Squat', 'Lat Pulldown', 'Seated Cable Row', 'Overhead Press'],
    dumbbells: [
      'Dumbbell Bench Press',
      'Goblet Squat',
      'One Arm Dumbbell Row',
      'Seated Dumbbell Press',
      'Dumbbell Glute Bridge',
    ],
    bodyweight: ['Push-up', 'Bodyweight Squat', 'Forward Lunge', 'Glute Bridge', 'Reverse Crunch'],
  })[preferences.value.equipment].slice(
    0,
    preferences.value.sessionMinutes < 40 ? 3 : preferences.value.sessionMinutes < 65 ? 4 : 5,
  ),
);
const errorText = (e: unknown) =>
  e instanceof LiftUpConnectionError
    ? e.message
    : axios.isAxiosError(e)
      ? (e.response?.data?.error ?? 'Could not connect. Check your connection and try again.')
      : 'Could not save. Try again.';
async function run(name: string, action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = name;
  message.value = '';
  error.value = '';
  try {
    await action();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = '';
  }
}
async function load() {
  await run('load', async () => {
    const response = await axios.get<{ settings: TrainingPreferences }>(
      '/api/v1/training/settings',
    );
    setTrainingPreferences(response.data.settings);
    Object.assign(draft, response.data.settings);
    loaded.value = true;
  });
}
onMounted(load);
const saveProfile = () =>
  run('profile', async () => {
    currentUser.value = (
      await axios.patch<{ user: UserProfile }>('/api/auth/profile', profile)
    ).data.user;
    message.value = 'Profile saved.';
  });
async function savePreferences() {
  if (preferenceError.value) {
    error.value = preferenceError.value;
    return;
  }
  await run('preferences', async () => {
    const response = await axios.put<{ settings: TrainingPreferences }>(
      '/api/v1/training/settings',
      { ...draft, onboardingComplete: true },
    );
    setTrainingPreferences(response.data.settings);
    if (currentUser.value) currentUser.value.settings = response.data.settings;
    draft.onboardingComplete = response.data.settings.onboardingComplete;
    message.value =
      'Preferences saved. Your existing plan has been kept. Preview the starter plan below to replace it.';
  });
}
const applyStarter = () =>
  run('starter', async () => {
    if (unsaved.value) {
      error.value = 'Save your settings changes before replacing the weekly plan.';
      return;
    }
    await axios.post('/api/v1/training/starter-plan', { confirm: true });
    planReview.value = false;
    await router.push('/app?tab=plan');
  });
const changePassword = () =>
  run('password', async () => {
    const response = await axios.post<{ message: string }>('/api/auth/change-password', passwords);
    passwords.currentPassword = '';
    passwords.newPassword = '';
    message.value = response.data.message;
  });
const deleteAccount = () =>
  run('delete', async () => {
    await axios.delete('/api/auth/account', { data: deletion });
    const account = currentUser.value?.id;
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(`liftup-draft:${account}:`))
        .forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem('gym-tracker-rest-timer');
    } catch {
      /* Optional device storage. */
    }
    currentUser.value = null;
    setTrainingPreferences();
    await router.push('/');
  });
</script>

<template>
  <q-page class="settings-page">
    <header>
      <p class="eyebrow">YOUR LIFTUP</p>
      <h1>{{ setup ? 'Make this your training plan.' : 'Account & training settings' }}</h1>
      <p>Choose what fits your week. You can change these preferences anytime.</p>
    </header>
    <RouterLink v-if="setup" class="setup-skip" to="/app"
      >Keep my current plan and set this up later</RouterLink
    >
    <div class="settings-feedback" aria-live="polite">
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" role="alert">
        {{ error }} <q-btn v-if="!loaded" flat no-caps label="Try again" @click="load" />
      </p>
    </div>
    <q-skeleton v-if="!loaded && busy === 'load'" height="240px" />
    <div v-if="loaded" class="settings-grid" :class="{ 'setup-layout': setup }">
      <section class="settings-section training-settings">
        <h2>How you train</h2>
        <p>
          Save your preferences, then optionally replace your weekly plan with a full-body starter.
        </p>
        <p v-if="preferencesDirty" class="settings-draft-status" role="status">
          Training preferences have unsaved changes.
        </p>
        <p v-if="preferenceError" class="settings-validation" role="alert">{{ preferenceError }}</p>
        <form @submit.prevent="savePreferences">
          <div class="field-pair">
            <q-select
              v-model="draft.goal"
              :behavior="selectBehavior"
              :options="goals"
              emit-value
              map-options
              outlined
              label="Training goal"
            /><q-select
              v-model="draft.equipment"
              :behavior="selectBehavior"
              :options="equipment"
              emit-value
              map-options
              outlined
              label="Available equipment"
            />
          </div>
          <q-select
            v-model="draft.trainingDays"
            :behavior="selectBehavior"
            multiple
            :options="dayOptions"
            emit-value
            map-options
            outlined
            label="Training days (choose 1–6)"
          />
          <div class="field-pair">
            <q-input
              v-model.number="draft.sessionMinutes"
              type="number"
              min="20"
              max="120"
              outlined
              label="Minutes per session"
            /><q-select
              v-model="draft.massUnit"
              :behavior="selectBehavior"
              :options="[
                { label: 'Kilograms (KG)', value: 'kg' },
                { label: 'Pounds (LB)', value: 'lb' },
              ]"
              emit-value
              map-options
              outlined
              label="Display weight in"
            />
          </div>
          <details class="progression-settings">
            <summary>Progression targets · optional</summary>
            <div class="field-pair">
              <q-input
                v-model.number="draft.repMin"
                type="number"
                min="1"
                max="100"
                outlined
                label="Target reps: minimum"
              /><q-input
                v-model.number="draft.repMax"
                type="number"
                min="1"
                max="100"
                outlined
                label="Target reps: maximum"
              />
            </div>
            <q-input
              :model-value="toDisplay(draft.incrementKg, draft.massUnit)"
              @update:model-value="draft.incrementKg = fromDisplay($event, draft.massUnit) ?? 0"
              type="number"
              :min="draft.massUnit === 'lb' ? 0.56 : 0.25"
              :max="draft.massUnit === 'lb' ? 44.09 : 20"
              step="any"
              outlined
              :label="`Load increase after reaching every target (${draft.massUnit})`"
              hint="Used for optional progression suggestions. Choose an increase your equipment supports."
            />
          </details>
          <q-btn
            type="submit"
            color="primary"
            unelevated
            no-caps
            label="Save training preferences"
            :loading="busy === 'preferences'"
            :disable="!!busy || !!preferenceError"
          />
        </form>
        <div class="starter-action">
          <q-btn
            outline
            no-caps
            label="Preview starter plan"
            :disable="!!busy || !preferences.onboardingComplete || unsaved"
            @click="planReview = true"
          />
          <p>
            {{
              unsaved
                ? 'Save your changes first so the preview matches the settings on this screen.'
                : `Uses your saved preferences. Starting loads are left at 0 ${preferences.massUnit} so you can choose your own.`
            }}
          </p>
        </div>
      </section>
      <div v-if="!setup" class="settings-side">
        <section class="settings-section">
          <h2>Your profile</h2>
          <p>{{ currentUser?.email }}</p>
          <form @submit.prevent="saveProfile">
            <q-input
              v-model="profile.name"
              outlined
              label="Name"
              maxlength="80"
              autocomplete="name"
            /><q-select
              v-model="profile.experienceLevel"
              :options="[
                { label: 'Beginner', value: 'beginner' },
                { label: 'Intermediate', value: 'intermediate' },
                { label: 'Advanced', value: 'advanced' },
              ]"
              emit-value
              map-options
              :behavior="selectBehavior"
              outlined
              label="Experience level"
            /><q-btn
              type="submit"
              outline
              no-caps
              label="Save profile"
              :loading="busy === 'profile'"
              :disable="!!busy"
            />
          </form>
        </section>
        <section class="settings-section">
          <h2>Change password</h2>
          <form @submit.prevent="changePassword">
            <q-input
              v-model="passwords.currentPassword"
              outlined
              type="password"
              label="Current password"
              autocomplete="current-password"
              maxlength="128"
            /><q-input
              v-model="passwords.newPassword"
              outlined
              type="password"
              label="New password (12–128 characters)"
              autocomplete="new-password"
              maxlength="128"
            /><q-btn
              type="submit"
              outline
              no-caps
              label="Change password"
              :loading="busy === 'password'"
              :disable="!!busy"
            />
          </form>
        </section>
        <section class="settings-section">
          <h2>Your data</h2>
          <p>Download your training log before closing your account.</p>
          <q-btn
            flat
            no-caps
            label="Export history CSV"
            @click="exportHistory"
            :loading="exporting"
          /><q-btn
            flat
            no-caps
            color="negative"
            label="Delete account…"
            @click="deleteReview = true"
          />
        </section>
      </div>
    </div>
    <q-dialog v-model="planReview" :persistent="!!busy"
      ><q-card class="settings-dialog"
        ><q-card-section
          ><h2>Your starter week</h2>
          <p>
            {{ preferences.trainingDays.map((d) => weekdays[d]).join(', ') }} ·
            {{ preferences.sessionMinutes }} minutes · {{ preferences.equipment }}
          </p>
          <p>
            Full-body sessions with
            {{ preferences.sessionMinutes < 40 ? 3 : preferences.sessionMinutes < 65 ? 4 : 5 }}
            movements and {{ preferences.goal === 'fitness' ? 2 : 3 }} sets per movement. Review and
            adjust these targets before training.
          </p>
          <ol>
            <li v-for="name in starterNames" :key="name">
              {{ name }} · {{ preferences.goal === 'fitness' ? 2 : 3 }} ×
              {{ preferences.repMin }} reps
            </li>
          </ol>
          <p>
            This replaces your weekly plan. Your workout history and saved templates stay available.
            Save the current plan as a template first if you want to reuse it.
          </p>
          <p v-if="error" role="alert">{{ error }}</p></q-card-section
        ><q-card-actions align="right"
          ><q-btn flat no-caps label="Keep current plan" v-close-popup :disable="!!busy" /><q-btn
            color="primary"
            no-caps
            label="Replace weekly plan"
            :loading="busy === 'starter'"
            @click="applyStarter" /></q-card-actions></q-card
    ></q-dialog>
    <q-dialog v-model="deleteReview" :persistent="!!busy"
      ><q-card class="settings-dialog"
        ><q-card-section
          ><h2>Delete your account?</h2>
          <p>Your plans, workouts, custom exercises and account will be permanently deleted.</p>
          <q-input
            v-model="deletion.password"
            outlined
            type="password"
            label="Current password"
            autocomplete="current-password"
          /><q-input v-model="deletion.confirm" outlined label="Type DELETE to confirm" />
          <p v-if="error" role="alert">{{ error }}</p></q-card-section
        ><q-card-actions align="right"
          ><q-btn flat no-caps label="Keep account" v-close-popup :disable="!!busy" /><q-btn
            color="negative"
            no-caps
            label="Delete account permanently"
            :disable="deletion.confirm !== 'DELETE' || !deletion.password"
            :loading="busy === 'delete'"
            @click="deleteAccount" /></q-card-actions></q-card
    ></q-dialog>
  </q-page>
</template>

<style scoped>
.setup-layout {
  max-width: 760px;
  grid-template-columns: minmax(0, 1fr) !important;
}
.setup-skip {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--accent-primary);
  font-size: 14px;
}
.progression-settings {
  display: grid;
  gap: 16px;
  padding-block: 12px;
  border-block: 1px solid var(--border-subtle);
}
.progression-settings summary {
  min-height: 44px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 14px;
}
.progression-settings .field-pair {
  margin-block: 12px 20px;
}
.settings-page {
  max-width: 1240px;
  margin: auto;
  padding: 32px 28px 110px;
}
header {
  max-width: 760px;
  margin-bottom: 28px;
}
h1 {
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.15;
  margin: 8px 0 12px;
}
h2 {
  font-size: 21px;
  line-height: 1.3;
  margin: 0 0 10px;
}
p {
  color: var(--text-secondary);
  font-size: 15px;
  overflow-wrap: anywhere;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 0.12em;
}
.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}
.settings-side {
  display: grid;
  gap: 28px;
}
.settings-section {
  padding-block: 20px;
  border-top: 1px solid var(--border-strong);
}
form {
  display: grid;
  gap: 20px;
  margin-top: 20px;
}
form .q-btn {
  justify-self: start;
  min-height: 44px;
}
.field-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.starter-action {
  margin-top: 24px;
}
.settings-feedback {
  min-height: 12px;
}
[role='alert'] {
  color: var(--danger-primary);
}
.settings-dialog {
  width: min(560px, 94vw);
  background: var(--bg-surface);
  color: var(--text-primary);
}
.settings-dialog .q-field {
  margin-top: 18px;
}
@media (max-width: 760px) {
  .settings-page {
    padding: 24px 16px 110px;
  }
  .settings-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .field-pair {
    grid-template-columns: 1fr;
  }
}
</style>
