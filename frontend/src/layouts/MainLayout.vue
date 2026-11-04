<template>
  <q-layout view="lHh Lpr lFf" class="main-layout">
    <q-header class="app-header">
      <q-toolbar>
        <RouterLink class="app-brand-link" to="/" aria-label="LiftUp home">
          <div class="brand-mark" aria-hidden="true">
            <LiftUpLogo :size="20" color="#0b0e14" />
          </div>
          <h1 class="brand-title">LIFTUP <span>/</span> OS</h1>
        </RouterLink>

        <span class="workspace-label">Your training log</span>

        <div class="header-actions">
          <q-btn flat no-caps icon="build" label="Tools" class="tools-button">
            <q-menu>
              <q-list style="min-width: 220px">
                <q-item clickable v-close-popup @click="plateCalculatorOpen = true">
                  <q-item-section avatar><q-icon name="calculate" /></q-item-section>
                  <q-item-section>Plate calculator</q-item-section>
                </q-item>
                <q-item clickable v-close-popup to="/app/camera">
                  <q-item-section avatar><q-icon name="videocam" /></q-item-section>
                  <q-item-section
                    >Push-up counter<q-item-label caption
                      >Experimental</q-item-label
                    ></q-item-section
                  >
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
          <!-- Theme Toggle (Dark / Light) -->
          <button
            type="button"
            class="theme-toggle-btn"
            :title="currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            :aria-label="currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            @click="toggleTheme"
          >
            <q-icon :name="currentTheme === 'dark' ? 'light_mode' : 'dark_mode'" size="18px" />
          </button>
          <q-btn
            v-if="currentUser"
            flat
            round
            icon="account_circle"
            aria-label="Account menu"
            class="account-button"
          >
            <q-menu>
              <q-list style="min-width: 220px">
                <q-item
                  ><q-item-section
                    ><q-item-label>{{ currentUser.name }}</q-item-label
                    ><q-item-label caption>{{
                      currentUser.experienceLevel
                    }}</q-item-label></q-item-section
                  ></q-item
                >
                <q-separator />
                <q-item clickable v-close-popup to="/app/settings"
                  ><q-item-section>Account & training settings</q-item-section></q-item
                >
                <q-item clickable v-close-popup @click="handleLogout"
                  ><q-item-section>Log out</q-item-section></q-item
                >
              </q-list>
            </q-menu>
          </q-btn>
          <div v-else class="auth-header-group">
            <button type="button" class="sign-in-link" @click="openLogin">Sign In</button>
            <button type="button" class="register-btn" @click="openRegister">Register</button>
          </div>
        </div>
      </q-toolbar>
    </q-header>

    <aside class="desktop-sidebar">
      <nav class="sidebar-nav" aria-label="Main navigation">
        <button
          class="nav-segment-btn"
          :class="{ active: currentTab === 'workout' }"
          :aria-current="currentTab === 'workout' ? 'page' : undefined"
          @click="navigateTo('workout')"
        >
          <q-icon name="fitness_center" size="16px" class="q-mr-xs" />
          Workout
        </button>
        <button
          class="nav-segment-btn"
          :class="{ active: currentTab === 'plan' }"
          :aria-current="currentTab === 'plan' ? 'page' : undefined"
          @click="navigateTo('plan')"
        >
          <q-icon name="calendar_today" size="16px" class="q-mr-xs" />
          Plan
        </button>
        <button
          class="nav-segment-btn"
          :class="{ active: currentTab === 'library' }"
          :aria-current="currentTab === 'library' ? 'page' : undefined"
          @click="navigateTo('library')"
        >
          <q-icon name="menu_book" size="16px" class="q-mr-xs" />
          Exercises
        </button>
        <button
          class="nav-segment-btn"
          :class="{ active: currentTab === 'history' }"
          :aria-current="currentTab === 'history' ? 'page' : undefined"
          @click="navigateTo('history')"
        >
          <q-icon name="insights" size="16px" class="q-mr-xs" />
          History
        </button>
      </nav>

      <p class="sidebar-caption">Plan your week.<br />Take it one set at a time.</p>
    </aside>

    <q-page-container class="shell-content">
      <!-- Authentication Gate Screen when not logged in -->
      <div v-if="!currentUser" class="auth-gate-screen">
        <div class="auth-gate-card">
          <div class="gate-lock-icon">🔒</div>
          <span class="gate-badge">ATHLETE ACCESS ONLY</span>
          <h3 class="gate-title">Athlete Sign In Required</h3>
          <p class="gate-desc">
            Sign in to keep your workouts, weekly plan and training history together. Create a free
            profile to get started.
          </p>
          <div class="gate-actions-row">
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="Sign In"
              class="gate-main-btn"
              @click="openLogin"
            />
            <q-btn
              outline
              no-caps
              label="Create Account"
              class="gate-main-btn"
              @click="openRegister"
            />
          </div>
        </div>
      </div>
      <router-view v-else />
      <p v-if="logoutError" class="q-pa-md" role="alert">{{ logoutError }}</p>
    </q-page-container>

    <!-- Global Auth Dialog -->
    <AuthDialog />
    <PlateCalculatorDialog v-model="plateCalculatorOpen" />

    <!-- Mobile Bottom Navigation Dock -->
    <nav class="mobile-bottom-dock" aria-label="Mobile navigation">
      <button
        class="dock-item"
        :class="{ active: currentTab === 'workout' }"
        :aria-current="currentTab === 'workout' ? 'page' : undefined"
        @click="navigateTo('workout')"
      >
        <q-icon name="fitness_center" />
        <span>Workout</span>
      </button>
      <button
        class="dock-item"
        :class="{ active: currentTab === 'plan' }"
        :aria-current="currentTab === 'plan' ? 'page' : undefined"
        @click="navigateTo('plan')"
      >
        <q-icon name="calendar_today" />
        <span>Plan</span>
      </button>
      <button
        class="dock-item"
        :class="{ active: currentTab === 'library' }"
        :aria-current="currentTab === 'library' ? 'page' : undefined"
        @click="navigateTo('library')"
      >
        <q-icon name="menu_book" />
        <span>Exercises</span>
      </button>
      <button
        class="dock-item"
        :class="{ active: currentTab === 'history' }"
        :aria-current="currentTab === 'history' ? 'page' : undefined"
        @click="navigateTo('history')"
      >
        <q-icon name="insights" />
        <span>History</span>
      </button>
    </nav>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LiftUpLogo from '@/components/ui/LiftUpLogo.vue';
