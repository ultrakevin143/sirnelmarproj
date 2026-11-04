export type PosePoint = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
};
export type BodySide = 'left' | 'right';
export type Observation = { angle: number; side: BodySide; time: number };
export const SIDES = { left: [11, 13, 15, 23, 25, 27], right: [12, 14, 16, 24, 26, 28] } as const;

export function jointAngle(a: PosePoint, b: PosePoint, c: PosePoint, width = 1, height = 1) {
  const ax = (a.x - b.x) * width,
    ay = (a.y - b.y) * height;
  const cx = (c.x - b.x) * width,
    cy = (c.y - b.y) * height;
  const length = Math.hypot(ax, ay) * Math.hypot(cx, cy);
  return length > 1e-8
    ? (Math.acos(Math.max(-1, Math.min(1, (ax * cx + ay * cy) / length))) * 180) / Math.PI
    : NaN;
}

export const ARM_CONFIDENCE = 0.35;
export type ArmObservation = Observation & { confidence: number; source: 'image' | 'world' };

export function usableArmPoint(p: PosePoint | undefined): p is PosePoint {
  return (
    !!p &&
    [p.x, p.y, p.visibility, p.presence ?? 1].every(Number.isFinite) &&
    p.x >= -0.15 &&
    p.x <= 1.15 &&
    p.y >= -0.15 &&
    p.y <= 1.15 &&
    (p.visibility ?? 0) >= ARM_CONFIDENCE &&
    (p.presence ?? 1) >= ARM_CONFIDENCE
  );
}
function worldAngle(a: PosePoint | undefined, b: PosePoint | undefined, c: PosePoint | undefined) {
  if (!a || !b || !c || ![a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z].every(Number.isFinite))
    return NaN;
  const u = [a.x - b.x, a.y - b.y, a.z! - b.z!],
    v = [c.x - b.x, c.y - b.y, c.z! - b.z!];
  const length = Math.hypot(...u) * Math.hypot(...v);
  return length > 1e-8
    ? (Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, n, i) => sum + n * v[i]!, 0) / length))) *
        180) /
        Math.PI
    : NaN;
}
export function observeArm(
  points: PosePoint[],
  width: number,
  height: number,
  time: number,
  side: BodySide,
  world: PosePoint[] = [],
  source?: 'image' | 'world',
): ArmObservation | null {
  if (![width, height, time].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const [s, e, w] = SIDES[side],
    shoulder = points[s],
    elbow = points[e],
    wrist = points[w];
  if (!usableArmPoint(shoulder) || !usableArmPoint(elbow) || !usableArmPoint(wrist)) return null;
  if (
    Math.hypot((shoulder.x - elbow.x) * width, (shoulder.y - elbow.y) * height) < width * 0.015 ||
    Math.hypot((wrist.x - elbow.x) * width, (wrist.y - elbow.y) * height) < width * 0.015
  )
    return null;
  const image = jointAngle(shoulder, elbow, wrist, width, height);
  const spatial = worldAngle(world[s], world[e], world[w]);
  const metric =
    source ??
    (Number.isFinite(spatial) && !(image >= 110 && image - spatial > 40) ? 'world' : 'image');
  const angle = metric === 'world' ? spatial : image;
  if (!Number.isFinite(angle)) return null;
  return {
    angle,
    side,
    time,
    source: metric,
    confidence: Math.min(shoulder.visibility!, elbow.visibility!, wrist.visibility!),
  };
}
export function observePushup(
  points: PosePoint[],
  width: number,
  height: number,
  time: number,
  side?: BodySide,
): ArmObservation | null {
  const candidates = (side ? [side] : (['left', 'right'] as BodySide[]))
    .map((candidate) => observeArm(points, width, height, time, candidate, [], 'image'))
    .filter((sample): sample is ArmObservation => sample !== null);
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}

export function calibrationAngle(samples: Observation[], side: BodySide, now: number) {
  const recent = samples.filter(
    (sample) => sample.side === side && now - sample.time <= 1200 && now >= sample.time,
  );
  if (
    recent.length < 6 ||
    recent.at(-1)!.time - recent[0]!.time < 500 ||
    now - recent.at(-1)!.time > 300
  ) {
    throw new Error(
      'Hold the position steadily for about one second, with your whole body visible.',
    );
  }
  const values = recent.map((sample) => sample.angle);
  if (Math.max(...values) - Math.min(...values) > 12)
    throw new Error('Movement is still changing. Hold still briefly and try again.');
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class PushupCounter {
  constructor(
    private options: {
      maxFrameGapMs?: number;
      stableFrames?: number;
      stableTimeMs?: number;
      smoothingAlpha?: number;
    } = {},
  ) {}
  count = 0;
  phase: 'find-top' | 'up' | 'down' = 'find-top';
  private up = 150;
  private down = 95;
  private lastTime = -1;
  private smooth: number | null = null;
  private candidate = '';
  private since = 0;
  private frames = 0;
  private armedAt = 0;

  setThresholds(up: number, down: number) {
    if (![up, down].every(Number.isFinite) || down < 0 || up > 180 || up - down < 15)
      throw new Error('Counting thresholds must be finite and clearly separated.');
    this.up = up;
    this.down = down;
    this.interrupt();
  }

  calibrate(top: number, bottom: number) {
    if (
      !Number.isFinite(top) ||
      !Number.isFinite(bottom) ||
      top < 140 ||
      top > 180 ||
      bottom < 30 ||
      bottom > 140 ||
      top - bottom < 30
    ) {
      throw new Error(
        'The two positions are too similar or unclear. Reposition the camera and capture both again.',
      );
    }
    this.up = top - 8;
    this.down = bottom + 8;
    this.interrupt();
  }
  interrupt() {
    this.phase = 'find-top';
    this.smooth = null;
    this.candidate = '';
    this.frames = 0;
    this.lastTime = -1;
  }
  reset() {
    this.count = 0;
    this.interrupt();
  }
  update(angle: number | null, time: number) {
    if (!Number.isFinite(time) || time <= this.lastTime) return false;
    if (angle === null || !Number.isFinite(angle)) {
      this.interrupt();
      return false;
    }
    if (this.lastTime >= 0 && time - this.lastTime > (this.options.maxFrameGapMs ?? 450))
      this.interrupt();
    this.lastTime = time;
    const alpha = this.options.smoothingAlpha ?? 0.5;
    this.smooth = this.smooth === null ? angle : this.smooth * (1 - alpha) + angle * alpha;
    const position = this.smooth >= this.up ? 'up' : this.smooth <= this.down ? 'down' : '';
    // Resting at the top is not time spent performing the next rep.
    if (this.phase === 'up' && position === 'up') this.armedAt = time;
    if (!position) {
      this.candidate = '';
      this.frames = 0;
      return false;
    }
    if (this.candidate !== position) {
      this.candidate = position;
      this.since = time;
      this.frames = 1;
    } else this.frames++;
    if (
      this.frames < (this.options.stableFrames ?? 3) ||
      time - this.since < (this.options.stableTimeMs ?? 150)
    )
      return false;
    if (position === 'up' && this.phase === 'find-top') {
      this.phase = 'up';
      this.armedAt = time;
    } else if (position === 'down' && this.phase === 'up') this.phase = 'down';
    else if (position === 'up' && this.phase === 'down' && time - this.armedAt >= 400) {
      this.count = Math.min(1000, this.count + 1);
      this.phase = 'up';
      this.armedAt = time;
      return true;
    }
    return false;
  }
}
