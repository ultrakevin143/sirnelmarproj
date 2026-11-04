import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import axios from 'axios';
import { ref } from 'vue';
import WeightUnitToggle from '../src/components/training/WeightUnitToggle.vue';
import {
  defaultPreferences,
  setTrainingPreferences,
  useTrainingPreferences,
  type TrainingPreferences,
} from '../src/composables/useTrainingPreferences';

vi.mock('axios', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const { account } = vi.hoisted(() => ({ account: { id: 'unit-test' } }));
const currentUser = ref<{ id: string; settings?: TrainingPreferences } | null>(account);
vi.mock('../src/composables/useAuth', () => ({ useAuth: () => ({ currentUser }) }));

const wrappers: ReturnType<typeof mount>[] = [];
const render = () => {
  const wrapper = mount(WeightUnitToggle);
  wrappers.push(wrapper);
  return wrapper;
};
beforeEach(() => {
  vi.resetAllMocks();
  currentUser.value = { id: 'unit-test' };
  setTrainingPreferences();
});
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe('weight unit choice', () => {
  it('saves pounds while preserving all latest training preferences and canonical loads', async () => {
    const saved = {
      ...defaultPreferences,
      goal: 'strength' as const,
      trainingDays: [1, 3],
      onboardingComplete: true,
    };
    vi.mocked(axios.get).mockResolvedValue({ data: { settings: saved } });
    vi.mocked(axios.put).mockResolvedValue({ data: { settings: { ...saved, massUnit: 'lb' } } });
    const weightKg = 25;
    const wrapper = render();
    await wrapper.get('button[aria-label="Use pounds"]').trigger('click');
    await flushPromises();
    expect(axios.put).toHaveBeenCalledWith('/api/v1/training/settings', {
      ...saved,
      massUnit: 'lb',
    });
    expect(wrapper.get('button[aria-label="Use pounds"]').attributes('aria-pressed')).toBe('true');
    expect(useTrainingPreferences().formatLoad(weightKg)).toBe('55.12 lb');
    expect(weightKg).toBe(25);
    expect(currentUser.value?.settings?.trainingDays).toEqual([1, 3]);
    expect(useTrainingPreferences().fromDisplay(100)).toBeCloseTo(45.359237, 6);
  });
  it('keeps kilograms selected and provides a retryable error when saving fails', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { settings: defaultPreferences } });
    vi.mocked(axios.put).mockRejectedValueOnce(new Error('Offline'));
    const wrapper = render();
    await wrapper.get('button[aria-label="Use pounds"]').trigger('click');
    await flushPromises();
    expect(useTrainingPreferences().massUnit.value).toBe('kg');
    expect(wrapper.get('[role="alert"]').text()).toContain('try again');
    vi.mocked(axios.put).mockResolvedValueOnce({
      data: { settings: { ...defaultPreferences, massUnit: 'lb' } },
    });
    await wrapper.get('button[aria-label="Use pounds"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(useTrainingPreferences().massUnit.value).toBe('lb');
  });
  it('disables duplicate submissions and ignores a response after the account changes', async () => {
    let finish!: (response: { data: { settings: TrainingPreferences } }) => void;
    vi.mocked(axios.get).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const wrapper = render();
    await wrapper.get('button[aria-label="Use pounds"]').trigger('click');
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    currentUser.value = { id: 'another-account' };
    finish({ data: { settings: defaultPreferences } });
    await flushPromises();
    expect(axios.put).not.toHaveBeenCalled();
    expect(useTrainingPreferences().massUnit.value).toBe('kg');
  });
});
