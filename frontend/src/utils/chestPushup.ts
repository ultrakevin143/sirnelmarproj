import { usableArmPoint, type PosePoint } from './pushupCounter';
import { PushupReadinessGate, type Readiness } from './pushupReadiness';

type ChestKey = 'shoulders' | 'left-torso' | 'right-torso';
export type ChestObservation = {
  key: ChestKey;
  point: { x: number; y: number };
  span: number;
};
// MediaPipe has no sternum landmark. This is a labelled upper-body proxy,
// never a measurement of chest-to-floor distance. Keep a fixed landmark group
// while visible so a missing joint cannot itself look like body movement.
export function observeChest(points: PosePoint[], preferred?: ChestKey): ChestObservation | null {
  const keys: ChestKey[] = preferred
    ? [
        preferred,
        ...(['shoulders', 'left-torso', 'right-torso'] as ChestKey[]).filter(
          (k) => k !== preferred,
        ),
      ]
    : ['shoulders', 'left-torso', 'right-torso'];
  for (const key of keys) {
    const [a, b] =
      key === 'shoulders'
        ? [points[11], points[12]]
        : key === 'left-torso'
          ? [points[11], points[23]]
          : [points[12], points[24]];
    if (!usableArmPoint(a) || !usableArmPoint(b)) continue;
    const span = Math.hypot(a.x - b.x, a.y - b.y);
    if (span < 0.05) continue;
    const point =
      key === 'shoulders'
        ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.04 }
        : { x: a.x * 0.8 + b.x * 0.2, y: a.y * 0.8 + b.y * 0.2 };
    return { key, point, span };
  }
  return null;
}

export class ChestPushupTracker {
  count = 0;
  phase: 'find-top' | 'up' | 'down' = 'find-top';
  key: ChestKey | undefined;
  point: ChestObservation['point'] | null = null;
  channel: 'vertical' | 'apparent-size' | null = null;
  progress = 0;
  private baselineY: number | null = null;
  private baselineSpan: number | null = null;
  private baselineX: number | null = null;
  private armedAt = 0;
  private time = -1;
  private lastSeen = -1;
  private travel = 0.04;
  private gate = new PushupReadinessGate();
  private readiness: Readiness = { state: 'unknown', reason: 'Waiting for body position' };
  private readyTime = -1;