import AuthDialog from '@/components/ui/AuthDialog.vue';
import PlateCalculatorDialog from '@/components/training/PlateCalculatorDialog.vue';
import { useTheme } from '@/composables/useTheme';
import { useAuth } from '@/composables/useAuth';

const route = useRoute();
const router = useRouter();
const { currentTheme, toggleTheme } = useTheme();
const { currentUser, openLogin, openRegister, logout } = useAuth();
const plateCalculatorOpen = ref(false);

async function handleLogout() {
  try {
    await logout();
    await router.push('/');
  } catch {
    logoutError.value = 'Could not sign out. Check your connection and try again.';
  }
}
const logoutError = ref('');

const currentTab = computed(() => {
  if (route.path.includes('/settings')) return 'settings';
  if (route.path.includes('/camera')) return 'tools';
  if (route.path.includes('/history')) {
    return 'history';
  }
  const tab = route.query.tab as string;
  if (tab === 'plan') return 'plan';
  if (tab === 'library') return 'library';
  return 'workout';
});

function navigateTo(tab: 'workout' | 'plan' | 'library' | 'history') {
  if (tab === 'history') {
    void router.push('/app/history');
  } else {
    void router.push({ path: '/app', query: tab === 'workout' ? {} : { tab } });
  }
}
</script>

<style scoped>
.main-layout {
  min-height: 100dvh;
  background-color: var(--bg-page);
}

.workspace-label {
  flex: 1;
  margin-left: 32px;
  color: var(--text-secondary);
  font-size: 13px;
}

.brand-title {
  line-height: 1.2;
}
.desktop-sidebar {
  position: fixed;
  inset: 64px auto 0 0;
  width: 208px;
  padding: 24px 16px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  z-index: 20;
  display: flex;
  flex-direction: column;
}
.sidebar-nav {
  display: grid;
  gap: 8px;
}
.nav-segment-btn {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 48px;
  padding: 0 16px;
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-align: left;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.nav-segment-btn.active {
  color: var(--accent-primary);
  background: var(--accent-surface);
}
.nav-segment-btn:hover {
  background: var(--bg-surface-hover);
}
.sidebar-caption {
  margin-top: auto;
  padding: 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.tools-button,
.account-button,
.theme-toggle-btn {
  min-width: 44px;
  min-height: 44px;
}
.shell-content {
  padding-left: 208px;
}
.main-layout :deep(.q-toolbar) {
  max-width: none;
}
.nav-segment-btn:focus-visible,
.dock-item:focus-visible,
.theme-toggle-btn:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 3px;
}
.mobile-bottom-dock {
  display: none;
}
@media (max-width: 1023px) {
  .desktop-sidebar,
  .workspace-label {
    display: none;
  }
  .shell-content {
    padding-left: 0;
  }
  .mobile-bottom-dock {
    display: flex;
    justify-content: space-around;
  }
  .shell-content :deep(.q-page) {
    padding-bottom: calc(24px + var(--liftup-bottom-clearance)) !important;
  }
  .main-layout :deep(.q-toolbar) {
    padding: 0 16px;
  }
  .brand-title {
    font-size: 15px;
  }
  .header-actions {
    gap: 4px;
  }
}

.auth-gate-screen {
  min-height: calc(100dvh - 64px);
  display: grid;
  place-items: center;
  padding: 40px 20px;
}

.auth-gate-card {
  max-width: 480px;
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 36px 28px;
  text-align: center;
  box-shadow: var(--card-shadow);
}

.gate-lock-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.gate-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-surface);
  color: var(--accent-primary);
  margin-bottom: 12px;
}

.gate-title {
  margin: 0 0 8px;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
}

.gate-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0 0 24px;
}

.gate-actions-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.gate-main-btn {
  height: 42px;
  font-weight: 700;
  border-radius: var(--radius-md);
}

.gate-guest-btn {
  width: 100%;
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

.gate-guest-btn:hover {
  background: var(--bg-surface-elevated);
  color: var(--text-primary);
  border-color: var(--accent-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.auth-header-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sign-in-link {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  transition: color 0.15s ease;
}

.sign-in-link:hover {
  color: var(--text-primary);
}

.register-btn {
  background: var(--accent-primary);
  color: var(--accent-contrast);
  border: none;
  font-size: 12px;
  font-weight: 800;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  letter-spacing: 0.02em;
  transition: all 0.15s ease;
}

.register-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.user-profile-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 6px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent-primary);
  color: var(--accent-contrast);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
}

.user-info-text {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.user-level-badge {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent-primary);
}

.logout-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  transition: color 0.15s ease;
}

.logout-icon-btn:hover {
  color: var(--danger-primary);
}
</style>
