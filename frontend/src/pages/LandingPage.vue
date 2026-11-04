<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import SpotlightCard from '@/components/ui/SpotlightCard.vue';
import BorderBeam from '@/components/ui/BorderBeam.vue';
import LiftUpLogo from '@/components/ui/LiftUpLogo.vue';
import AuthDialog from '@/components/ui/AuthDialog.vue';
import { useTheme } from '@/composables/useTheme';
import { useAuth } from '@/composables/useAuth';

const { currentTheme, toggleTheme } = useTheme();
const { currentUser, openLogin, openRegister } = useAuth();

// Safe In-Page Smooth Scroll (Prevents Vue Router hash-mode 404s)
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Interactive Hero 3-frame state
const heroExercises = [
  {
    name: 'Barbell Bench Press',
    slug: 'bench-press',
    focus: 'Chest · Triceps · Front Delts',
    frames: [
      { num: 1, label: '01. Setup & Unrack' },
      { num: 2, label: '02. Controlled Descent' },
      { num: 3, label: '03. Drive & Lockout' },
    ],
  },
  {
    name: 'Barbell Deadlift',
    slug: 'deadlift',
    focus: 'Hamstrings · Glutes · Erectors',
    frames: [
      { num: 1, label: '01. Hip Hinge Setup' },
      { num: 2, label: '02. Midpoint Drive' },
      { num: 3, label: '03. Tall Lockout' },
    ],
  },
  {
    name: 'Overhead Press',
    slug: 'overhead-press',
    focus: 'Shoulders · Triceps · Core',
    frames: [
      { num: 1, label: '01. Front Rack Stance' },
      { num: 2, label: '02. Head Clearance' },
      { num: 3, label: '03. Overhead Lockout' },
    ],
  },
];

const selectedHeroIndex = ref(0);
const activeHeroFrame = ref(2);

function selectHeroExercise(index: number) {
  selectedHeroIndex.value = index;
  activeHeroFrame.value = 2;
}

// Interactive Bento Rest Timer simulation
const demoTimerSeconds = ref(90);
const isDemoTimerRunning = ref(false);
let timerInterval: ReturnType<typeof setInterval> | null = null;

function toggleDemoTimer() {
  if (isDemoTimerRunning.value) {
    if (timerInterval) clearInterval(timerInterval);
    isDemoTimerRunning.value = false;
  } else {
    isDemoTimerRunning.value = true;
    timerInterval = setInterval(() => {
      if (demoTimerSeconds.value > 0) {
        demoTimerSeconds.value -= 1;
      } else {
        demoTimerSeconds.value = 90;
      }
    }, 1000);
  }
}

