import { PushupCounter, observePushup, type PosePoint, type BodySide } from './pushupCounter';
import { observeFrontPushup } from './frontPushup';
import { observeSkeletonMotion, SkeletonMotionCounter } from './skeletonPushup';
import { ChestPushupTracker } from './chestPushup';
import { PushupReadinessGate, type ReadinessState } from './pushupReadiness';

export type PushupView = 'side' | 'front';
export type ViewSelection = 'auto' | PushupView;
export type TrackingStrategy = 'chest' | 'arms';
export type TrackingDiagnostics = {
  readiness?: ReadinessState;
  readinessReason?: string;
  method: 'elbow-angle' | 'up-down' | 'chest';
  movementProgress?: number;
  movementChannel?: string | null;
  landmarkGroup?: string | null;
  frameIntervalMs: number | null;
  baselineAngle: number | null;
  arm: BodySide | null;
  source: 'image' | 'world' | null;
  lastInterruption: string;
};
export type AutomaticReading = {
  count: number;
  angle: number | null;
  view: PushupView | null;
  phase: 'find-top' | 'up' | 'down';
  status: string;
  diagnostics: TrackingDiagnostics;
  chestPoint?: { x: number; y: number } | null;
};

// Counts arm bend/return patterns, not posture quality or certified push-up depth.
export class AutomaticPushupTracker {
  // Endpoint holds are not required. Hysteresis and a 400 ms full-cycle minimum
  // reject small jitter; sparse inference must still observe both endpoints.
  private counter = new PushupCounter({
    maxFrameGapMs: 2500,
    stableFrames: 1,
    stableTimeMs: 0,
    smoothingAlpha: 1,
  });
  private view: PushupView | null = null;
  private bodySide: BodySide | undefined;
  private source: 'image' | 'world' | undefined;
  private top: number | null = null;
  private baselines = new Map<string, number>();
  private frameInterval: number | null = null;
  private lastInterruption = 'None';
  private time = -1;
  private visibleTime = -1;
  private method: 'elbow-angle' | 'up-down' = 'elbow-angle';
  private motion = new SkeletonMotionCounter();
  private chest = new ChestPushupTracker();
  private gate = new PushupReadinessGate();
  private readiness: { state: ReadinessState; reason: string } = {
    state: 'unknown',
    reason: 'Waiting for body position',
  };
  private readyTime = -1;
  constructor(
    private selection: ViewSelection = 'auto',
    private strategy: TrackingStrategy = 'arms',
  ) {}
  reset(selection: ViewSelection = this.selection, strategy: TrackingStrategy = this.strategy) {
    this.strategy = strategy;
    this.chest.reset();
    this.gate.reset();
    this.readyTime = -1;
    this.readiness = { state: 'unknown', reason: 'Waiting for body position' };
    this.selection = selection;
    this.counter.reset();
    this.motion.reset();
    this.method = 'elbow-angle';
    this.interrupt('New capture');
    this.view = null;
    this.bodySide = undefined;
    this.source = undefined;
    this.top = null;
    this.baselines.clear();
    this.frameInterval = null;
    this.time = -1;
  }
  interrupt(reason = 'Counting stopped or paused') {
    this.counter.interrupt();
    this.motion.interrupt();
    this.chest.interrupt();
    this.lastInterruption = reason;
    this.visibleTime = -1;
  }
  update(
    points: PosePoint[],
    world: PosePoint[],
    width: number,
    height: number,
    time: number,
    people = 1,
    enabled = true,
  ): AutomaticReading {
    const reading = (angle: number | null, status: string, visible = true): AutomaticReading => ({
      count: Math.min(1000, this.counter.count + this.motion.count),
      angle,
      view: visible ? this.view : null,
      phase: this.method === 'up-down' ? this.motion.phase : this.counter.phase,
      status,
      diagnostics: {
        readiness: this.readiness.state,
        readinessReason: this.readiness.reason,
        method: this.method,
        frameIntervalMs: this.frameInterval,
        baselineAngle: this.method === 'up-down' ? null : this.top,
        arm: this.bodySide ?? null,
        source: this.method === 'up-down' ? 'image' : (this.source ?? null),
        lastInterruption: this.lastInterruption,
      },
    });
    const fresh = Number.isFinite(time) && time > this.time;
    if (fresh) this.frameInterval = this.time >= 0 ? time - this.time : null;
    if (this.strategy === 'chest') {
      if (fresh) this.time = time;
      const result = this.chest.update(points, time, people, enabled, world, width, height);
      if (result.interruption) this.lastInterruption = result.interruption;
      return {
        count: result.count,
        angle: null,
        view: null,
        phase: result.phase,
        status: result.status,
        chestPoint: result.point,
        diagnostics: {
          readiness: result.readiness.state,
          readinessReason: result.readiness.reason,
          method: 'chest',
          frameIntervalMs: this.frameInterval,
          baselineAngle: null,
          arm: null,
          source: 'image',
          lastInterruption: this.lastInterruption,
          movementProgress: result.progress,
          movementChannel: result.channel,
          landmarkGroup: result.landmarkGroup,
        },
      };
    }
    if (!fresh) return reading(null, 'Waiting for a fresh frame', false);
    if (this.frameInterval !== null && this.frameInterval > 2500) this.interrupt('Long frame gap');
    this.time = time;
    if (!enabled || people > 1) {
      this.gate.reset();
      this.readiness = {
        state: 'unknown',
        reason: !enabled ? 'Counting paused' : 'Multiple people',
      };
      this.interrupt(!enabled ? 'Counting paused' : 'Multiple people');
      return reading(
        null,
        !enabled
          ? 'Counting paused · camera is still on'
          : 'More than one person · counting paused',
        false,
      );
    }
    this.readiness = this.gate.update(people === 1 ? points : [], world, width, height);
    if (this.readiness.state !== 'ready') {
      const uncertainBriefly =
        this.readiness.state === 'unknown' && this.readyTime >= 0 && time - this.readyTime <= 600;
      if (!uncertainBriefly) {
        this.interrupt(this.readiness.reason);
        this.top = null;
        this.baselines.clear();
      }
      return reading(null, this.readiness.reason, false);
    }
    this.readyTime = time;
    const side =
      people === 1 && this.selection !== 'front'
        ? (observePushup(points, width, height, time, this.bodySide) ??
          observePushup(points, width, height, time))
        : null;
    const front =
      people === 1 && this.selection !== 'side'
        ? (observeFrontPushup(
            points,
            world,
            width,
            height,
            time,
            this.bodySide,
            this.view === 'front' ? this.source : undefined,
            this.selection === 'front' || this.view === 'front',
          ) ??
          observeFrontPushup(
            points,
            world,
            width,
            height,
            time,
            undefined,
            undefined,
            this.selection === 'front' || this.view === 'front',
          ))
        : null;
    const view: PushupView | null =
      this.view === 'front' && front
        ? 'front'
        : this.view === 'side' && side
          ? 'side'
          : front
            ? 'front'
            : side
              ? 'side'
              : null;
    const motion =
      people === 1
        ? observeSkeletonMotion(
            points,
            this.method === 'up-down' ? this.motion.side : this.bodySide,
          )
        : null;
    // Once fallback starts, stay on that measurement path even if a shoulder
    // reappears. Switching back mid-cycle would reset or double-count the rep.
    if (motion && (!view || this.method === 'up-down')) {
      if (this.method !== 'up-down') {
        this.interrupt('Using skeleton up/down fallback');
        this.method = 'up-down';
      }
      this.visibleTime = time;
      this.bodySide = motion.side;
      if (this.motion.update(motion, time))
        this.lastInterruption = 'Movement reference acquired or changed';
      return reading(
        null,
        this.motion.phase === 'down'
          ? 'Down movement detected · return up to count'
          : this.motion.phase === 'find-top'
            ? 'Skeleton found · return toward your up position'
            : 'Tracking skeleton up/down · no shoulder lock needed',
      );
    }
    if (!view || this.method === 'up-down') {
      const briefLoss = this.visibleTime >= 0 && time - this.visibleTime <= 600;
      if (!briefLoss) this.interrupt('Arm not visible');
      return reading(
        null,
        briefLoss
          ? 'Arm briefly hidden · waiting for the next clear frame'
          : people === 0
            ? 'Looking for you · bring an elbow and hand into view'
            : 'Person detected · show an elbow and wrist from the same arm',
        false,
      );
    }
    const sample = view === 'front' ? front! : side!;
    if (this.view !== view || this.source !== sample.source || this.bodySide !== sample.side) {
      this.interrupt(this.view === null ? 'None' : 'Tracking arm or measurement changed');
      this.view = view;
      this.source = sample.source;
      this.bodySide = sample.side;
      this.top = this.baselines.get(`${view}:${sample.source}:${sample.side}`) ?? null;
      if (this.top !== null) this.counter.setThresholds(this.top - 10, this.top - 30);
    }
    this.visibleTime = time;
    if (this.top === null) {
      if (sample.angle < 100) {
        return reading(sample.angle, 'Arm found · return toward your up position to begin');
      }
      this.top = sample.angle;
      this.counter.setThresholds(this.top - 10, this.top - 30);
    } else if (sample.angle > this.top + 12 && this.counter.phase !== 'down') {
      this.top = sample.angle;
      this.counter.setThresholds(this.top - 10, this.top - 30);
    }
    this.baselines.set(`${view}:${sample.source}:${sample.side}`, this.top);
    this.counter.update(sample.angle, time);
    return reading(
      sample.angle,
      this.counter.phase === 'down'
        ? 'Down detected · return up to count'
        : this.counter.phase === 'find-top'
          ? 'Position found · return up to begin'
          : 'Tracking your arm · lower and return up',
    );
  }
}
