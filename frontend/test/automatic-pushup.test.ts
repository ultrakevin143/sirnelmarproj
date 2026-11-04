import { describe, it, expect } from 'vitest';
import { AutomaticPushupTracker, type AutomaticReading } from '../src/utils/automaticPushup';
import { observeFrontPushup } from '../src/utils/frontPushup';
import {
  readyFrontPose as frontPose,
  readySidePose as sidePose,
} from './fixtures/readyPushupPoses';

function sequence(tracker = new AutomaticPushupTracker(), interval = 100) {
  let time = 0;
  return {
    tracker,
    feed(pose: ReturnType<typeof frontPose>, frames = 10, people = 1, enabled = true) {
      let reading!: AutomaticReading;
      for (let i = 0; i < frames; i++) {
        reading = tracker.update(pose.points, pose.world, 640, 480, time, people, enabled);
        time += interval;
      }
      return reading;
    },
    gap() {
      time += 3000;
    },
  };
}
describe('flexible automatic push-up estimates with synthetic landmarks', () => {
  it.each(['side', 'front'] as const)(
    'counts continuous %s movement without holding setup or endpoints',
    (view) => {
      const pose = view === 'front' ? frontPose : sidePose;
      const s = sequence(new AutomaticPushupTracker(view), 180);
      let reading!: AutomaticReading;
      for (const angle of [131, 120, 109, 96, 88, 104, 119, 132]) reading = s.feed(pose(angle), 1);
      expect(reading.count).toBe(1);
      expect(reading.phase).toBe('up');
    },
  );
  it('accepts a visible starting angle below the old setup gate immediately', () => {
    const reading = sequence(new AutomaticPushupTracker('side')).feed(sidePose(109), 1);
    expect(reading.phase).toBe('up');
    expect(reading.status).not.toContain('learning');
  });
  it('counts sampled motion at one tracking frame per second instead of restarting each frame', () => {
    const s = sequence(new AutomaticPushupTracker('side'), 1200);
    s.feed(sidePose(131), 1);
    s.feed(sidePose(90), 1);
    expect(s.feed(sidePose(131), 1).count).toBe(1);
  });
  it('keeps the learned baseline after loss but requires a fresh full cycle', () => {
    const s = sequence(new AutomaticPushupTracker('side'));
    s.feed(sidePose(131));
    s.feed(sidePose(90));
    s.feed({ points: [], world: [] }, 10, 0);
    const recovered = s.feed(sidePose(131), 1);
    expect(recovered.count).toBe(0);
    expect(recovered.phase).toBe('up');
    expect(recovered.diagnostics.baselineAngle).toBeCloseTo(131);
    s.feed(sidePose(90), 3);
    expect(s.feed(sidePose(131), 1).count).toBe(1);
  });
  it('reports frame timing and disruption reason without keeping pose coordinates', () => {
    const s = sequence(new AutomaticPushupTracker('side'), 1200);
    s.feed(sidePose(131), 1);
    const reading = s.feed(sidePose(90), 1);
    expect(reading.diagnostics.frameIntervalMs).toBe(1200);
    expect(reading.diagnostics.arm).toBe('left');
    expect(reading.diagnostics.source).toBe('image');
    s.gap();
    expect(s.feed(sidePose(131), 1).diagnostics.lastInterruption).toBe('Long frame gap');
  });
  it.each(['side', 'front'] as const)(
    'counts full cycles from %s without manual calibration',
    (view) => {
      const pose = view === 'front' ? frontPose : sidePose,
        s = sequence();
      expect(s.feed(pose()).view).toBe(view);
      expect(s.feed(pose(90)).count).toBe(0);
      expect(s.feed(pose()).count).toBe(1);
      expect(s.feed(pose()).count).toBe(1);
      s.feed(pose(90));
      expect(s.feed(pose()).count).toBe(2);
    },
  );
  it('does not count starting down or holding either position', () => {
    for (const pose of [sidePose, frontPose]) {
      const s = sequence();
      s.feed(pose(90));
      expect(s.feed(pose()).count).toBe(0);
      expect(s.feed(pose()).count).toBe(0);
    }
  });
  it('learns an imperfect up position and counts a shallower bend, not only 155/100-degree poses', () => {
    const s = sequence(new AutomaticPushupTracker('side'));
    s.feed(sidePose(135));
    s.feed(sidePose(95));
    expect(s.feed(sidePose(135)).count).toBe(1);
  });
  it('can update an initially bent starting position when the arm extends further', () => {
    const s = sequence();
    s.feed(sidePose(120));
    expect(s.feed(sidePose(170)).count).toBe(0);
    s.feed(sidePose(125));
    expect(s.feed(sidePose(170)).count).toBe(1);
  });
  it('does not arm without visible lower-body context, even with a usable arm', () => {
    const s = sequence();
    const relaxed = (angle = 170) => {
      const f = frontPose(angle);
      for (const id of [23, 24, 25, 26, 27, 28]) {
        f.points[id] = { x: 2, y: 2, visibility: 0 };
        f.world[id] = { x: 0, y: 0, z: NaN };
      }
      for (const id of [12, 14, 16]) f.points[id]!.visibility = 0.2;
      return f;
    };
    s.feed(relaxed());
    s.feed(relaxed(90));
    expect(s.feed(relaxed()).count).toBe(0);
  });
  it('supports one visible arm in explicit front mode, including a 2D fallback', () => {
    const s = sequence(new AutomaticPushupTracker('front'));
    expect(s.feed(sidePose()).view).toBe('front');
    s.feed(sidePose(90));
    expect(s.feed(sidePose()).count).toBe(1);
    const f = frontPose();
    expect(observeFrontPushup(f.points, [], 640, 480, 0)?.source).toBe('image');
  });
  it('explicit side/front choices select the pipeline rather than enforcing a perfect body orientation', () => {
    expect(sequence(new AutomaticPushupTracker('side')).feed(frontPose()).view).toBe('side');
    expect(sequence(new AutomaticPushupTracker('front')).feed(sidePose()).view).toBe('front');
  });
  it('rejects missing/unusable arms but accepts moderate confidence and slightly clipped landmarks', () => {
    for (const patch of [{ visibility: 0.1 }, { x: 1.5 }, { visibility: NaN }]) {
      const f = frontPose();
      f.points[13] = { ...f.points[13]!, ...patch };
      f.points[14] = { ...f.points[14]!, ...patch };
      expect(observeFrontPushup(f.points, f.world, 640, 480, 0)).toBeNull();
    }
    const f = sidePose();
    for (const id of [11, 13, 15]) f.points[id]!.visibility = 0.45;
    f.points[15]!.y = 1.04;
    expect(sequence().feed(f).angle).not.toBeNull();
  });
  it('ignores head-only movement and small angle jitter', () => {
    const s = sequence();
    s.feed(frontPose());
    const head = frontPose();
    head.points[0] = { x: 0.5, y: 0.95, visibility: 0.95 };
    s.feed(head);
    s.feed(frontPose(160));
    expect(s.feed(frontPose()).count).toBe(0);
  });
  it('accepts arm bend even when hips/shoulder descent cannot be measured', () => {
    const s = sequence();
    s.feed(frontPose());
    s.feed(frontPose(90, 0.3));
    expect(s.feed(frontPose()).count).toBe(1);
  });
  it('preserves a rep across a brief occlusion without inventing a missing end position', () => {
    const s = sequence();
    s.feed(frontPose());
    s.feed(frontPose(90));
    expect(s.feed({ points: [], world: [] }, 2, 0).view).toBeNull();
    expect(s.feed(frontPose()).count).toBe(1);
    const empty = sequence();
    empty.feed(frontPose());
    empty.feed({ points: [], world: [] }, 2, 0);
    expect(empty.feed(frontPose()).count).toBe(0);
  });
  it('disarms on sustained tracking loss, pause, large frame gaps and multiple people', () => {
    for (const interrupt of ['loss', 'pause', 'gap', 'people']) {
      const s = sequence();
      s.feed(frontPose());
      s.feed(frontPose(90));
      if (interrupt === 'gap') s.gap();
      else if (interrupt === 'loss') s.feed({ points: [], world: [] }, 10, 0);
      else if (interrupt === 'people') s.feed(frontPose(), 1, 2);
      else s.feed(frontPose(), 1, 1, false);
      expect(s.feed(frontPose()).count).toBe(0);
      s.feed(frontPose(90));
      expect(s.feed(frontPose()).count).toBe(1);
    }
  });
  it('does not bridge a rep across a changed measurement source or reset', () => {
    const s = sequence();
    s.feed(frontPose());
    s.feed(frontPose(90));
    expect(s.feed(sidePose()).count).toBe(0);
    s.feed(sidePose(90));
    expect(s.feed(sidePose()).count).toBe(1);
    s.tracker.reset('side');
    expect(s.feed(sidePose()).count).toBe(0);
  });
  it('allows small camera/hand repositioning instead of restarting setup', () => {
    const s = sequence();
    s.feed(frontPose());
    const moved = frontPose(90);
    moved.points[15]!.x -= 0.1;
    moved.points[16]!.x -= 0.1;
    s.feed(moved);
    expect(s.feed(frontPose()).count).toBe(1);
  });
  it('can count at two tracking frames per second without demanding six stable frames', () => {
    const s = sequence(new AutomaticPushupTracker('front'), 500);
    s.feed(frontPose(), 5);
    s.feed(frontPose(90), 5);
    expect(s.feed(frontPose(), 5).count).toBe(1);
  });
  it('supports mirrored projections', () => {
    const mirror = (angle = 170) => {
      const f = frontPose(angle);
      f.points.forEach((p) => {
        p.x = 1 - p.x;
      });
      f.world.forEach((p) => {
        p.x = -p.x;
      });
      return f;
    };
    const s = sequence();
    s.feed(mirror());
    s.feed(mirror(90));
    expect(s.feed(mirror()).count).toBe(1);
  });
});
