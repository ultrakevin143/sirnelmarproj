import { describe, expect, it } from 'vitest';
import { AutomaticPushupTracker } from '../src/utils/automaticPushup';
import { readyFrontPose, readySidePose, uprightPose } from './fixtures/readyPushupPoses';

function session(strategy: 'chest' | 'arms' = 'chest') {
  const tracker = new AutomaticPushupTracker('auto', strategy);
  let time = 0;
  return {
    feed(f: ReturnType<typeof readyFrontPose>) {
      const r = tracker.update(f.points, f.world, 640, 480, time);
      time += 180;
      return r;
    },
  };
}
describe('readiness and setup-motion regressions', () => {
  it('rejects the confirmed upright-body down/up false count, with or without world landmarks', () => {
    for (const world of [true, false]) {
      const s = session();
      for (const offset of [0, 0.06, 0.06, 0]) {
        const f = uprightPose(offset);
        if (!world) f.world = [];
        expect(s.feed(f).count).toBe(0);
      }
    }
  });
  it('rejects standing approach/return even with a shrinking or growing shoulder span', () => {
    const s = session();
    for (const scale of [1, 1.25, 1.25, 1]) {
      const f = uprightPose();
      for (const p of f.points) p.x = 0.5 + (p.x - 0.5) * scale;
      expect(s.feed(f).count).toBe(0);
    }
  });
  it('does not treat cropped shoulders-only motion as proof of push-up readiness', () => {
    const s = session();
    for (const y of [0.3, 0.38, 0.38, 0.3]) {
      const f = readyFrontPose(170, y);
      for (const id of [23, 24, 25, 26, 27, 28]) f.points[id]!.visibility = 0;
      const r = s.feed(f);
      expect(r.count).toBe(0);
      expect(r.diagnostics.readiness).not.toBe('ready');
    }
  });
  it('rejects whole-frame camera/body translation instead of mistaking it for chest movement', () => {
    const s = session();
    for (const delta of [0, 0.08, 0.08, 0]) {
      const f = readyFrontPose();
      for (const p of f.points) p.y += delta;
      expect(s.feed(f).count).toBe(0);
    }
  });
  it('subtracts small camera translation too, even below the reposition threshold', () => {
    const s = session();
    for (const delta of [0, 0.03, 0.03, 0]) {
      const f = readyFrontPose();
      f.points[11]!.x = 0.44;
      f.points[12]!.x = 0.56;
      for (const p of f.points) p.y += delta;
      expect(s.feed(f).count).toBe(0);
    }
  });
  it('rejects global camera zoom or whole-body approach using the lower-body scale reference', () => {
    const s = session();
    for (const scale of [1, 1.25, 1.25, 1]) {
      const f = readyFrontPose();
      for (const p of f.points) {
        p.x = 0.5 + (p.x - 0.5) * scale;
        p.y = 0.5 + (p.y - 0.5) * scale;
      }
      expect(s.feed(f).count).toBe(0);
    }
  });
  it.each([false, true])(
    'normalizes repeated small camera zoom without counting (cropped feet: %s)',
    (croppedFeet) => {
      const s = session();
      for (const scale of [1, 1.16, 1.16, 1, 1, 1.16, 1.16, 1]) {
        const f = readyFrontPose();
        if (croppedFeet) for (const id of [27, 28]) f.points[id]!.visibility = 0;
        for (const p of f.points) {
          p.x = 0.5 + (p.x - 0.5) * scale;
          p.y = 0.5 + (p.y - 0.5) * scale;
        }
        expect(s.feed(f).count).toBe(0);
      }
    },
  );
  it('does not forget its lower-body anchor during a brief occlusion and bridge camera motion', () => {
    const s = session();
    s.feed(readyFrontPose());
    s.feed(readyFrontPose(90));
    s.feed({ points: [], world: [] });
    const moved = readyFrontPose();
    for (const p of moved.points) p.y += 0.08;
    expect(s.feed(moved).count).toBe(0);
  });
  it('rejects a folded/crouching torso rather than arming from chest motion alone', () => {
    const s = session();
    for (const y of [0.3, 0.38, 0.38, 0.3]) {
      const f = readyFrontPose(170, y);
      for (const [h, k] of [
        [23, 25],
        [24, 26],
      ]) {
        f.world[k!] = { ...f.world[h!]!, x: f.world[h!]!.x + 0.4, z: 0.45 };
        f.points[k!] = { ...f.points[h!]!, x: f.points[h!]!.x + 0.2 };
      }
      expect(s.feed(f).count).toBe(0);
    }
  });
  it('does not bridge a partial rep through standing up or stepping into position', () => {
    const s = session();
    s.feed(readyFrontPose());
    s.feed(readyFrontPose(90));
    s.feed(uprightPose());
    expect(s.feed(readyFrontPose()).count).toBe(0);
    s.feed(readyFrontPose(90));
    s.feed(readyFrontPose(100));
    expect(s.feed(readyFrontPose()).count).toBe(1);
  });
  it('still starts a continuous front or side push-up without a calibration hold', () => {
    for (const view of ['front', 'side']) {
      const s = session();
      const f = (y: number) => {
        if (view === 'front') return readyFrontPose(170, y);
        const p = readySidePose();
        p.points[11]!.y += y - 0.3;
        return p;
      };
      expect(s.feed(f(0.3)).diagnostics.readiness).toBe('ready');
      s.feed(f(0.33));
      s.feed(f(0.37));
      s.feed(f(0.35));
      expect(s.feed(f(0.3)).count).toBe(1);
    }
  });
  it('does not bypass the readiness check by selecting arm mode', () => {
    const s = session('arms');
    for (let i = 0; i < 8; i++) expect(s.feed(uprightPose((i % 2) * 0.06)).count).toBe(0);
  });
});