function adjustDemoTimer(amount: number) {
  demoTimerSeconds.value = Math.max(15, demoTimerSeconds.value + amount);
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Clean up
onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

// Demo Day Selector in Bento 1
const demoDays = [
  { day: 'MON', focus: 'Upper Strength', movements: 5, sets: 18, isRest: false },
  { day: 'TUE', focus: 'Lower Hypertrophy', movements: 4, sets: 16, isRest: false },
  { day: 'WED', focus: 'Rest & Adaptation', movements: 0, sets: 0, isRest: true },
  { day: 'THU', focus: 'Push Volume', movements: 5, sets: 17, isRest: false },
  { day: 'FRI', focus: 'Pull & Core', movements: 5, sets: 18, isRest: false },
  { day: 'SAT', focus: 'Leg Drive', movements: 4, sets: 14, isRest: false },
  { day: 'SUN', focus: 'Active Recovery', movements: 0, sets: 0, isRest: true },
];
const activeDemoDayIndex = ref(0);

// Demo RPE in Bento 2
const selectedDemoRpe = ref(8.5);
</script>

<template>
  <div class="aceternity-landing">
    <!-- Subtle Background Dot Matrix (Aceternity Dot Background) -->
    <div class="dot-matrix-bg" aria-hidden="true" />

    <!-- Top Overhead Spotlight Beam -->
    <div class="hero-spotlight-beam" aria-hidden="true" />

    <!-- FLOATING GLASS PILL NAVIGATION (Linear/Aceternity style) -->
    <header class="floating-nav-container">
      <nav class="floating-nav-pill" aria-label="Main Navigation">
        <RouterLink to="/" class="nav-brand" aria-label="LiftUp home">
          <div class="brand-logo-badge">
            <LiftUpLogo :size="20" color="#0b0e14" />
          </div>
          <span class="brand-text">LIFTUP <i>/</i> OS</span>
          <span class="pulse-indicator" title="Local System Active" />
        </RouterLink>

        <!-- In-page smooth scroll buttons (avoid router hash collision) -->
        <div class="nav-links">
          <button type="button" class="nav-text-btn" @click="scrollToSection('features')">
            Features
          </button>
          <button type="button" class="nav-text-btn" @click="scrollToSection('blueprint-studio')">
            Movement Studio
          </button>
          <button type="button" class="nav-text-btn" @click="scrollToSection('system')">
            Workout logging
          </button>
        </div>

        <div class="nav-actions">
          <!-- Theme Toggle -->
          <button
            type="button"
            class="landing-theme-btn"
            :title="currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            :aria-label="currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            @click="toggleTheme"
          >
            <q-icon :name="currentTheme === 'dark' ? 'light_mode' : 'dark_mode'" size="16px" />
          </button>

          <!-- Account Sign In / Sign Up -->
          <button v-if="!currentUser" type="button" class="nav-auth-btn" @click="openRegister">
            Join Free
          </button>
          <div v-else class="landing-user-badge" @click="openLogin">
            <span class="user-badge-avatar">{{ currentUser.name.slice(0, 1).toUpperCase() }}</span>
            <span class="user-badge-name">{{ currentUser.name }}</span>
          </div>

          <RouterLink to="/app" class="nav-cta-btn">
            Open Tracker <span class="arrow" aria-hidden="true">↗</span>
          </RouterLink>
        </div>
      </nav>
    </header>

    <main id="main-content" class="landing-body">
      <!-- ========================================================
           HERO SECTION: Spotlight, Headline, David Laid Gym Image
           ======================================================== -->
      <section class="landing-hero" aria-labelledby="hero-title">
        <div class="hero-content">
          <!-- Eyebrow Pill -->
          <div class="hero-eyebrow-pill">
            <span class="eyebrow-spark" />
            <span>YOUR PERSONAL TRAINING LOG</span>
            <span class="eyebrow-tag">PLAN · LOG · PROGRESS</span>
          </div>

          <!-- High-Impact Editorial Headline -->
          <h1 id="hero-title" class="hero-headline">
            See your last set.<br />
            <span class="gradient-text">Make the next one count.</span>
          </h1>

          <p class="hero-lead">
            Plan your week, see what you lifted last time, and log your next set. Follow illustrated
            movement guides and keep your training history together.
          </p>

          <!-- Dual Hero CTAs -->
          <div class="hero-cta-group">
            <RouterLink to="/app" class="hero-primary-btn">
              <!-- Border beam animation -->
              <BorderBeam :size="180" :duration="4" color-from="#a3e635" color-to="#4ade80" />
              <span class="btn-label">Open your training log</span>
              <span class="btn-icon-bubble" aria-hidden="true">↗</span>
            </RouterLink>

            <button type="button" class="hero-secondary-btn" @click="scrollToSection('features')">
              <span>Explore the features</span>
              <span class="btn-arrow" aria-hidden="true">↓</span>
            </button>
          </div>

          <!-- Trust / Technical Specs Strip -->
          <div class="hero-specs-strip">
            <div class="spec-item">
              <span class="spec-dot" />
              <span>Saved to your personal account</span>
            </div>
            <div class="spec-item">
              <span class="spec-dot" />
              <span>Illustrated movement guides</span>
            </div>
            <div class="spec-item">
              <span class="spec-dot" />
              <span>Light and dark themes</span>
            </div>
          </div>
        </div>

        <!-- HERO CINEMATIC SHOWCASE (David Laid Gym Hero Image) -->
        <div class="hero-showcase-wrapper">
          <!-- Floating Satellite Micro-Cards -->
          <div class="satellite-badge satellite-top">
            <span class="satellite-icon">⚡</span>
            <div>
              <strong>Your last set, ready</strong>
              <small>Less typing between sets</small>
            </div>
          </div>

          <div class="satellite-badge satellite-bottom">
            <span class="satellite-icon">⏱</span>
            <div>
              <strong>Rest timer</strong>
              <small>Audio + visual alert</small>
            </div>
          </div>

          <!-- Double Bezel Container enclosing David Laid Gym Photo -->
          <div class="double-bezel-outer">
            <div class="double-bezel-inner">
              <div class="hero-gym-poster-container">
                <img
                  src="/images/hero-david-laid.jpg"
                  alt="David Laid training with dumbbells in gym"
                  class="hero-gym-poster"
                  fetchpriority="high"
                />
                <div class="poster-overlay-gradient" />
                <div class="poster-caption-tag">
                  <span class="poster-tag-dot" />
                  <span>THE IRON DOES NOT LIE · LIFTUP ATHLETE TELEMETRY</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================================================
           INTERACTIVE 3-FRAME MOVEMENT STUDIO
           ======================================================== -->
      <section id="blueprint-studio" class="blueprint-studio-section">
        <div class="section-heading-center">
          <p class="section-eyebrow">302 ILLUSTRATED VECTOR GUIDES</p>
          <h2 class="section-title">Zero Form Guesswork In The Rack.</h2>
          <p class="section-subtitle">
            Every movement includes 3 anatomical vector breakdown frames. Interactive form cadence
            designed for real gym progression.
          </p>
        </div>

        <div class="double-bezel-outer studio-bezel">
          <div class="double-bezel-inner">
            <!-- Showcase Toolbar -->
            <div class="showcase-toolbar">
              <div class="exercise-selector-tabs">
                <button
                  v-for="(item, idx) in heroExercises"
                  :key="item.slug"
                  type="button"
                  class="selector-pill"
                  :class="{ 'is-active': selectedHeroIndex === idx }"
                  @click="selectHeroExercise(idx)"
                >
                  {{ item.name }}
                </button>
              </div>
              <div class="showcase-status">
                <span class="live-dot" />
                <span>3-PHASE CADENCE</span>
              </div>
            </div>

            <!-- Main Frame Stage (Always high-contrast blueprint stage) -->
            <div class="frame-stage">
              <div class="stage-image-container">
                <img
                  :src="`/workout-guide/assets/${heroExercises[selectedHeroIndex]?.slug}/frame-${activeHeroFrame}.png`"
                  :alt="`${heroExercises[selectedHeroIndex]?.name} frame ${activeHeroFrame}`"
                  class="stage-main-img"
                  loading="lazy"
                />
                <div class="stage-gradient-overlay" />
              </div>

              <!-- 3-Frame Interactive Selector Strip -->
              <div class="stage-controls">
                <div class="movement-meta">
                  <h4>{{ heroExercises[selectedHeroIndex]?.name }}</h4>
                  <p>{{ heroExercises[selectedHeroIndex]?.focus }}</p>
                </div>

                <div class="frame-pills-row">
                  <button
                    v-for="frame in heroExercises[selectedHeroIndex]?.frames"
                    :key="frame.num"
                    type="button"
                    class="frame-nav-pill"
                    :class="{ 'is-selected': activeHeroFrame === frame.num }"
                    @click="activeHeroFrame = frame.num"
                  >
                    <span class="frame-idx">{{ frame.num }}</span>
                    <span class="frame-label">{{ frame.label }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================================================
           ACETERNITY BENTO GRID: 4 Asymmetrical Interactive Cards
           ======================================================== -->
      <section id="features" class="bento-section" aria-labelledby="bento-title">
        <div class="section-heading-center">
          <p class="section-eyebrow">ENGINEERED FOR PROGRESSION</p>
          <h2 id="bento-title" class="section-title">Structure that gets out of your way.</h2>
          <p class="section-subtitle">
            Every feature is built around the raw physical reality of gym training: fast inputs,
            heavy chalk, and zero tolerance for cluttered nonsense.
          </p>
        </div>

        <div class="bento-grid">
          <!-- BENTO CARD 1: 7-Day Program Split Architecture (Wide 2-col) -->
          <SpotlightCard
            class-name="bento-card bento-wide"
            spotlight-color="rgba(163, 230, 53, 0.15)"
          >
            <div class="bento-content">
              <div class="bento-header">
                <div class="bento-icon-box">📅</div>
                <div>
                  <span class="bento-tag">PROGRAM ARCHITECTURE</span>
                  <h3>7-Day Weekly Cadence</h3>
                </div>
              </div>
              <p class="bento-desc">
                Plan specific muscle focuses, load targets, and movement order for each day of the
                week. Rest days adapt dynamically.
              </p>

              <!-- Interactive Day Previewer -->
              <div class="demo-day-strip">
                <button
                  v-for="(day, dIdx) in demoDays"
                  :key="day.day"
                  type="button"
                  class="demo-day-btn"
                  :class="{ 'is-active': activeDemoDayIndex === dIdx, 'is-rest': day.isRest }"
                  @click="activeDemoDayIndex = dIdx"
                >
                  <span class="d-day">{{ day.day }}</span>
                  <span class="d-indicator" />
                </button>
              </div>

              <div class="demo-day-detail-box">
                <div class="detail-line">
                  <span class="detail-focus">
                    {{
                      demoDays[activeDemoDayIndex]?.isRest
                        ? 'Scheduled Recovery'
                        : demoDays[activeDemoDayIndex]?.focus
                    }}
                  </span>
                  <span class="detail-badge">
                    {{
                      demoDays[activeDemoDayIndex]?.isRest
                        ? 'Active Recovery'
                        : `${demoDays[activeDemoDayIndex]?.movements} Movements · ${demoDays[activeDemoDayIndex]?.sets} Sets`
                    }}
                  </span>
                </div>
              </div>
            </div>
          </SpotlightCard>

          <!-- BENTO CARD 2: Live Rest Timer & Set Telemetry -->
          <SpotlightCard class-name="bento-card" spotlight-color="rgba(56, 189, 248, 0.15)">
            <div class="bento-content">
              <div class="bento-header">
                <div class="bento-icon-box cyan">⏱</div>
                <div>
                  <span class="bento-tag cyan">IN-SESSION TELEMETRY</span>
                  <h3>Rest timer</h3>
                </div>
              </div>
              <p class="bento-desc">
                High-contrast digital countdown with 1-tap increments and effort tracking.
              </p>

              <!-- Working Demo Rest Timer widget -->
              <div class="demo-timer-widget">
                <div class="timer-display-row">
                  <span class="timer-digits tabular-nums">{{ formatTime(demoTimerSeconds) }}</span>
                  <span class="timer-status-badge" :class="{ 'is-running': isDemoTimerRunning }">
                    {{ isDemoTimerRunning ? 'RUNNING' : 'PAUSED' }}
                  </span>
                </div>

                <div class="timer-btn-row">
                  <button type="button" class="mini-timer-adj" @click="adjustDemoTimer(-30)">
                    -30s
                  </button>
                  <button
                    type="button"
                    class="mini-timer-toggle"
                    :class="{ 'is-active': isDemoTimerRunning }"
                    @click="toggleDemoTimer"
                  >
                    {{ isDemoTimerRunning ? 'Pause' : 'Start Timer' }}
                  </button>
                  <button type="button" class="mini-timer-adj" @click="adjustDemoTimer(30)">
                    +30s
                  </button>
                </div>
              </div>

              <!-- Interactive RPE Scale Selector -->
              <div class="demo-rpe-selector">
                <span class="rpe-label">Perceived Effort (RPE):</span>
                <div class="rpe-chips">
                  <button
                    v-for="rpeVal in [7, 8, 8.5, 9, 10]"
                    :key="rpeVal"
                    type="button"
                    class="rpe-chip"
                    :class="{ 'is-selected': selectedDemoRpe === rpeVal }"
                    @click="selectedDemoRpe = rpeVal"
                  >
                    @{{ rpeVal }}
                  </button>
                </div>
              </div>
            </div>
          </SpotlightCard>

          <!-- BENTO CARD 3: 302 Movement Visual Library -->
          <SpotlightCard
            id="library"
            class-name="bento-card"
            spotlight-color="rgba(163, 230, 53, 0.15)"
          >
            <div class="bento-content">
              <div class="bento-header">
                <div class="bento-icon-box">📐</div>
                <div>
                  <span class="bento-tag">302 ILLUSTRATIONS</span>
                  <h3>Zero Guesswork</h3>
                </div>
              </div>
              <p class="bento-desc">
                Every movement includes 3 anatomical vector breakdown frames created by Bryl Lim.
              </p>

              <!-- Mini Exercise Card Preview -->
              <div class="demo-exercise-tile">
                <img
                  src="/workout-guide/assets/deadlift/frame-2.png"
                  alt="Deadlift Midpoint"
                  class="demo-thumb"
                  loading="lazy"
                />
                <div class="demo-exercise-info">
                  <h4>Barbell Deadlift</h4>
                  <p>Target: Hamstrings & Erectors</p>
                  <div class="muscle-tags">
                    <span class="mini-pill">Posterior Chain</span>
                    <span class="mini-pill">Compound</span>
                  </div>
                </div>
              </div>
            </div>
          </SpotlightCard>

          <!-- BENTO CARD 4: Tactical Reliability (Wide 2-col) -->
          <SpotlightCard
            id="system"
            class-name="bento-card bento-wide"
            spotlight-color="rgba(250, 204, 21, 0.15)"
          >
            <div class="bento-content">
              <div class="bento-header">
                <div class="bento-icon-box amber">⚡</div>
                <div>
                  <span class="bento-tag amber">TACTICAL RELIABILITY</span>
                  <h3>Built For Chalked Hands</h3>
                </div>
              </div>
              <p class="bento-desc">
                Enter your weight and reps, complete your set, and let the rest timer run. Your
                logged workouts are stored in your account; unfinished drafts stay on this device.
              </p>

              <!-- Hardware Style Metric Matrix -->
              <div class="spec-matrix-grid">
                <div class="spec-matrix-cell">
                  <span class="matrix-val tabular-nums">KG / LB</span>
                  <span class="matrix-label">Weight Units</span>
                </div>
                <div class="spec-matrix-cell">
                  <span class="matrix-val tabular-nums">302</span>
                  <span class="matrix-label">Movement Guides</span>
                </div>
                <div class="spec-matrix-cell">
                  <span class="matrix-val tabular-nums">YOURS</span>
                  <span class="matrix-label">Personal Training Log</span>
                </div>
                <div class="spec-matrix-cell">
                  <span class="matrix-val tabular-nums">1-Tap</span>
                  <span class="matrix-label">Set Completion</span>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </div>
      </section>

      <!-- ========================================================
           HIGH-IMPACT CLOSING CTA SECTION (Concentric Glow)
           ======================================================== -->
      <section class="closing-cta-section" aria-labelledby="cta-title">
        <div class="concentric-ring-glow" aria-hidden="true" />

        <div class="closing-card">
          <p class="cta-eyebrow">READY TO TAKE CONTROL?</p>
          <h2 id="cta-title" class="cta-title">
            Keep your next session<br />
            <span class="gradient-text">built on the last.</span>
          </h2>
          <p class="cta-subtitle">
            Sign in to keep your weekly program and workout history together in your own account.
          </p>

          <div class="cta-action-wrap">
            <RouterLink to="/app" class="hero-primary-btn cta-large">
              <BorderBeam :size="220" :duration="5" color-from="#a3e635" color-to="#22c55e" />
              <span class="btn-label">Open LiftUp Tracker</span>
              <span class="btn-icon-bubble" aria-hidden="true">↗</span>
            </RouterLink>
          </div>
        </div>
      </section>
    </main>

    <!-- MINIMALIST PRECISION FOOTER -->
    <footer class="landing-footer">
      <div class="footer-inner">
        <div class="footer-left">
          <div class="brand-logo-badge">
            <LiftUpLogo :size="22" color="#0b0e14" />
          </div>
          <div>
            <strong>LIFTUP / OS</strong>
            <p>Made for the days you show up.</p>
          </div>
        </div>
        <div class="footer-right">
          <RouterLink to="/app" class="footer-link">Open Tracker ↗</RouterLink>
          <small class="attribution">Movement illustrations by Bryl Lim · CC BY-SA 4.0</small>
        </div>
      </div>
    </footer>

    <!-- Global Auth Modal -->
    <AuthDialog />
  </div>
</template>

<style scoped>
/* ==========================================================================
   ACETERNITY UI LANDING PAGE STYLING (LIFTUP - STEALTH NIGHT MODE)
   ========================================================================== */

.aceternity-landing {
  position: relative;
  min-height: 100dvh;
  background-color: var(--bg-page);
  color: var(--text-primary);
  font-family:
    'DM Sans',
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  overflow-x: hidden;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  transition:
    background-color 0.25s ease,
    color 0.25s ease;
}

/* Background Dot Matrix Pattern */
.dot-matrix-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1.2px, transparent 1.2px);
  background-size: 26px 26px;
  mask-image: radial-gradient(ellipse 75% 65% at 50% 25%, #000 45%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 75% 65% at 50% 25%, #000 45%, transparent 100%);
  z-index: 0;
}

:root[data-theme='light'] .dot-matrix-bg {
  background-image: radial-gradient(rgba(0, 0, 0, 0.06) 1.2px, transparent 1.2px);
}

/* Overhead Spotlight Beam */
.hero-spotlight-beam {
  position: absolute;
  top: -120px;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 550px;
  pointer-events: none;
  background: radial-gradient(
    ellipse 60% 50% at 50% 10%,
    var(--accent-surface),
    rgba(56, 189, 248, 0.05) 50%,
    transparent 80%
  );
  filter: blur(48px);
  z-index: 1;
}

/* Floating Glass Pill Navigation */
.floating-nav-container {
  position: fixed;
  top: 1.25rem;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 50;
  padding: 0 1rem;
}

.floating-nav-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  width: 100%;
  max-width: 980px;
  padding: 0.65rem 1.2rem;
  background: var(--header-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  box-shadow: var(--card-shadow);
  color: var(--text-primary);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  text-decoration: none;
  color: var(--text-primary);
}

.brand-logo-badge {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  background: var(--accent-primary);
  border-radius: 8px;
  box-shadow: 0 0 12px var(--accent-surface);
}

.brand-text {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 900;
  font-size: 1.05rem;
  letter-spacing: 0.12em;
  color: var(--text-primary);
}

.brand-text i {
  color: var(--text-muted);
  font-style: normal;
  padding: 0 0.15rem;
}

.pulse-indicator {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: var(--accent-primary);
  box-shadow: 0 0 10px var(--accent-primary);
  animation: pulse-glow 2s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.nav-text-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: color 0.2s ease;
}

.nav-text-btn:hover {
  color: var(--text-primary);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
}

.nav-auth-btn,
.nav-cta-btn,
.landing-theme-btn {
  flex-shrink: 0;
  white-space: nowrap;
  min-height: 40px;
}

.nav-auth-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.landing-theme-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 9999px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.landing-theme-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.nav-auth-btn {
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: 9999px;
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.45rem 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-auth-btn:hover {
  background: var(--bg-surface-hover);
  border-color: var(--accent-primary);
}

.landing-user-badge {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.75rem 0.3rem 0.4rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  cursor: pointer;
}

.user-badge-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-primary);
  color: var(--accent-contrast);
  font-size: 10px;
  font-weight: 800;
  display: grid;
  place-items: center;
}

