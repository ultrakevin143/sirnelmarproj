import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import type { PosePoint } from '../src/utils/pushupCounter';
import {
  readyFrontPose as frontPose,
  readySidePose as sidePose,
  uprightPose,
} from './fixtures/readyPushupPoses';

const control = vi.hoisted(() => ({
  result: null as
    null | ((points: PosePoint[], time: number, people: number, world: PosePoint[]) => void),
  state: null as null | ((state: string) => void),
  starts: 0,
}));
vi.mock('../src/utils/poseCamera', () => ({
  PoseCamera: class {
    constructor(_video: unknown, result: typeof control.result, state: typeof control.state) {
      control.result = result;
      control.state = state;
    }
    prepare() {
      return Promise.resolve();
    }
    start() {
      control.starts++;
      control.state?.('on');
      return Promise.resolve();
    }
    stop() {
      control.state?.('off');
    }
  },
}));
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { session: null } }),
    isAxiosError: () => false,
  },
}));
import PushupCameraPage from '../src/pages/PushupCameraPage.vue';

beforeEach(() => {
  control.starts = 0;
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('Worker', class {});
  vi.stubGlobal('OffscreenCanvas', class {});
  vi.stubGlobal('createImageBitmap', vi.fn());
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('automatic camera page without hardware access', () => {
  it('auto-starts counting after Start camera, locks selection, reviews and resets without manual captures', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/app/camera', component: PushupCameraPage },
        { path: '/app', component: { template: '<p>Workout</p>' } },
      ],
    });
    await router.push('/app/camera');
    const wrapper = mount(RouterView, {
      global: {
        plugins: [router],
        stubs: { 'q-page': { template: '<main><slot /></main>' }, 'q-icon': true },
      },
    });
    try {
      await flushPromises();
      const button = (label: string) => {
        const found = wrapper.findAll('button').find((b) => b.text() === label);
        if (!found) throw new Error(`Missing ${label}`);
        return found;
      };
      expect(control.starts).toBe(0);
      expect((wrapper.get('input[value="chest"]').element as HTMLInputElement).checked).toBe(true);
      expect(wrapper.text()).not.toContain('Capture up position');
      expect(wrapper.text()).toContain('No setup hold');
      expect(wrapper.get('.tracking-details').text()).toContain('Start the camera');
      await button('Start camera').trigger('click');
      await flushPromises();
      expect(control.starts).toBe(1);
      expect(button('Pause counting').exists()).toBe(true);
      expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
      let time = 0;
      const feed = async (pose: ReturnType<typeof frontPose>) => {
        for (let i = 0; i < 10; i++) {
          control.result?.(pose.points, time, 1, pose.world);
          time += 100;
        }
        await flushPromises();
      };
      await feed(uprightPose());
      await feed(uprightPose(0.06));
      await feed(uprightPose());
      expect(wrapper.get('.count-display strong').text()).toBe('0');
      expect(wrapper.get('.readiness-status').text()).toContain('Not counting');
      expect(wrapper.get('#chest-movement').attributes('value')).toBe('0');
      await feed(frontPose());
      await feed(frontPose(90));
      await feed(frontPose());
      expect(wrapper.get('.count-display strong').text()).toBe('1');
      expect(wrapper.get('.detected-view').text()).toContain('Chest / torso');
      expect(wrapper.get('.readiness-status').text()).toContain('Position detected');
      expect(wrapper.get('.tracking-details').text()).toContain('Body reference');
      expect(wrapper.get('.tracking-details').text()).toContain('100 ms');
      expect(wrapper.get('.tracking-details').text()).toContain('2D image');
      expect(wrapper.get('#chest-movement').attributes('value')).toBe('0');
      await button('Stop camera & review').trigger('click');
      expect((wrapper.get('#reviewed-reps').element as HTMLInputElement).value).toBe('1');
      expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
      await button('New set / reset tracking').trigger('click');
      expect(wrapper.text()).toContain('Clear this count and position lock?');
      await button('Clear capture').trigger('click');
      expect(wrapper.get('.count-display strong').text()).toBe('0');
      expect(wrapper.get('.tracking-details').text()).toContain('Start the camera');
      expect(wrapper.get('fieldset').attributes('disabled')).toBeUndefined();
      await wrapper.get('input[value="arms"]').setValue();
      await wrapper.get('input[value="side"]').setValue();
      await button('Start camera').trigger('click');
      await flushPromises();
      time = 0;
      await feed(frontPose());
      expect(wrapper.get('.count-display strong').text()).toBe('0');
      await feed(sidePose());
      await feed(sidePose(90));
      await feed(sidePose());
      expect(wrapper.get('.count-display strong').text()).toBe('1');
      await button('Pause counting').trigger('click');
      await feed(sidePose(90));
      await feed(sidePose());
      expect(wrapper.get('.count-display strong').text()).toBe('1');
      expect(button('Resume counting').exists()).toBe(true);
      await button('Stop camera & review').trigger('click');
      await button('New set / reset tracking').trigger('click');
      await button('Clear capture').trigger('click');
      await button('Start camera').trigger('click');
      await flushPromises();
      time = 0;
      const partialArm = (angle = 170) => {
        const pose = frontPose(angle);
        pose.points[13]!.visibility = 0;
        pose.points[12]!.visibility = 0;
        return pose;
      };
      await feed(partialArm());
      await feed(partialArm(90));
      await feed(partialArm());
      expect(wrapper.get('.count-display strong').text()).toBe('1');
      expect(wrapper.get('.detected-view').text()).toContain('Skeleton up/down');
      expect(wrapper.get('.angle-readout').text()).toContain('body context checked');
      const preview = wrapper.get('video');
      Object.defineProperty(preview.element, 'videoWidth', { configurable: true, value: 720 });
      Object.defineProperty(preview.element, 'videoHeight', { configurable: true, value: 960 });
      await preview.trigger('loadedmetadata');
      expect(wrapper.get('.preview-stage').attributes('style')).toContain('720 / 960');
      Object.defineProperty(preview.element, 'videoWidth', { configurable: true, value: 1280 });
      Object.defineProperty(preview.element, 'videoHeight', { configurable: true, value: 720 });
      await preview.trigger('resize');
      expect(wrapper.get('.preview-stage').attributes('style')).toContain('1280 / 720');
    } finally {
      wrapper.unmount();
    }
  });
});
