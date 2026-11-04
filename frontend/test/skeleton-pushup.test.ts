import { describe, expect, it } from 'vitest';
import { AutomaticPushupTracker, type AutomaticReading } from '../src/utils/automaticPushup';
import { readyFrontPose as frontPose } from './fixtures/readyPushupPoses';

function fixture(elbowY = 0.42, wristX = 0.3, shoulder = false) {
  const pose = frontPose();
  for (const id of [12, 14, 16]) pose.points[id]!.visibility = 0;
  // Visible left shoulder supplies body context, but its collapsed arm angle
  // is unusable, exercising elbow/wrist fallback independently of readiness.
  if (!shoulder) pose.points[11] = { x: 0.28, y: elbowY, visibility: 0.95 };
  pose.points[13] = { x: 0.28, y: elbowY, visibility: 0.8 };
  pose.points[15] = { x: wristX, y: 0.8, visibility: 0.8 };
  return pose;
}
function session() {
  const tracker = new AutomaticPushupTracker();
  let time = 0;
  return {
    tracker,
    feed(pose = fixture(), people = 1, enabled = true) {
      const reading = tracker.update(pose.points, pose.world, 640, 480, time, people, enabled);
      time += 180;
      return reading;
    },
  };
}
describe('shoulder-optional skeleton movement fallback', () => {
  it('starts on the first visible elbow/wrist frame and counts continuous movement without holding', () => {
    const s = session();
    const first = s.feed();
    expect(first.phase).toBe('up');
    expect(first.diagnostics.method).toBe('up-down');
    expect(first.angle).toBeNull();
    let reading!: AutomaticReading;
    for (const y of [0.44, 0.47, 0.5, 0.48, 0.45, 0.42]) reading = s.feed(fixture(y));
    expect(reading.count).toBe(1);
    for (let i = 0; i < 10; i++) expect(s.feed().count).toBe(1);
  });
  it('keeps the fallback measurement when the shoulder appears mid-rep', () => {
    const s = session();
    s.feed();
    s.feed(fixture(0.46));
    s.feed(fixture(0.5, 0.3, true));
    const up = s.feed(fixture(0.42, 0.3, true));
    expect(up.diagnostics.method).toBe('up-down');
    expect(up.count).toBe(1);
  });
  it('does not count a half-cycle starting down, small jitter or head-only motion', () => {
    const s = session();
    s.feed(fixture(0.5));
    expect(s.feed().count).toBe(0);
    for (const y of [0.43, 0.44, 0.42, 0.43, 0.42]) expect(s.feed(fixture(y)).count).toBe(0);
    const head = fixture();
    head.points[0] = { x: 0.5, y: 0.9, visibility: 1 };
    expect(s.feed(head).count).toBe(0);
  });
  it('cannot count without an elbow and wrist, across moving hands, pause or multiple people', () => {
    for (const reason of ['missing', 'hands', 'pause', 'people']) {
      const s = session();
      s.feed();
      s.feed(fixture(0.5));
      if (reason === 'missing') {
        for (let i = 0; i < 5; i++) s.feed({ points: [], world: [] }, 0);
      } else if (reason === 'hands') s.feed(fixture(0.5, 0.5));
      else s.feed(fixture(0.5), reason === 'people' ? 2 : 1, reason !== 'pause');
      expect(s.feed().count).toBe(0);
    }
  });
  it('discards an angle-path partial rep when switching instead of double-counting it', () => {
    const s = session();
    s.feed(frontPose());
    s.feed(frontPose(90));
    expect(s.feed().count).toBe(0);
    s.feed(fixture(0.5));
    expect(s.feed().count).toBe(0); // only 360 ms since fallback setup
    s.feed(fixture(0.5));
    s.feed(fixture(0.48));
    expect(s.feed().count).toBe(1);
    s.tracker.reset();
    expect(s.feed().count).toBe(0);
  });
});