.user-badge-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-primary);
}

.nav-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 1rem;
  background: var(--accent-primary);
  color: var(--accent-contrast);
  border-radius: 9999px;
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 800;
  transition: all 0.25s cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: 0 2px 10px var(--accent-surface);
}

.nav-cta-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
}

.landing-body {
  position: relative;
  z-index: 2;
  max-width: 1240px;
  margin: 0 auto;
  padding: 8rem 1.5rem 4rem;
}

/* ==========================================================================
   HERO SECTION
   ========================================================================== */

.landing-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 7rem;
}

.hero-content {
  max-width: 820px;
  margin: 0 auto;
}

.hero-eyebrow-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.9rem;
  background: var(--accent-surface);
  border: 1px solid var(--accent-border);
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: var(--accent-primary);
  margin-bottom: 1.75rem;
}

.eyebrow-spark {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--accent-primary);
  box-shadow: 0 0 8px #a3e635;
}

.eyebrow-tag {
  background: var(--accent-surface);
  color: var(--accent-primary);
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  font-size: 0.65rem;
  font-weight: 800;
}

.hero-headline {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: clamp(3.2rem, 7.5vw, 6.2rem);
  font-weight: 900;
  line-height: 0.95;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin: 0 0 1.5rem;
  color: var(--text-primary);
}

