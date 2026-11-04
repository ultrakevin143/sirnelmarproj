import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import axios from 'axios';
import IndexPage from '../src/pages/IndexPage.vue';
import ActiveWorkoutList from '../src/components/training/ActiveWorkoutList.vue';
import SessionBar from '../src/components/training/SessionBar.vue';
import { layoutHistory, layoutPlan, layoutSession } from './fixtures/workoutLayout';
import type { LoggedSet } from '../src/types/workout';

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), isAxiosError: () => false },
}));
vi.mock('../src/composables/useAuth', async () => {
  const { ref } = await import('vue');
  return {
    useAuth: () => ({ isBeginner: ref(false), currentUser: ref({ id: 'draft-test-account' }) }),
  };
});
vi.mock('../src/composables/useRestTimer', async () => {
  const { ref } = await import('vue');
  return {
    useRestTimer: () => ({
      soundEnabled: ref(false),
      soundMessage: ref(''),
      restDurationSeconds: ref(90),
      restTimerState: ref('idle'),
      restTimerLabel: ref('01:30'),
      toggleSound: vi.fn(),
      testChime: vi.fn(),
      startRestTimer: vi.fn(),
      pauseRestTimer: vi.fn(),
      resumeRestTimer: vi.fn(),
      resetRestTimer: vi.fn(),
      restoreRestTimer: vi.fn(),
      clearRestTimerStorage: vi.fn(),
    }),
  };
});

let server = layoutSession();
const wrappers: ReturnType<typeof shallowMount>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  server = layoutSession();
  vi.mocked(axios.get).mockImplementation(async (url) => ({
    data:
      url === '/api/v1/plans/default'
        ? { plan: layoutPlan() }
        : url === '/api/v1/workouts'
          ? { workouts: layoutHistory() }
          : { exercises: [] },
  }));
  vi.mocked(axios.post).mockResolvedValue({ data: { session: structuredClone(server) } });
  vi.mocked(axios.patch).mockImplementation(async (url, payload) => {
    const id = Number(String(url).split('/').pop());
    const set = server.exercises.flatMap((item) => item.sets).find((item) => item.id === id)!;
    Object.assign(set, payload);
    return { data: { session: structuredClone(server) } };
  });
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

