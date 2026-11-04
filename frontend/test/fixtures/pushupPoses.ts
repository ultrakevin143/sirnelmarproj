import type { PosePoint } from '../../src/utils/pushupCounter';

export function frontPose(angle = 170, shoulderY = 0.3 + ((170 - angle) / 80) * 0.35) {
  const points: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const world: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  const seen = { visibility: 0.95, presence: 1 };
  const worldShoulderY = ((170 - angle) / 80) * 0.3;
  const half = (0.6 - worldShoulderY) / 2;
  const offset = half / Math.tan((angle * Math.PI) / 360);
  for (const [s, e, w, h, sign] of [
    [11, 13, 15, 23, -1],
    [12, 14, 16, 24, 1],
  ]) {
    points[s!] = { x: 0.5 + sign! * 0.15, y: shoulderY, ...seen };
    points[e!] = { x: 0.5 + sign! * 0.22, y: (shoulderY + 0.82) / 2, ...seen };
    points[w!] = { x: 0.5 + sign! * 0.2, y: 0.82, ...seen };
    points[h!] = { x: 0.5 + sign! * 0.07, y: 0.43, ...seen };
    world[s!] = { x: sign! * 0.2, y: worldShoulderY, z: 0 };
    world[e!] = { x: sign! * (0.2 + offset), y: worldShoulderY + half, z: 0 };
    world[w!] = { x: sign! * 0.2, y: 0.6, z: 0 };
    world[h!] = { x: sign! * 0.12, y: worldShoulderY + 0.02, z: 0.5 };
  }
  return { points, world };
}
export function sidePose(angle = 170) {
  const points: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const seen = { visibility: 0.95, presence: 1 };
  points[11] = { x: 0.2, y: 0.35, ...seen };
  points[13] = { x: 0.2 + 96 / Math.tan((angle * Math.PI) / 360) / 640, y: 0.55, ...seen };
  points[15] = { x: 0.2, y: 0.75, ...seen };
  points[23] = { x: 0.5, y: 0.39545, ...seen };
  points[25] = { x: 0.7, y: 0.42575, ...seen };
  points[27] = { x: 0.86, y: 0.45, ...seen };
  return { points, world: [] as PosePoint[] };
}