.gradient-text {
  color: var(--accent-primary);
  display: inline-block;
}

.hero-lead {
  font-size: clamp(1rem, 2vw, 1.2rem);
  color: var(--text-secondary);
  max-width: 680px;
  margin: 0 auto 2.5rem;
  line-height: 1.65;
}

.hero-cta-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  flex-wrap: wrap;
  margin-bottom: 3rem;
}

/* Primary Hero Button with BorderBeam */
.hero-primary-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.95rem 1.65rem;
  background: #11151f;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  color: #f8fafc;
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 800;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: 0 10px 25px -8px rgba(0, 0, 0, 0.7);
}

.hero-primary-btn:hover {
  background: #171d2b;
  border-color: rgba(163, 230, 53, 0.4);
  transform: translateY(-2px);
  box-shadow: 0 15px 30px -8px rgba(163, 230, 53, 0.25);
}

.btn-icon-bubble {
  display: grid;
  place-items: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 9999px;
  background: #a3e635;
  color: #0b0e14;
  font-weight: 800;
  font-size: 0.95rem;
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}

.hero-primary-btn:hover .btn-icon-bubble {
  transform: translate(2px, -2px);
}

.hero-secondary-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.95rem 1.65rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 9999px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 700;
  transition: all 0.2s ease;
}

