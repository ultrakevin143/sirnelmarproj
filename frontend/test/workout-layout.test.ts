import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import ActiveWorkoutList from '../src/components/training/ActiveWorkoutList.vue';
import RestTimerPanel from '../src/components/training/RestTimerPanel.vue';
import { buildPreviousPerformances } from '../src/utils/workoutLayout';
import { layoutHistory, layoutSession } from './fixtures/workoutLayout';

const input = defineComponent({
  props: ['modelValue', 'disable'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" :disabled="disable" @input="$emit(\'update:modelValue\', $event.target.value === \'\' ? null : Number($event.target.value))" />',
});
const button = defineComponent({
  props: ['label', 'type', 'disable', 'loading'],
  template:
    '<button :type="type || \'button\'" :disabled="disable || loading">{{ label }}<slot /></button>',
});
const stubs = {
  'q-input': input,
  'q-select': input,
  'q-btn': button,
  'q-icon': true,
  'q-checkbox': defineComponent({
    props: ['modelValue', 'disable'],
    emits: ['update:modelValue'],
    template:
      '<input type="checkbox" :checked="modelValue" :disabled="disable" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  }),
  'q-menu': { template: '<div><slot /></div>' },
  'q-list': { template: '<div><slot /></div>' },
  'q-item': { template: '<button type="button"><slot /></button>' },
  'q-item-section': { template: '<span><slot /></span>' },
};
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  vi.restoreAllMocks();
});

function render() {
  const drafts = reactive<Record<number, { weightKg: number | null; reps: number | null }>>({
    101: { weightKg: 40, reps: 10 },
    102: { weightKg: 20, reps: 8 },
  });
  const setDrafts = reactive<Record<number, { weightKg: number | null; reps: number | null }>>({});
  const wrapper = mount(ActiveWorkoutList, {
    props: {
      exercises: layoutSession().exercises,
      sessionBusy: false,
      restTimerState: 'idle',
      restTimerLabel: '01:30',
      soundEnabled: true,
      soundMessage: '',
      restDurationSeconds: 90,
      sessionNotesDraft: '',
      effortDraft: null,
      notesSavedValue: '',
      effortSavedValue: null,
      detailBusy: null,
      effortOptions: [],
      suggestions: buildPreviousPerformances(layoutHistory()),
      getExerciseImage: (slug) => `/workout-guide/assets/${slug}/frame-1.png`,
      draftFor: (id) => (drafts[id] ??= { weightKg: null, reps: 8 }),
      draftForSet: (set) => (setDrafts[set.id] ??= { weightKg: set.weightKg, reps: set.reps }),
      setDraftChanged: (set) =>
        !!setDrafts[set.id] &&
        (setDrafts[set.id]!.weightKg !== set.weightKg || setDrafts[set.id]!.reps !== set.reps),
    },
    global: { stubs, directives: { 'close-popup': {} } },
  });
  wrappers.push(wrapper);
  return { wrapper, drafts };
}

describe('focused workout layout', () => {
  it('shows one movement, preserves drafts while switching, and keeps notes optional', async () => {
    const { wrapper, drafts } = render();
    expect(wrapper.findAll('.workout-exercise')).toHaveLength(1);
    expect(wrapper.get('.movement-title').text()).toContain('Incline Bench Press');
    expect(wrapper.get('.session-notes-disclosure').attributes('open')).toBeUndefined();
    drafts[101]!.weightKg = 55;
    await wrapper.findAll('.movement-queue button')[1]!.trigger('click');
    expect(wrapper.get('.movement-title').text()).toContain('Shoulder Press');
    await wrapper.findAll('.movement-queue button')[0]!.trigger('click');
    expect(drafts[101]!.weightKg).toBe(55);
  });
  it('uses real previous performance and completes the pending set rather than duplicating it', async () => {
    const { wrapper, drafts } = render();
    await wrapper.get('.previous-performance button').trigger('click');
    expect(drafts[101]).toEqual({ weightKg: 37.5, reps: 12 });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('toggleSet')?.[0]?.[0]).toBe(101);
    expect(wrapper.emitted('toggleSet')?.[0]?.[1]).toMatchObject({ id: 502 });
    expect(wrapper.emitted('toggleSet')?.[0]?.[2]).toBe(true);
    expect(wrapper.emitted('logSet')).toBeUndefined();
  });
  it('preserves cardio entries on failure and clears them only after a new returned set', async () => {
    const { wrapper } = render();
    await wrapper.get('input[aria-label="Duration minutes"]').setValue('2');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('logSet')?.[0]).toEqual([101, 'working', 120, null]);
    await wrapper.setProps({ sessionBusy: true });
    await wrapper.setProps({ sessionBusy: false });
    expect(
      (wrapper.get('input[aria-label="Duration minutes"]').element as HTMLInputElement).value,
    ).toBe('2');
    const next = layoutSession().exercises;
    next[0]!.sets.push({ ...next[0]!.sets[0]!, id: 503, setNumber: 3 });
    await wrapper.setProps({ exercises: next });
    expect(
      (wrapper.get('input[aria-label="Duration minutes"]').element as HTMLInputElement).value,
    ).toBe('');
    expect(wrapper.get('.movement-title').text()).toContain('Incline Bench Press');
  });
  it('keeps editing, completion, timer, calculator and add-movement actions available', async () => {
    const { wrapper } = render();
    const edit = wrapper.findAll('button').find((b) => b.text() === 'Edit weight / reps')!;
    await edit.trigger('click');
    expect(wrapper.find('.set-edit-actions').exists()).toBe(true);
    await wrapper.get('input[type="checkbox"]').setValue(false);
    expect(wrapper.emitted('toggleSet')?.[0]?.[2]).toBe(false);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Plate calculator')!
      .trigger('click');
    expect(wrapper.emitted('openCalculator')).toHaveLength(1);
    await wrapper.get('.add-movement-btn').trigger('click');
    expect(wrapper.emitted('addMovement')).toHaveLength(1);
    wrapper.getComponent(RestTimerPanel).vm.$emit('start');
    await flushPromises();
    expect(wrapper.emitted('startTimer')).toHaveLength(1);
  });
  it('requires confirmation before deleting a set', async () => {
    const { wrapper } = render();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const remove = wrapper.findAll('button').find((b) => b.text() === 'Delete set')!;
    await remove.trigger('click');
    expect(wrapper.emitted('deleteSet')).toBeUndefined();
    confirm.mockReturnValue(true);
    await remove.trigger('click');
    expect(wrapper.emitted('deleteSet')?.[0]).toEqual([101, 501]);
  });
});

describe('previous performance', () => {
  it('ignores active, abandoned, incomplete and warmup sets; uses the latest completed workout', () => {
    const old = layoutHistory()[0]!;
    const newer = structuredClone(old);
    newer.id = 9100;
    newer.completedAt = '2026-10-19T07:00:00Z';
    newer.exercises[0]!.sets[0]!.weightKg = 45;
    newer.exercises[0]!.sets.push({
      ...newer.exercises[0]!.sets[0]!,
      id: 999,
      weightKg: 80,
      setType: 'warmup',
    });
    const abandoned = structuredClone(newer);
    abandoned.id = 9200;
    abandoned.completedAt = '2026-10-20T07:00:00Z';
    abandoned.abandonedAt = abandoned.completedAt;
    const result = buildPreviousPerformances([old, layoutSession(), abandoned, newer]);
    expect(result['incline-bench-press']?.last?.weightKg).toBe(45);
    expect(result['incline-bench-press']?.last?.workoutId).toBe(9100);
    expect(result['incline-bench-press']?.suggestion).toBeNull();
  });
});
