import {
  observeArm,
  usableArmPoint,
  type ArmObservation,
  type BodySide,
  type PosePoint,
} from './pushupCounter';

// Flexible rep estimation: legs, hips, torso depth and perfect alignment are not prerequisites.
export function observeFrontPushup(
  points: PosePoint[],
  world: PosePoint[],
  width: number,
  height: number,
  time: number,
  side?: BodySide,
  source?: 'image' | 'world',
  allowPartial = false,
): ArmObservation | null {
  const left = points[11],
    right = points[12];
  if (
    !allowPartial &&
    (!usableArmPoint(left) || !usableArmPoint(right) || Math.abs(left.x - right.x) < 0.06)
  )
    return null;
  const candidates = (side ? [side] : (['left', 'right'] as BodySide[]))
    .map((candidate) => observeArm(points, width, height, time, candidate, world, source))
    .filter((sample): sample is ArmObservation => sample !== null);
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}