.hero-secondary-btn:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
  border-color: var(--accent-primary);
}

.hero-specs-strip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.spec-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.spec-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: #a3e635;
}

/* ==========================================================================
   HERO SHOWCASE (David Laid Gym Poster with Satellite Badges)
   ========================================================================== */

.hero-showcase-wrapper {
  position: relative;
  width: 100%;
  max-width: 980px;
  margin-top: 3.5rem;
}

.satellite-badge {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.15rem;
  background: var(--bg-surface);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  box-shadow: var(--card-shadow);
  z-index: 10;
  text-align: left;
}

.satellite-top {
  top: 1.25rem;
  left: 1.25rem;
}

.satellite-bottom {
  top: 1.25rem;
  right: 1.25rem;
}

.satellite-icon {
  font-size: 1.35rem;
}

.satellite-badge strong {
  display: block;
  font-size: 0.82rem;
  color: var(--text-primary);
  font-weight: 800;
}

.satellite-badge small {
  display: block;
  font-size: 0.72rem;
  color: var(--text-secondary);
}

/* Double Bezel Structure */
.double-bezel-outer {
  padding: 8px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  box-shadow: var(--card-shadow);
}

.double-bezel-inner {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  overflow: hidden;
}

.hero-gym-poster-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 520px;
  overflow: hidden;
  background: var(--bg-page);
}

