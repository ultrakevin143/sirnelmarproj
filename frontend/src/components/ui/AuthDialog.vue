<template>
  <q-dialog v-model="authDialogOpen">
    <div class="auth-dialog-card">
      <!-- Close button -->
      <button class="close-btn" aria-label="Close" @click="closeAuthDialog">
        <q-icon name="close" size="18px" />
      </button>

      <!-- Brand / Header -->
      <div class="auth-header">
        <div class="auth-logo-badge">
          <LiftUpLogo :size="24" color="#0b0e14" />
        </div>
        <h3 class="auth-title">
          {{ authDialogMode === 'register' ? 'Join LiftUp' : 'Welcome Back' }}
        </h3>
        <p class="auth-subtitle">
          {{
            authDialogMode === 'register'
              ? 'Create your athlete profile to personalize workouts and track progress.'
              : 'Log in to access your workout history and custom training splits.'
          }}
        </p>
      </div>

      <!-- Mode Switcher Tabs -->
      <div class="auth-mode-tabs">
        <button
          type="button"
          class="mode-tab"
          :class="{ active: authDialogMode === 'register' }"
          :aria-pressed="authDialogMode === 'register'"
          @click="authDialogMode = 'register'"
        >
          Create Account
        </button>
        <button
          type="button"
          class="mode-tab"
          :class="{ active: authDialogMode === 'login' }"
          :aria-pressed="authDialogMode === 'login'"
          @click="authDialogMode = 'login'"
        >
          Sign In
        </button>
      </div>

      <!-- Registration Form -->
      <form v-if="authDialogMode === 'register'" class="auth-form" @submit.prevent="handleRegister">
        <div class="form-field">
          <label for="reg-name">Your Name or Athlete Handle</label>
          <q-input
            id="reg-name"
            aria-label="Your name"
            autocomplete="name"
            maxlength="80"
            v-model="name"
            outlined
            dense
            placeholder="e.g. Alex Rivera"
            :rules="[(val) => !!val || 'Please enter your name']"
          >
            <template #prepend>
              <q-icon name="person" size="18px" />
            </template>
          </q-input>
        </div>

        <div class="form-field">
          <label for="reg-email">Email Address</label>
          <q-input
            id="reg-email"
            aria-label="Registration email"
            autocomplete="username"
            maxlength="254"
            v-model="email"
            type="email"
            outlined
            dense
            placeholder="alex@example.com"
            :rules="[(val) => !!val || 'Please enter your email']"
          >
            <template #prepend>
              <q-icon name="email" size="18px" />
            </template>
          </q-input>
        </div>

        <div class="form-field">
          <label for="reg-password">Password</label>
          <q-input
            id="reg-password"
            aria-label="Create a password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            outlined
            dense
            placeholder="At least 12 characters"
            autocomplete="new-password"
            maxlength="128"
            :rules="[(val) => (val && val.length >= 12) || 'Minimum 12 characters']"
          >
            <template #prepend>
              <q-icon name="lock" size="18px" />
            </template>
            <template #append>
              <q-btn
                type="button"
                flat
                round
                dense
                :icon="showPassword ? 'visibility_off' : 'visibility'"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>
        </div>

        <!-- Beginner Experience Level Picker -->
        <div class="form-field">
          <label class="level-label">
            <span>Your Experience Level</span>
            <small class="helper-text">We'll adapt guidance to your level</small>
          </label>
          <div class="level-cards-grid">
            <button
              type="button"
              class="level-card"
              :class="{ selected: experienceLevel === 'beginner' }"
              :aria-pressed="experienceLevel === 'beginner'"
              @click="experienceLevel = 'beginner'"
            >
              <span class="level-icon">🌱</span>
              <strong>Beginner</strong>
              <small>New to gym or under 1 year</small>
            </button>
            <button
              type="button"
              class="level-card"
              :class="{ selected: experienceLevel === 'intermediate' }"
              :aria-pressed="experienceLevel === 'intermediate'"
              @click="experienceLevel = 'intermediate'"
            >
              <span class="level-icon">⚡</span>
              <strong>Intermediate</strong>
              <small>1–3 years lifting</small>
            </button>
            <button
              type="button"
              class="level-card"
              :class="{ selected: experienceLevel === 'advanced' }"
              :aria-pressed="experienceLevel === 'advanced'"
              @click="experienceLevel = 'advanced'"
            >
              <span class="level-icon">🏆</span>
              <strong>Advanced</strong>
              <small>3+ years / competitive</small>
            </button>
          </div>
        </div>

        <q-btn
          type="submit"
          unelevated
          no-caps
          color="primary"
          class="submit-btn full-width"
          label="Create Account & Start Training"
          :loading="busy"
        />
      </form>

      <!-- Login Form -->
      <form v-else class="auth-form" @submit.prevent="handleLogin">
        <div class="form-field">
          <label for="login-email">Email Address</label>
          <q-input
            id="login-email"
            aria-label="Sign-in email"
            autocomplete="username"
            maxlength="254"
            v-model="email"
            type="email"
            outlined
            dense
            placeholder="alex@example.com"
            :rules="[(val) => !!val || 'Please enter your email']"
          >
            <template #prepend>
              <q-icon name="email" size="18px" />
            </template>
          </q-input>
        </div>

        <div class="form-field">
          <label for="login-password">Password</label>
          <q-input
            id="login-password"
            aria-label="Sign-in password"
            autocomplete="current-password"
            maxlength="128"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            outlined
            dense
            placeholder="Enter your password"
            :rules="[(val) => !!val || 'Please enter your password']"
          >
            <template #prepend>
              <q-icon name="lock" size="18px" />
            </template>
            <template #append>
              <q-btn
                type="button"
                flat
                round
                dense
                :icon="showPassword ? 'visibility_off' : 'visibility'"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>
        </div>

        <q-btn
          type="submit"
          unelevated
          no-caps
          color="primary"
          class="submit-btn full-width"
          label="Sign In"
          :loading="busy"
        />
      </form>

      <p v-if="authError || connectionError" class="auth-error" role="alert">
        {{ authError || connectionError }}
      </p>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { useAuth, type ExperienceLevel } from '@/composables/useAuth';
