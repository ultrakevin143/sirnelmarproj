import { SIDES, jointAngle, usableArmPoint, type BodySide, type PosePoint } from './pushupCounter';

export type ReadinessState = 'ready' | 'unknown' | 'not-ready' | 'repositioning';
export type Readiness = {
  state: ReadinessState;
  reason: string;
  anchorY?: number;
  groundSpan?: number | null;
};
type Evidence = {
  side: BodySide;
  anchorId: number;
  anchor: PosePoint;
  groundSpan: number | null;
  groundIds: number[];
};

function spatialAngle(a: PosePoint, b: PosePoint, c: PosePoint) {
  const u = [a.x - b.x, a.y - b.y, a.z! - b.z!],
    v = [c.x - b.x, c.y - b.y, c.z! - b.z!];
  const size = Math.hypot(...u) * Math.hypot(...v);
  return size > 0.0025
    ? (Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, n, i) => sum + n * v[i]!, 0) / size))) *
        180) /
        Math.PI
    : NaN;
}

// A conservative pose/context gate, not a form score or a learned classifier.
// If the body context is cropped out we cannot distinguish chest movement
// from standing/leaning, so we do not silently accept that uncertainty.
export class PushupReadinessGate {
  private reference: Evidence | null = null;
  reset() {
    this.reference = null;
  }
  update(points: PosePoint[], world: PosePoint[], width: number, height: number): Readiness {
    if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0)
      return { state: 'unknown', reason: 'Waiting for camera dimensions' };
    let measured = false;
    const evidence: Evidence[] = [];
    const sides: BodySide[] =
      this.reference?.side === 'right' ? ['right', 'left'] : ['left', 'right'];
    for (const side of sides) {
      const [s, , , h, k, a] = SIDES[side];
      const shoulder = points[s],
        hip = points[h],
        knee = points[k];
      if (!usableArmPoint(shoulder) || !usableArmPoint(hip) || !usableArmPoint(knee)) continue;
      if (
        Math.hypot((shoulder.x - hip.x) * width, (shoulder.y - hip.y) * height) < width * 0.04 ||
        Math.hypot((knee.x - hip.x) * width, (knee.y - hip.y) * height) < width * 0.04
      )
        continue;
      measured = true;
      const ws = world[s],
        wh = world[h],
        wk = world[k];
      const spatial =
        !!ws &&
        !!wh &&
        !!wk &&
        [ws.x, ws.y, ws.z, wh.x, wh.y, wh.z, wk.x, wk.y, wk.z].every(Number.isFinite)
          ? spatialAngle(ws, wh, wk)
          : NaN;
      const nonUpright = Number.isFinite(spatial)
        ? spatial >= 130 &&
          Math.hypot(wh!.x - ws!.x, wh!.z! - ws!.z!) >= Math.abs(wh!.y - ws!.y) * 0.9
        : jointAngle(shoulder, hip, knee, width, height) >= 130 &&
          Math.abs(hip.x - shoulder.x) * width >= Math.abs(hip.y - shoulder.y) * height * 0.9;
      if (!nonUpright) continue;
      // Feet are a steadier reference than wrists, which may be cropped. A
      // knee is the fallback (also accommodates knee-supported push-ups).
      const anchorId = usableArmPoint(points[a]) ? a : k;
      const pairs = [this.reference?.groundIds ?? [], [27, 28], [25, 26], [k, a]];
      let groundSpan: number | null = null;
      let groundIds: number[] = [];
      for (const pair of pairs) {
        const first = points[pair[0]!],
          second = points[pair[1]!];
        if (!usableArmPoint(first) || !usableArmPoint(second)) continue;
        const span = Math.hypot(first.x - second.x, first.y - second.y);
        if (span < 0.04) continue;
        groundSpan = span;
        groundIds = pair;
        break;
      }
      evidence.push({ side, anchorId, anchor: points[anchorId]!, groundSpan, groundIds });
    }
    const sample = evidence[0];
    if (!sample) {
      if (measured) this.reset();
      return measured
        ? {
            state: 'not-ready',
            reason: 'Getting into position · push-up body position not detected',
          }
        : {
            state: 'unknown',
            reason: 'Show one shoulder, hip and knee to confirm push-up position',
          };
    }
    const previous = this.reference;
    const moved =
      previous &&
      (sample.side !== previous.side ||
        sample.anchorId !== previous.anchorId ||
        sample.groundIds.join(':') !== previous.groundIds.join(':') ||
        Math.hypot(sample.anchor.x - previous.anchor.x, sample.anchor.y - previous.anchor.y) >
          0.045 ||
        (sample.groundSpan !== null &&
          previous.groundSpan !== null &&
          Math.abs(sample.groundSpan / previous.groundSpan - 1) > 0.18));
    if (!previous || moved) this.reference = sample;
    return moved
      ? { state: 'repositioning', reason: 'Repositioning detected · unfinished rep discarded' }
      : {
          state: 'ready',
          reason: 'Push-up position detected · no hold needed',
          anchorY: sample.anchor.y,
          groundSpan: sample.groundSpan,
        };
  }
}
