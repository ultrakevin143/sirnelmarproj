import type { PosePoint } from '../../src/utils/pushupCounter';
import { frontPose, sidePose } from './pushupPoses';

// Deliberately model the lower body too: the older arm fixtures cannot prove
// that an upper-body movement happened in a push-up position.
export function readyFrontPose(angle = 170, shoulderY = 0.3 + ((170 - angle) / 80) * 0.12) {
  const f = frontPose(angle, shoulderY);
  const seen = { visibility: 0.95, presence: 1 };
  for (const [s, e, w, h, k, a, sign] of [
    [11, 13, 15, 23, 25, 27, -1],
    [12, 14, 16, 24, 26, 28, 1],
  ]) {
    f.points[h!] = { x: 0.5 + sign! * 0.07, y: 0.43, ...seen };
    f.points[k!] = { x: 0.5 + sign! * 0.06, y: 0.52, ...seen };
    f.points[a!] = { x: 0.5 + sign! * 0.05, y: 0.61, ...seen };
    const shift = (shoulderY - 0.3) * 0.5 - f.world[s!]!.y;
    for (const id of [s!, e!, w!]) f.world[id]!.y += shift;
    f.world[h!] = { x: sign! * 0.12, y: 0.02, z: 0.5 };
    f.world[k!] = { x: sign! * 0.1, y: 0.04, z: 1 };
    f.world[a!] = { x: sign! * 0.08, y: 0.06, z: 1.5 };
  }
  return f;
}

export function readySidePose(angle = 170) {
  return sidePose(angle);
}

export function uprightPose(offset = 0) {
  const points: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const world: PosePoint[] = points.map(() => ({ x: 0, y: 0, z: 0 }));
  for (const [s, h, k, a, sign] of [
    [11, 23, 25, 27, -1],
    [12, 24, 26, 28, 1],
  ]) {
    for (const [id, y] of [
      [s!, 0.2],
      [h!, 0.55],
      [k!, 0.75],
      [a!, 0.95],
    ]) {
      points[id!] = { x: 0.5 + sign! * 0.12, y: y! + offset, visibility: 0.95 };
      world[id!] = { x: sign! * 0.12, y: y! * 1.8, z: 0 };
    }
  }
  return { points, world };
}
