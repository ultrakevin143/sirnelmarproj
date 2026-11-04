import { SIDES, usableArmPoint, type BodySide, type PosePoint } from './pushupCounter';

export type SkeletonMotion = {
  side: BodySide;
  position: number;
  wrist: { x: number; y: number };
};

// A shoulder is deliberately not required. The hand is a reference for elbow
// travel, not a fabricated joint or an estimate of chest-to-floor distance.
export function observeSkeletonMotion(
  points: PosePoint[],
  preferredSide?: BodySide,
): SkeletonMotion | null {
  const sides: BodySide[] = preferredSide
    ? [preferredSide, preferredSide === 'left' ? 'right' : 'left']
    : ['left', 'right'];
  for (const side of sides) {
    const [, elbowId, wristId] = SIDES[side];
    const elbow = points[elbowId],
      wrist = points[wristId];
    if (!usableArmPoint(elbow) || !usableArmPoint(wrist)) continue;
    if (Math.hypot(elbow.x - wrist.x, elbow.y - wrist.y) < 0.02) continue;
    return { side, position: elbow.y - wrist.y, wrist: { x: wrist.x, y: wrist.y } };
  }
  return null;
}

export class SkeletonMotionCounter {
  count = 0;
  phase: 'find-top' | 'up' | 'down' = 'find-top';
  baseline: number | null = null;
  side: BodySide | undefined;
  private wrist: { x: number; y: number } | null = null;
  private armedAt = 0;

  interrupt() {
    this.phase = 'find-top';
  }
  reset() {
    this.count = 0;
    this.interrupt();
    this.baseline = null;
    this.side = undefined;
    this.wrist = null;
  }
  update(sample: SkeletonMotion, time: number) {
    const moved =
      this.side !== sample.side ||
      (this.wrist !== null &&
        Math.hypot(sample.wrist.x - this.wrist.x, sample.wrist.y - this.wrist.y) > 0.08);
    if (this.baseline === null || moved) {
      this.baseline = sample.position;
      this.side = sample.side;
      this.wrist = sample.wrist;
      this.interrupt();
    }
    if (this.phase !== 'down') this.baseline = Math.min(this.baseline, sample.position);
    const travel = sample.position - this.baseline;
    if (this.phase === 'up' && travel <= 0.02) this.armedAt = time;
    if (this.phase === 'find-top' && travel <= 0.02) {
      this.phase = 'up';
      this.armedAt = time;
    } else if (this.phase === 'up' && travel >= 0.055) this.phase = 'down';
    else if (this.phase === 'down' && travel <= 0.02) {
      if (time - this.armedAt >= 400) this.count = Math.min(1000, this.count + 1);
      this.phase = 'up';
      this.armedAt = time;
    }
    return moved;
  }
}
