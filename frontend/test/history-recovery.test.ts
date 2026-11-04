import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import axios from 'axios';
import HistoryPage from '../src/pages/SecondPage.vue';
import { layoutHistory } from './fixtures/workoutLayout';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    isAxiosError: () => false,
  },
}));
const wrappers: ReturnType<typeof shallowMount>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(axios.get).mockImplementation(async (url) => ({
    data:
      url === '/api/v1/workouts'
        ? { workouts: layoutHistory() }
        : url === '/api/v1/records'
          ? { rules: {}, records: [] }
          : url === '/api/v1/progress/exercises'
            ? {
                exercises: [
                  { id: 'incline-bench-press', name: 'Incline Bench Press', targetMuscle: 'Chest' },
                ],
              }
            : String(url).includes('/progress/')
              ? { points: [] }
              : {
                  sessions: 1,
                  completedSets: 1,
                  volumeKg: 450,
                  muscleGroups: [],
                  from: '2026-10-19T00:00:00Z',
                  to: '2026-10-26T00:00:00Z',
                },
  }));
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/history', component: HistoryPage }],
  });
  await router.push('/app/history');
  const wrapper = shallowMount(HistoryPage, {
    global: { plugins: [router], stubs: { 'q-page': { template: '<main><slot /></main>' } } },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
describe('history error recovery', () => {
  it('opens on the workout log and preserves filters when visiting training insights', async () => {
    const wrapper = await render();
    const log = wrapper.get('section[aria-label="Workout log"]');
    const insights = wrapper.get('section[aria-label="Training insights"]');
    expect(log.attributes('style') ?? '').not.toContain('display: none');
    expect(insights.attributes('style')).toContain('display: none');
    const vm = wrapper.vm as unknown as { historySearch: string };
    vm.historySearch = 'No matching workout';
    await wrapper.get('.history-view-switch button:nth-child(2)').trigger('click');
    expect(wrapper.get('.history-view-switch button:nth-child(2)').attributes('aria-pressed')).toBe(
      'true',
    );
    expect(log.attributes('style')).toContain('display: none');
    expect(insights.attributes('style') ?? '').not.toContain('display: none');
    await wrapper.get('.history-view-switch button:first-child').trigger('click');
    expect(log.attributes('style') ?? '').not.toContain('display: none');
    expect(vm.historySearch).toBe('No matching workout');
    expect(wrapper.findAll('.history-entry')).toHaveLength(0);
  });
  it('shows relevant timed and distance records without inventing zero-rep or strength records', async () => {
    const wrapper = await render();
    const vm = wrapper.vm as unknown as {
      records: Array<{
        exerciseId: string;
        exerciseName: string;
        workouts: number;
        targetMuscle: null;
        heaviestLoadKg: number;
        estimatedOneRepMaxKg: null;
        bestReps: number;
        longestSeconds: number;
        farthestMeters: number;
      }>;
    };
    vm.records = [
      {
        exerciseId: 'run',
        exerciseName: 'Run',
        workouts: 1,
        targetMuscle: null,
        heaviestLoadKg: 0,
        estimatedOneRepMaxKg: null,
        bestReps: 0,
        longestSeconds: 120,
        farthestMeters: 500,
      },
    ];
    await flushPromises();
    const records = wrapper.get('.record-list').text();
    expect(records).toContain('120 sec');
    expect(records).toContain('500 m');
    expect(records).not.toContain('0 reps');
    expect(records).not.toContain('EST. 1RM');
  });
  it('keeps history visible when the clearable search emits null', async () => {
    const wrapper = await render();
    const vm = wrapper.vm as unknown as { historySearch: string | null };
    vm.historySearch = 'No matching workout';
    await flushPromises();
    expect(wrapper.findAll('.history-entry')).toHaveLength(0);
    vm.historySearch = null;
    await flushPromises();
    expect(wrapper.findAll('.history-entry')).toHaveLength(1);
  });
  it('preserves the history list and edited note after an action fails', async () => {
    const wrapper = await render();
    const vm = wrapper.vm as unknown as {
      notesDrafts: Record<number, string>;
      saveNotes: (w: unknown) => Promise<void>;
    };
    vm.notesDrafts[9000] = 'Keep this draft';
    vi.mocked(axios.patch).mockRejectedValueOnce(new Error('Disconnected'));
    await vm.saveNotes(layoutHistory()[0]);
    await flushPromises();
    expect(wrapper.findAll('.history-entry')).toHaveLength(1);
    expect(wrapper.find('.history-action-message[role="alert"]').text()).toContain(
      'Your entries are kept here',
    );
    expect(vm.notesDrafts[9000]).toBe('Keep this draft');
    const exportButton = wrapper
      .findAll('q-btn')
      .find((b) => b.attributes('label') === 'Export CSV');
    expect(exportButton?.attributes('disable')).not.toBe('true');
  });
  it('shows a retryable chart error independently from available workout history', async () => {
    const wrapper = await render();
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('Chart unavailable'));
    await (wrapper.vm as unknown as { loadProgress: () => Promise<void> }).loadProgress();
    expect(wrapper.text()).toContain('Could not load this trend');
    expect(wrapper.findAll('.history-entry')).toHaveLength(1);
    expect(wrapper.find('.progress-chart').exists()).toBe(false);
  });
});