.hero-gym-poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
  display: block;
  filter: contrast(1.05) brightness(0.95);
  transition: transform 0.6s cubic-bezier(0.32, 0.72, 0, 1);
}

.hero-showcase-wrapper:hover .hero-gym-poster {
  transform: scale(1.02);
}

.poster-overlay-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(11, 14, 20, 0.85) 0%,
    rgba(11, 14, 20, 0.1) 40%,
    transparent 100%
  );
  pointer-events: none;
}

.poster-caption-tag {
  position: absolute;
  bottom: 1.25rem;
  left: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.85rem;
  background: var(--header-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-strong);
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--accent-primary);
}

.poster-tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--accent-primary);
  box-shadow: 0 0 8px var(--accent-primary);
}

/* ==========================================================================
   BLUEPRINT MOVEMENT STUDIO
   ========================================================================== */

.blueprint-studio-section {
  margin: 6rem auto 8rem;
  max-width: 980px;
}

.studio-bezel {
  margin-top: 2.5rem;
}

.showcase-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  flex-wrap: wrap;
  gap: 1rem;
}

.exercise-selector-tabs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.selector-pill {
  padding: 0.4rem 0.95rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.selector-pill:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.selector-pill.is-active {
  background: var(--accent-surface);
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}

.showcase-status {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-primary);
}

