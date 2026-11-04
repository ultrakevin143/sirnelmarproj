import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { calculatePlates } from '../src/utils/plateCalculator';
import { createRestChime } from '../src/utils/restChime';
import { useRestTimer } from '../src/composables/useRestTimer';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('20kg barbell plate calculator', () => {
  it('handles an empty bar and computes exact symmetric plates', () => {
    expect(calculatePlates(20).plates).toEqual([]);
    expect(calculatePlates(100).plates).toEqual([{ weightKg: 20, count: 2 }]);
    expect(calculatePlates(97.5).plates).toEqual([
      { weightKg: 20, count: 1 },
      { weightKg: 10, count: 1 },
      { weightKg: 5, count: 1 },
      { weightKg: 2.5, count: 1 },
      { weightKg: 1.25, count: 1 },
    ]);
    for (let total = 20; total <= 1000; total += 2.5) {
      const result = calculatePlates(total);
      expect(result.error).toBe('');
      expect(
        20 + 2 * result.plates.reduce((sum, item) => sum + item.count * item.weightKg, 0),
      ).toBe(total);
    }
  });
  it('rejects totals below the bar, invalid input and unattainable weights without rounding silently', () => {
    for (const total of [0, 19, NaN, Infinity, 1001, 61, 20.001])
      expect(calculatePlates(total).error).not.toBe('');
  });
});

function mockAudio() {
  const starts = vi.fn();
  const stopped = vi.fn();
  class FakeContext {
    state = 'running';
    currentTime = 10;
    destination = {};
    resume = vi.fn(async () => {});
    close = vi.fn(async () => {});
    createOscillator() {
      return {
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: starts,
        stop: stopped,
        onended: null,
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }
  }
  vi.stubGlobal('AudioContext', FakeContext);
  return { starts, stopped };
}

describe('rest timer chime', () => {
  it('schedules two bounded tones and supports unavailable audio', async () => {
    const audio = mockAudio();
    const chime = createRestChime();
    expect(chime.play()).toBe(false);
    expect(await chime.prepare()).toBe(true);
    expect(chime.play()).toBe(true);
    expect(audio.starts).toHaveBeenCalledTimes(2);
    expect(audio.stopped).toHaveBeenCalledTimes(2);
    chime.dispose();
    vi.stubGlobal('AudioContext', undefined);
    expect(await createRestChime().prepare()).toBe(false);
  });
  it('chimes once at zero, pauses/resumes, and respects mute/reset', async () => {
    vi.useFakeTimers();
    const audio = mockAudio();
    let timer!: ReturnType<typeof useRestTimer>;
    const wrapper = mount(
      defineComponent({
        setup() {
          timer = useRestTimer({ getActiveWorkoutId: () => 7 });
          return () => h('div');
        },
      }),
    );
    timer.restDurationSeconds.value = 5;
    timer.startRestTimer();
    await vi.advanceTimersByTimeAsync(2000);
    timer.pauseRestTimer();
    await vi.advanceTimersByTimeAsync(10000);
    expect(audio.starts).toHaveBeenCalledTimes(0);
    timer.resumeRestTimer();
    await vi.advanceTimersByTimeAsync(3000);
    expect(timer.restTimerLabel.value).toBe('00:00');
    expect(timer.restTimerState.value).toBe('complete');
    expect(audio.starts).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10000);
    expect(audio.starts).toHaveBeenCalledTimes(2);
    timer.toggleSound();
    timer.startRestTimer();
    await vi.advanceTimersByTimeAsync(5000);
    expect(audio.starts).toHaveBeenCalledTimes(2);
    timer.toggleSound();
    timer.startRestTimer();
    timer.resetRestTimer();
    await vi.advanceTimersByTimeAsync(5000);
    expect(audio.starts).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it('does not replay an expired timer restored after reload', () => {
    const audio = mockAudio();
    sessionStorage.setItem(
      'gym-tracker-rest-timer',
      JSON.stringify({
        workoutId: 7,
        state: 'running',
        endsAt: Date.now() - 1000,
        durationSeconds: 5,
      }),
    );
    let timer!: ReturnType<typeof useRestTimer>;
    const wrapper = mount(
      defineComponent({
        setup() {
          timer = useRestTimer({ getActiveWorkoutId: () => 7 });
          return () => h('div');
        },
      }),
    );
    timer.restoreRestTimer(7);
    expect(timer.restTimerState.value).toBe('complete');
    expect(audio.starts).toHaveBeenCalledTimes(0);
    wrapper.unmount();
  });
  it('restoring a running interval repeatedly does not leave duplicate timers', async () => {
    vi.useFakeTimers();
    const audio = mockAudio();
    let timer!: ReturnType<typeof useRestTimer>;
    const wrapper = mount(
      defineComponent({
        setup() {
          timer = useRestTimer({ getActiveWorkoutId: () => 7 });
          return () => h('div');
        },
      }),
    );
    timer.restDurationSeconds.value = 5;
    timer.startRestTimer();
    timer.restoreRestTimer(7);
    timer.restoreRestTimer(7);
    await vi.advanceTimersByTimeAsync(5000);
    expect(audio.starts).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    wrapper.unmount();
  });
});
