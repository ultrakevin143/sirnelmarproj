import { describe, expect, it } from 'vitest';
import { AutomaticPushupTracker } from '../src/utils/automaticPushup';
import { readyFrontPose, readySidePose } from './fixtures/readyPushupPoses';

describe('push-up timing after resting at the top (synthetic landmarks)', () => {
  it.each(['chest', 'arms', 'skeleton'] as const)(
    'does not turn a brief %s tracking spike into a rep after a long hold',
    (method) => {
      const tracker = new AutomaticPushupTracker('side', method === 'chest' ? 'chest' : 'arms');
      const pose = (down = false) => {
        if (method === 'arms') return readySidePose(down ? 90 : 170);
        const f = readyFrontPose(170, down ? 0.42 : 0.3);
        if (method === 'skeleton') {
          for (const id of [12, 14, 16]) f.points[id]!.visibility = 0;
          f.points[11] = { x: 0.28, y: down ? 0.5 : 0.42, visibility: 0.95 };
          f.points[13] = { ...f.points[11]! };
          f.points[15] = { x: 0.3, y: 0.8, visibility: 0.95 };
        }
        return f;
      };
      const feed = (time: number, down = false) => {
        const f = pose(down);
        return tracker.update(f.points, f.world, 640, 480, time);
      };
      for (let time = 0; time <= 5000; time += 100) feed(time);
      feed(5100, true);
      expect(feed(5200).count).toBe(0);
      // A genuine observed cycle still counts after the rejected spike.
      feed(5500, true);
      feed(5800, true);
      expect(feed(6100).count).toBe(1);
    },
  );
});