.frame-stage {
  padding: 2rem;
  background: var(--bg-surface);
}

.stage-image-container {
  position: relative;
  height: 380px;
  display: grid;
  place-items: center;
  background: var(--art-stage-bg);
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--art-stage-border);
}

.stage-main-img {
  max-height: 340px;
  max-width: 90%;
  object-fit: contain;
  transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
  filter: drop-shadow(0 15px 25px rgba(0, 0, 0, 0.6));
}

.stage-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1.5rem;
  gap: 1.5rem;
  flex-wrap: wrap;
  text-align: left;
}

.movement-meta h4 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--text-primary);
}

.movement-meta p {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.frame-pills-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.frame-nav-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.9rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 700;
  transition: all 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

.frame-nav-pill:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.frame-nav-pill.is-selected {
  background: var(--accent-primary);
  color: var(--accent-contrast);
  border-color: var(--accent-primary);
  box-shadow: 0 4px 15px var(--accent-surface);
}

.frame-idx {
  font-family: monospace;
  font-weight: 800;
}

/* ==========================================================================
   ACETERNITY BENTO GRID (Theme Adaptive - 100% High Contrast)
   ========================================================================== */

.bento-section {
  margin-bottom: 8rem;
}

.section-heading-center {
  text-align: center;
  max-width: 680px;
  margin: 0 auto 3.5rem;
}

.section-eyebrow {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--accent-primary);
  margin-bottom: 0.75rem;
}

.section-title {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: clamp(2.2rem, 4.5vw, 3.8rem);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin: 0 0 1rem;
  color: var(--text-primary);
}

.section-subtitle {
  font-size: 1.05rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.bento-wide {
  grid-column: span 2;
}

.bento-card {
  padding: 2rem;
  border-radius: 20px !important;
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-subtle) !important;
  color: var(--text-primary) !important;
}

.bento-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.bento-icon-box {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 12px;
  background: rgba(163, 230, 53, 0.14);
  border: 1px solid rgba(163, 230, 53, 0.35);
  color: #a3e635;
  font-size: 1.25rem;
}

.bento-icon-box.cyan {
  background: rgba(56, 189, 248, 0.14);
  border-color: rgba(56, 189, 248, 0.35);
  color: #38bdf8;
}

.bento-icon-box.amber {
  background: rgba(250, 204, 21, 0.14);
  border-color: rgba(250, 204, 21, 0.35);
  color: #facc15;
}

.bento-tag {
  display: block;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #a3e635;
  margin-bottom: 0.2rem;
}

.bento-tag.cyan {
  color: #38bdf8;
}

.bento-tag.amber {
  color: #facc15;
}

.bento-header h3 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: #f8fafc;
}

.bento-desc {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
  line-height: 1.55;
}

/* Bento 1: Day Strip */
.demo-day-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.demo-day-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.75rem 0.25rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.demo-day-btn:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.demo-day-btn.is-active {
  background: var(--accent-surface);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.d-day {
  font-size: 0.75rem;
  font-weight: 800;
}

.d-indicator {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--accent-primary);
}

.demo-day-btn.is-rest .d-indicator {
  background: var(--text-muted);
}

.demo-day-detail-box {
  padding: 0.85rem 1.25rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
}

.detail-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.detail-focus {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-primary);
}

.detail-badge {
  font-size: 0.75rem;
  color: var(--accent-primary);
  background: var(--accent-surface);
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-weight: 700;
}

/* Bento 2: Rest Timer */
.demo-timer-widget {
  padding: 1.25rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  margin-bottom: 1.25rem;
}

.timer-display-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.timer-digits {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 3.2rem;
  font-weight: 900;
  line-height: 1;
  color: #38bdf8;
  text-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
}

.timer-status-badge {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.timer-status-badge.is-running {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.35);
}

.timer-btn-row {
  display: flex;
  gap: 0.5rem;
}