import LiftUpLogo from './LiftUpLogo.vue';
import { LiftUpConnectionError } from '@/utils/apiAvailability';

const { authDialogOpen, authDialogMode, closeAuthDialog, register, login, connectionError } =
  useAuth();
const router = useRouter();
const busy = ref(false);
const authError = ref('');

const name = ref('');
const email = ref('');
const password = ref('');
const showPassword = ref(false);
const experienceLevel = ref<ExperienceLevel>('beginner');

watch(authDialogMode, () => {
  authError.value = '';
  password.value = '';
});

async function submitAuth(mode: 'login' | 'register') {
  if (busy.value) return;
  busy.value = true;
  authError.value = '';
  try {
    if (mode === 'register')
      await register({
        name: name.value,
        email: email.value,
        password: password.value,
        experienceLevel: experienceLevel.value,
      });
    else await login(email.value, password.value);
    password.value = '';
    await router.push(mode === 'register' ? '/app/settings?setup=1' : '/app');
  } catch (error) {
    authError.value =
      error instanceof LiftUpConnectionError
        ? error.message
        : axios.isAxiosError<{ error: string }>(error)
          ? error.response?.data?.error || 'Could not connect. Try again.'
          : 'Could not sign in. Try again.';
  } finally {
    busy.value = false;
  }
}

const handleRegister = () => submitAuth('register');
const handleLogin = () => submitAuth('login');
</script>

<style scoped>
.auth-error {
  color: var(--text-primary);
  border: 1px solid var(--danger-primary);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-size: 13px;
}
.auth-dialog-card {
  position: relative;
  width: 100%;
  max-width: 460px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 32px 28px 28px;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.6);
  color: var(--text-primary);
}

.close-btn {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface-elevated);
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.auth-header {
  text-align: center;
  margin-bottom: 22px;
}

.auth-logo-badge {
  display: inline-grid;
  width: 44px;
  height: 44px;
  place-items: center;
  background: var(--accent-primary);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
}

.auth-title {
  margin: 0;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--text-primary);
}

.auth-subtitle {
  margin: 6px auto 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
  max-width: 340px;
}

.auth-mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 4px;
  margin-bottom: 22px;
}

.mode-tab {
  padding: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-tab.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.level-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.helper-text {
  font-size: 11px;
  color: var(--text-muted);
}

.level-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 4px;
}

.level-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 10px 6px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-secondary);
}

.level-card:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.level-card.selected {
  background: var(--accent-surface);
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.level-icon {
  font-size: 18px;
  margin-bottom: 4px;
}

.level-card strong {
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
}

.level-card small {
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.2;
}

.submit-btn {
  margin-top: 6px;
  height: 44px;
  font-weight: 800;
  font-size: 14px;
  border-radius: var(--radius-md);
}

.auth-divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 18px 0 14px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--border-subtle);
}

.auth-divider span {
  padding: 0 10px;
}

.guest-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: transparent;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.guest-btn:hover {
  background: var(--bg-surface-elevated);
  color: var(--text-primary);
  border-color: var(--accent-primary);
}
</style>
