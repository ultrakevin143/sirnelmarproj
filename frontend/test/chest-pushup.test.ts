import { describe, expect, it } from 'vitest';
import { AutomaticPushupTracker } from '../src/utils/automaticPushup';
import { readyFrontPose as frontPose, readySidePose } from './fixtures/readyPushupPoses';

function pose(y = 0.3, span = 0.3) {
  const f = frontPose();
  for (const id of [13, 14, 15, 16]) f.points[id]!.visibility = 0;
  f.points[11] = { x: 0.5 - span / 2, y, visibility: 0.9 };
  f.points[12] = { x: 0.5 + span / 2, y, visibility: 0.9 };
  return f;
}
function sequence() {
  const tracker = new AutomaticPushupTracker('auto', 'chest');
  let time = 0;
  return {
    tracker,
    feed(f = pose(), people = 1, enabled = true) {
      const r = tracker.update(f.points, f.world, 640, 480, time, people, enabled);
      time += 180;
      return r;
    },
    gap() {
      time += 3000;
    },
  };
}
describe('upper-body proxy movement (synthetic landmarks, not accuracy validation)', () => {
  it('starts immediately without arms or wrists and counts continuous chest down/up travel', () => {
    const s = sequence();
    expect(s.feed().phase).toBe('up');
    s.feed(pose(0.33));
    s.feed(pose(0.36));
    s.feed(pose(0.34));
    const r = s.feed();
    expect(r.count).toBe(1);
    expect(r.diagnostics.method).toBe('chest');
    expect(r.chestPoint?.x).toBeCloseTo(0.5);
    expect(r.chestPoint?.y).toBeCloseTo(0.34);
    for (let i = 0; i < 10; i++) expect(s.feed().count).toBe(1);
  });
  it('counts approach/return size changes when vertical motion is small', () => {
    const s = sequence();
    s.feed();
    s.feed(pose(0.3, 0.33));
    const down = s.feed(pose(0.3, 0.36));
    expect(down.phase).toBe('down');
    expect(down.diagnostics.movementChannel).toBe('apparent-size');
    expect(down.diagnostics.movementProgress).toBe(100);
    expect(s.feed().count).toBe(1);
  });
  it('uses a visible shoulder/hip pair in side view without elbows or wrists', () => {
    const s = sequence();
    const side = (offset = 0) => {
      const f = readySidePose();
      f.points[11]!.y += offset;
      return f;
    };
    expect(s.feed(side()).diagnostics.landmarkGroup).toBe('left-torso');
    s.feed(side(0.05));
    s.feed(side(0.1));
    expect(s.feed(side()).count).toBe(1);
  });
  it('ignores head nods, arm-only bends, small jitter, held positions and starting down then returning up', () => {
    const s = sequence();
    s.feed(pose(0.5));
    expect(s.feed().count).toBe(0);
    for (let i = 0; i < 12; i++) {
      const f = pose(0.3 + (i % 2) * 0.008);
      f.points[0] = { x: 0.5, y: i % 2 ? 0.8 : 0.1, visibility: 1 };
      expect(s.feed(f).count).toBe(0);
    }
    expect(sequence().feed(frontPose(90)).count).toBe(0);
  });
  it('does not mix cues to finish a rep', () => {
    const s = sequence();
    s.feed();
    s.feed(pose(0.36));
    s.feed(pose(0.36));
    expect(s.feed(pose(0.36, 0.28)).count).toBe(0);
    expect(s.feed().count).toBe(1);
  });
  it('does not use arm bending as chest motion and never invents a chest point from a face alone', () => {
    const s = sequence();
    for (const angle of [170, 90, 170, 90, 170]) {
      const f = frontPose(angle);
      f.points[11] = { x: 0.35, y: 0.3, visibility: 0.9 };
      f.points[12] = { x: 0.65, y: 0.3, visibility: 0.9 };
      expect(s.feed(f).count).toBe(0);
    }
    const head = pose();
    for (const id of [11, 12, 23, 24]) head.points[id]!.visibility = 0;
    head.points[0] = { x: 0.5, y: 0.6, visibility: 1 };
    expect(s.feed(head).chestPoint).toBeNull();
  });
  it('keeps chest counts on stale timestamps and resets only for a new capture', () => {
    const s = sequence();
    s.feed();
    s.feed(pose(0.36));
    s.feed(pose(0.36));
    expect(s.feed().count).toBe(1);
    const f = pose();
    expect(s.tracker.update(f.points, f.world, 640, 480, 10).count).toBe(1);
    s.tracker.reset('auto', 'chest');
    expect(s.feed().count).toBe(0);
  });
  it('refreshes the returned position so small posture drift does not lock later reps out', () => {
    const s = sequence();
    s.feed();
    s.feed(pose(0.36));
    s.feed(pose(0.36));
    expect(s.feed(pose(0.315)).count).toBe(1);
    s.feed(pose(0.375));
    s.feed(pose(0.375));
    expect(s.feed(pose(0.33)).count).toBe(2);
  });
  it('disarms incomplete cycles on loss, long gaps, pause, people or reference changes', () => {
    for (const reason of ['loss', 'gap', 'pause', 'people', 'reference']) {
      const s = sequence();
      s.feed();
      s.feed(pose(0.36));
      if (reason === 'loss') for (let i = 0; i < 5; i++) s.feed({ points: [], world: [] }, 0);
      else if (reason === 'gap') s.gap();
      else if (reason === 'reference') {
        const f = pose();
        f.points[12]!.visibility = 0;
        s.feed(f);
      } else s.feed(pose(0.36), reason === 'people' ? 2 : 1, reason !== 'pause');
      expect(s.feed().count).toBe(0);
    }
  });
});