.mini-timer-adj {
  flex: 1;
  padding: 0.45rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mini-timer-adj:hover {
  border-color: var(--border-strong);
}

.mini-timer-toggle {
  flex: 2;
  padding: 0.45rem;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 8px;
  color: #38bdf8;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mini-timer-toggle.is-active {
  background: #38bdf8;
  color: #0b0e14;
}

.demo-rpe-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.rpe-label {
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-weight: 700;
}

.rpe-chips {
  display: flex;
  gap: 0.35rem;
}

.rpe-chip {
  padding: 0.2rem 0.55rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
}

.rpe-chip.is-selected {
  background: var(--accent-surface);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

/* Bento 3: Movement Library Preview */
.demo-exercise-tile {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.25rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
}

.demo-thumb {
  width: 90px;
  height: 90px;
  object-fit: contain;
  background: var(--art-stage-bg);
  border: 1px solid var(--art-stage-border);
  border-radius: 10px;
  padding: 6px;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5));
}

.demo-exercise-info h4 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-primary);
}

.demo-exercise-info p {
  margin: 0.25rem 0 0.65rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.muscle-tags {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.mini-pill {
  font-size: 0.68rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-weight: 700;
}

/* Bento 4: Spec Matrix Grid */
.spec-matrix-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.spec-matrix-cell {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 1.25rem 1rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  text-align: center;
}

.matrix-val {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 1.85rem;
  font-weight: 900;
  color: #facc15;
  line-height: 1;
}

.matrix-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* ==========================================================================
   CLOSING CTA SECTION
   ========================================================================== */

.closing-cta-section {
  position: relative;
  text-align: center;
  padding: 6rem 1rem 4rem;
  overflow: hidden;
}

.concentric-ring-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 680px;
  height: 680px;
  border-radius: 9999px;
  pointer-events: none;
  background: radial-gradient(
    circle,
    var(--accent-surface) 0%,
    rgba(163, 230, 53, 0.03) 40%,
    transparent 70%
  );
  filter: blur(50px);
}

.closing-card {
  position: relative;
  z-index: 2;
  max-width: 720px;
  margin: 0 auto;
}

.cta-eyebrow {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--accent-primary);
  margin-bottom: 0.75rem;
}

.cta-title {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: clamp(2.8rem, 6vw, 4.8rem);
  font-weight: 900;
  line-height: 0.98;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin: 0 0 1.25rem;
  color: var(--text-primary);
}

.cta-subtitle {
  font-size: 1.1rem;
  color: var(--text-secondary);
  max-width: 540px;
  margin: 0 auto 2.5rem;
}

.cta-large {
  padding: 1.15rem 2.5rem;
  font-size: 1.05rem;
}

/* ==========================================================================
   MINIMALIST FOOTER
   ========================================================================== */

.landing-footer {
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-page);
  padding: 3rem 1.5rem;
  position: relative;
  z-index: 2;
  color: var(--text-primary);
}

.footer-inner {
  max-width: 1240px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.footer-left strong {
  display: block;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 1.05rem;
  letter-spacing: 0.1em;
  color: var(--text-primary);
}

.footer-left p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.footer-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
}

.footer-link {
  color: #a3e635;
  text-decoration: none;
  font-weight: 800;
  font-size: 0.9rem;
  transition: opacity 0.2s ease;
}

.footer-link:hover {
  opacity: 0.8;
}

.attribution {
  font-size: 0.72rem;
  color: #738294;
}

/* ==========================================================================
   RESPONSIVE ADAPTATIONS
   ========================================================================== */

@media (max-width: 992px) {
  .bento-grid {
    grid-template-columns: 1fr;
  }
  .bento-wide {
    grid-column: span 1;
  }
  .satellite-badge {
    display: none;
  }
  .spec-matrix-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 920px) {
  .nav-links {
    display: none;
  }
}

@media (max-width: 540px) {
  .floating-nav-container {
    padding: 0 12px;
    top: 12px;
  }
  .floating-nav-pill {
    gap: 8px;
    padding: 8px 10px;
  }
  .nav-brand {
    flex-shrink: 0;
  }
  .nav-brand .brand-text,
  .nav-brand .pulse-indicator {
    display: none;
  }
  .nav-auth-btn {
    padding: 0 10px;
    font-size: 12px;
  }
  .nav-cta-btn {
    padding: 0 10px;
    font-size: 12px;
  }
  .landing-user-badge {
    width: 36px;
    height: 40px;
    padding: 0;
    justify-content: center;
  }
  .landing-user-badge .user-badge-name {
    display: none;
  }
}

@media (max-width: 768px) {
  .landing-body {
    padding: 6.5rem 1rem 3rem;
  }
  .stage-image-container {
    height: 260px;
  }
  .stage-main-img {
    max-height: 220px;
  }
  .demo-day-strip {
    grid-template-columns: repeat(4, 1fr);
  }
  .demo-rpe-selector {
    flex-direction: column;
    align-items: flex-start;
  }
  .footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }
  .footer-right {
    align-items: flex-start;
  }
}
</style>