async function renderPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app', component: IndexPage }],
  });
  await router.push('/app');
  const wrapper = shallowMount(IndexPage, {
    global: {
      plugins: [router],
      stubs: {
        'q-page': { template: '<main><slot /></main>' },
        'q-banner': { template: '<div><slot /></div>' },
      },
    },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe('workout page layout integration with mocked API', () => {
  it('keeps a note typed while an earlier note save is in flight', async () => {
    const wrapper = await renderPage();
    const active = wrapper.getComponent(ActiveWorkoutList);
    let finishSave!: (value: { data: { session: ReturnType<typeof layoutSession> } }) => void;
    vi.mocked(axios.patch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );
    active.vm.$emit('update:sessionNotesDraft', 'First version');
    active.vm.$emit('saveNotes');
    await flushPromises();
    active.vm.$emit('update:sessionNotesDraft', 'Newer version');
    await flushPromises();
    finishSave({ data: { session: { ...structuredClone(server), notes: 'First version' } } });
    await flushPromises();
    expect(active.props('sessionNotesDraft')).toBe('Newer version');
  });
  it('restores account-scoped notes, set edits and new-set inputs after remount', async () => {
    const wrapper = await renderPage();
    const active = wrapper.getComponent(ActiveWorkoutList);
    Object.assign(active.props('draftFor')(102), { weightKg: 23, reps: 11 });
    Object.assign(active.props('draftForSet')(active.props('exercises')[0]!.sets[0]!), {
      weightKg: 41,
      reps: 12,
    });
    active.vm.$emit('update:sessionNotesDraft', 'Keep this unfinished note');
    active.vm.$emit('update:effortDraft', 8);
    await flushPromises();
    wrapper.unmount();
    const second = await renderPage();
    const restored = second.getComponent(ActiveWorkoutList);
    expect(restored.props('sessionNotesDraft')).toBe('Keep this unfinished note');
    expect(restored.props('effortDraft')).toBe(8);
    expect(restored.props('draftFor')(102)).toEqual({ weightKg: 23, reps: 11 });
    expect(restored.props('draftForSet')(restored.props('exercises')[0]!.sets[0]!)).toEqual({
      weightKg: 41,
      reps: 12,
    });
  });
  it('saving notes does not replace an independently edited effort value', async () => {
    const wrapper = await renderPage();
    const active = wrapper.getComponent(ActiveWorkoutList);
    active.vm.$emit('update:effortDraft', 9);
    active.vm.$emit('update:sessionNotesDraft', 'Saved note');
    vi.mocked(axios.patch).mockResolvedValueOnce({
      data: { session: { ...structuredClone(server), notes: 'Saved note' } },
    });
    active.vm.$emit('saveNotes');
    await flushPromises();
    expect(active.props('effortDraft')).toBe(9);
    expect(active.props('sessionNotesDraft')).toBe('Saved note');
  });
  it('opens a finish review before any finish request and submits notes, effort and edited sets together', async () => {
    const wrapper = await renderPage();
    const active = wrapper.getComponent(ActiveWorkoutList);
    active.vm.$emit('update:sessionNotesDraft', 'Final notes');
    active.vm.$emit('update:effortDraft', 7);
    const set = active.props('exercises')[0]!.sets[0]!;
    Object.assign(active.props('draftForSet')(set), { weightKg: 45, reps: 10 });
    wrapper.getComponent(SessionBar).vm.$emit('finish');
    await flushPromises();
    expect(vi.mocked(axios.post).mock.calls.some(([url]) => String(url).endsWith('/finish'))).toBe(
      false,
    );
    const vm = wrapper.vm as unknown as { finishSession: () => Promise<void> };
    await vm.finishSession();
    expect(axios.post).toHaveBeenCalledWith('/api/v1/workouts/9001/finish', {
      notes: 'Final notes',
      perceivedEffort: 7,
      setChanges: [{ id: 501, weightKg: 45, reps: 10 }],
    });
  });
  it('passes actual prior performance and removes the always-visible utility row', async () => {
    const wrapper = await renderPage();
    expect(wrapper.find('.training-utility-row').exists()).toBe(false);
    expect(
      wrapper.getComponent(ActiveWorkoutList).props('suggestions')?.['incline-bench-press']?.last
        ?.weightKg,
    ).toBe(37.5);
  });
  it('saving one set preserves another set edit and another movement draft', async () => {
    const wrapper = await renderPage();
    const active = wrapper.getComponent(ActiveWorkoutList);
    const draftFor = active.props('draftFor');
    const draftForSet = active.props('draftForSet');
    const sets = active.props('exercises')[0]!.sets as LoggedSet[];
    Object.assign(draftForSet(sets[0]!), { weightKg: 42.5, reps: 12 });
    Object.assign(draftForSet(sets[1]!), { weightKg: 47.5, reps: 9 });
    Object.assign(draftFor(102), { weightKg: 25, reps: 8 });
    active.vm.$emit('saveSet', 101, sets[0]);
    await flushPromises();
    expect(axios.patch).toHaveBeenCalledWith('/api/v1/workouts/9001/sets/501', {
      weightKg: 42.5,
      reps: 12,
    });
    expect(draftForSet(sets[1]!)).toEqual({ weightKg: 47.5, reps: 9 });
    expect(draftFor(102)).toEqual({ weightKg: 25, reps: 8 });
    expect(active.props('setDraftChanged')(active.props('exercises')[0]!.sets[0]!)).toBe(false);
  });
  it('preserves entries after API failure and keeps logging available for retry', async () => {
    const wrapper = await renderPage();
    const active = wrapper.getComponent(ActiveWorkoutList);
    Object.assign(active.props('draftFor')(102), { weightKg: 22.5, reps: 10 });
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('Offline'));
    active.vm.$emit('logSet', 102, 'working', null, null);
    await flushPromises();
    expect(active.props('draftFor')(102)).toEqual({ weightKg: 22.5, reps: 10 });
    expect(active.props('sessionBusy')).toBe(false);
    expect(wrapper.text()).toContain('Could not log this set.');
  });
});