  interrupt() {
    this.phase = 'find-top';
    this.channel = null;
    this.progress = 0;
    this.point = null;
  }
  reset() {
    this.count = 0;
    this.key = undefined;
    this.baselineY = this.baselineSpan = this.baselineX = null;
    this.time = this.lastSeen = -1;
    this.gate.reset();
    this.readyTime = -1;
    this.readiness = { state: 'unknown', reason: 'Waiting for body position' };
    this.interrupt();
  }
  update(
    points: PosePoint[],
    time: number,
    people = 1,
    enabled = true,
    world: PosePoint[] = [],
    width = 640,
    height = 480,
  ) {
    let interruption = '';
    const result = (status: string) => ({
      count: this.count,
      phase: this.phase,
      status,
      point: this.point,
      progress: this.progress,
      channel: this.channel,
      landmarkGroup: this.key ?? null,
      interruption,
      readiness: this.readiness,
    });
    if (!Number.isFinite(time) || time <= this.time) return result('Waiting for a fresh frame');
    if (this.time >= 0 && time - this.time > 2500) {
      this.interrupt();
      interruption = 'Long frame gap';
    }
    this.time = time;
    if (!enabled || people > 1) {
      this.interrupt();
      this.gate.reset();
      this.readiness = {
        state: 'unknown',
        reason: !enabled ? 'Counting paused' : 'Multiple people',
      };
      interruption = !enabled ? 'Counting paused' : 'Multiple people';
      return result(
        !enabled
          ? 'Counting paused · camera is still on'
          : 'More than one person · counting paused',
      );
    }
    this.readiness = this.gate.update(people === 1 ? points : [], world, width, height);
    if (this.readiness.state !== 'ready') {
      this.point = null;
      const uncertainBriefly =
        this.readiness.state === 'unknown' && this.readyTime >= 0 && time - this.readyTime <= 600;
      if (!uncertainBriefly) {
        this.interrupt();
        this.baselineY = this.baselineSpan = this.baselineX = null;
        this.key = undefined;
        interruption = this.readiness.reason;
      }
      return result(this.readiness.reason);
    }
    this.readyTime = time;
    const sample = people === 1 ? observeChest(points, this.key) : null;
    if (!sample) {
      this.point = null;
      if (this.lastSeen >= 0 && time - this.lastSeen > 600) {
        this.interrupt();
        interruption = 'Upper body not visible';
      }
      return result('Looking for upper body · show both shoulders, or one shoulder and hip');
    }
    // Remove shared lower-body motion; camera translation/zoom is not a rep.
    const position =
      (sample.point.y - (this.readiness.anchorY ?? 0)) / (this.readiness.groundSpan ?? 1);
    const size = sample.span / (this.readiness.groundSpan ?? 1);
    const changed =
      this.key !== sample.key ||
      (this.baselineX !== null &&
        Math.abs(sample.point.x - this.baselineX) > Math.max(0.1, sample.span * 0.6));
    if (changed || this.baselineY === null || this.baselineSpan === null) {
      this.interrupt();
      interruption = this.key ? 'Torso reference changed' : 'None';
      this.key = sample.key;
      this.baselineY = position;
      this.baselineSpan = size;
      this.baselineX = sample.point.x;
      this.travel =
        Math.max(0.025, Math.min(0.06, sample.span * 0.16)) / (this.readiness.groundSpan ?? 1);
    }
    this.lastSeen = time;
    this.point = sample.point;
    if (this.phase !== 'down') {
      this.baselineY = Math.min(this.baselineY, position);
      this.baselineSpan = Math.min(this.baselineSpan, size);
    }
    const vertical = (position - this.baselineY) / this.travel;
    // Apparent size is a 2D approach/return cue, NOT measured camera depth.
    // Only the two-shoulder group can use it; side torso rotation is too ambiguous.
    const approach =
      sample.key === 'shoulders' && this.readiness.groundSpan != null
        ? (size / this.baselineSpan - 1) / 0.15
        : 0;
    if (this.phase === 'up' && vertical <= 0.4 && approach <= 0.4) this.armedAt = time;
    if (this.phase === 'find-top') {
      if (vertical <= 0.4 && approach <= 0.4) {
        this.phase = 'up';
        this.armedAt = time;
      }
    } else if (this.phase === 'up' && (vertical >= 1 || approach >= 1)) {
      this.phase = 'down';
      this.channel = vertical >= 1 ? 'vertical' : 'apparent-size';
    } else if (this.phase === 'down') {
      const returned = this.channel === 'vertical' ? vertical <= 0.4 : approach <= 0.4;
      if (returned) {
        if (time - this.armedAt >= 500) this.count = Math.min(1000, this.count + 1);
        this.phase = 'up';
        this.channel = null;
        this.armedAt = time;
        // Follow the returned position rather than keeping a session-wide
        // extreme that can become unreachable after small posture changes.
        this.baselineY = position;
        this.baselineSpan = size;
        this.baselineX = sample.point.x;
      }
    }
    this.progress = Math.max(
      0,
      Math.min(
        100,
        (this.channel === 'apparent-size'
          ? approach
          : this.channel === 'vertical'
            ? vertical
            : Math.max(vertical, approach)) * 100,
      ),
    );
    return result(
      this.phase === 'down'
        ? 'Chest movement detected · return up to count'
        : this.phase === 'find-top'
          ? 'Upper body found · return up to start a fresh rep'
          : 'Tracking chest/torso · lower and return up, no hold needed',
    );
  }
}
