import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { createRestChime } from '@/utils/restChime';

const REST_TIMER_STORAGE_KEY = 'gym-tracker-rest-timer';

export type RestTimerState = 'idle' | 'running' | 'paused' | 'complete';

type UseRestTimerOptions = {
  getActiveWorkoutId: () => number | null | undefined;
  onInvalidDuration?: (message: string) => void;
  onVisible?: () => void;
};

export function useRestTimer(options: UseRestTimerOptions) {
  const chime = createRestChime();
  const soundEnabled = ref(
    (() => {
      try {
        return localStorage.getItem('liftup-timer-sound') !== 'off';
      } catch {
        return true;
      }
    })(),
  );
  const soundMessage = ref(
    'Sound plays while this page is running. Tap Test chime to check audio.',
  );
  async function prepareSound() {
    if (soundEnabled.value) await chime.prepare();
  }
  function unlockSound() {
    void prepareSound();
  }
  async function testChime() {
    soundMessage.value =
      (await chime.prepare()) && chime.play()
        ? 'Chime ready. Check your device volume.'
        : 'Audio is unavailable or blocked. The visual timer will still work.';
  }
  function toggleSound() {
    soundEnabled.value = !soundEnabled.value;
    try {
      localStorage.setItem('liftup-timer-sound', soundEnabled.value ? 'on' : 'off');
    } catch {
      /* Optional preference. */
    }
    if (soundEnabled.value) void prepareSound();
  }
  const restDurationSeconds = ref(90);
  const restTimerState = ref<RestTimerState>('idle');
  const restRemainingMs = ref(90000);
  const restEndsAt = ref<number | null>(null);
  const restTimerLabel = computed(() => {
    const seconds = Math.ceil(restRemainingMs.value / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  });

  let restTimerInterval: number | undefined;

  function persistRestTimer() {
    const workoutId = options.getActiveWorkoutId();
    if (!workoutId) return;
    try {
      sessionStorage.setItem(
        REST_TIMER_STORAGE_KEY,
        JSON.stringify({
          workoutId,
          state: restTimerState.value,
          durationSeconds: restDurationSeconds.value,
          remainingMs: restRemainingMs.value,
          endsAt: restEndsAt.value,
        }),
      );
    } catch {
      /* Storage can be disabled; the in-memory timer still works. */
    }
  }

  function clearRestTimerStorage() {
    window.clearInterval(restTimerInterval);
    restTimerInterval = undefined;
    try {
      sessionStorage.removeItem(REST_TIMER_STORAGE_KEY);
    } catch {
      /* Ignore unavailable storage. */
    }
    restTimerState.value = 'idle';
    restRemainingMs.value = Math.max(5, restDurationSeconds.value) * 1000;
    restEndsAt.value = null;
  }

  function tickRestTimer() {
    if (restEndsAt.value === null) return;
    restRemainingMs.value = Math.max(0, restEndsAt.value - Date.now());
    if (restRemainingMs.value <= 0) {
      restTimerState.value = 'complete';
      restEndsAt.value = null;
      window.clearInterval(restTimerInterval);
      restTimerInterval = undefined;
      if (soundEnabled.value && !chime.play())
        soundMessage.value =
          'Rest complete. Tap Test chime to enable audio for your next interval.';
    }
    persistRestTimer();
  }

  function startRestTimer() {
    void prepareSound();
    const seconds = Number(restDurationSeconds.value);
    if (!Number.isFinite(seconds) || seconds < 5 || seconds > 3600) {
      options.onInvalidDuration?.('Rest length must be between 5 seconds and 60 minutes.');
      return;
    }
    window.clearInterval(restTimerInterval);
    restDurationSeconds.value = Math.round(seconds);
    restTimerState.value = 'running';
    restRemainingMs.value = restDurationSeconds.value * 1000;
    restEndsAt.value = Date.now() + restRemainingMs.value;
    persistRestTimer();
    restTimerInterval = window.setInterval(tickRestTimer, 250);
  }

  function pauseRestTimer() {
    tickRestTimer();
    if (restTimerState.value !== 'running') return;
    window.clearInterval(restTimerInterval);
    restTimerInterval = undefined;
    restTimerState.value = 'paused';
    restEndsAt.value = null;
    persistRestTimer();
  }

  function resumeRestTimer() {
    void prepareSound();
    if (restTimerState.value !== 'paused' || restRemainingMs.value <= 0) return;
    restTimerState.value = 'running';
    restEndsAt.value = Date.now() + restRemainingMs.value;
    persistRestTimer();
    restTimerInterval = window.setInterval(tickRestTimer, 250);
  }

  function resetRestTimer() {
    window.clearInterval(restTimerInterval);
    restTimerInterval = undefined;
    restTimerState.value = 'idle';
    restRemainingMs.value = Math.max(5, Number(restDurationSeconds.value) || 90) * 1000;
    restEndsAt.value = null;
    persistRestTimer();
  }

  function restoreRestTimer(workoutId: number) {
    window.clearInterval(restTimerInterval);
    restTimerInterval = undefined;
    const saved: {
      workoutId?: number;
      state?: string;
      durationSeconds?: number;
      remainingMs?: number;
      endsAt?: number | null;
    } | null = (() => {
      try {
        return JSON.parse(sessionStorage.getItem(REST_TIMER_STORAGE_KEY) ?? 'null');
      } catch {
        return null;
      }
    })();
    if (
      !saved ||
      saved.workoutId !== workoutId ||
      !['idle', 'running', 'paused', 'complete'].includes(saved.state ?? '')
    ) {
      clearRestTimerStorage();
      return;
    }
    restDurationSeconds.value = Number.isFinite(saved.durationSeconds)
      ? Math.min(3600, Math.max(5, Math.round(saved.durationSeconds!)))
      : 90;
    restTimerState.value = saved.state as RestTimerState;
    restRemainingMs.value = Number.isFinite(saved.remainingMs)
      ? Math.max(0, saved.remainingMs!)
      : restDurationSeconds.value * 1000;
    restEndsAt.value =
      restTimerState.value === 'running' && Number.isFinite(saved.endsAt) ? saved.endsAt! : null;
    if (restTimerState.value === 'running') {
      if (!restEndsAt.value || restEndsAt.value <= Date.now()) {
        restRemainingMs.value = 0;
        restTimerState.value = 'complete';
        restEndsAt.value = null;
        persistRestTimer();
      } else {
        tickRestTimer();
        restTimerInterval = window.setInterval(tickRestTimer, 250);
      }
    }
  }

  function handleTimerVisibility() {
    if (document.visibilityState === 'visible') {
      if (restTimerState.value === 'running') tickRestTimer();
      options.onVisible?.();
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleTimerVisibility);
    document.addEventListener('pointerdown', unlockSound);
    document.addEventListener('keydown', unlockSound);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleTimerVisibility);
    document.removeEventListener('pointerdown', unlockSound);
    document.removeEventListener('keydown', unlockSound);
    chime.dispose();
    window.clearInterval(restTimerInterval);
  });

  return {
    soundEnabled,
    soundMessage,
    toggleSound,
    testChime,
    restDurationSeconds,
    restTimerState,
    restRemainingMs,
    restTimerLabel,
    startRestTimer,
    pauseRestTimer,
    resumeRestTimer,
    resetRestTimer,
    restoreRestTimer,
    clearRestTimerStorage,
  };
}
