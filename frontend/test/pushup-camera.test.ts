import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PushupCounter,
  observePushup,
  calibrationAngle,
  jointAngle,
  type PosePoint,
} from '../src/utils/pushupCounter';
import { PoseCamera } from '../src/utils/poseCamera';

function feed(counter: PushupCounter, angle: number, start: number, frames = 8) {
  for (let index = 0; index < frames; index++) counter.update(angle, start + index * 100);
}
function pose(angle = 170): PosePoint[] {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0, presence: 1 }));
  const good = { visibility: 0.95, presence: 1 };
  points[11] = { x: 0.2, y: 0.35, ...good };
  points[13] = { x: 0.2 + 96 / Math.tan((angle * Math.PI) / 360) / 640, y: 0.55, ...good };
  points[15] = { x: 0.2, y: 0.75, ...good };
  points[23] = { x: 0.5, y: 0.39545, ...good };
  points[25] = { x: 0.7, y: 0.42575, ...good };
  points[27] = { x: 0.86, y: 0.45, ...good };
  return points;
}

describe('push-up geometry and calibration', () => {
  it('measures pixel-correct elbow angles and selects a visible arm', () => {
    expect(observePushup(pose(90), 640, 480, 100)?.angle).toBeCloseTo(90);
    expect(observePushup(pose(170), 640, 480, 100)?.side).toBe('left');
    expect(jointAngle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, 640, 480)).toBeCloseTo(90);
  });
  it('rejects unusable arm landmarks but does not require lower-body visibility', () => {
    expect(observePushup([], 640, 480, 100)).toBeNull();
    for (const patch of [{ visibility: 0.2 }, { x: 1.4 }, { visibility: NaN }]) {
      const points = pose();
      points[11] = { ...points[11]!, ...patch };
      expect(observePushup(points, 640, 480, 100)).toBeNull();
    }
    const points = pose();
    points[13] = { ...points[11]! };
    expect(observePushup(points, 640, 480, 100)).toBeNull();
    const cropped = pose();
    for (const id of [23, 25, 27]) cropped[id]!.visibility = 0;
    expect(observePushup(cropped, 640, 480, 100)?.side).toBe('left');
    expect(observePushup(pose(), 640, 480, 100, 'right')).toBeNull();
  });
  it('requires recent stable samples and separated calibration positions', () => {
    const samples = Array.from({ length: 7 }, (_, index) => ({
      angle: 170,
      side: 'left' as const,
      time: 400 + index * 100,
    }));
    expect(calibrationAngle(samples, 'left', 1000)).toBe(170);
    expect(() => calibrationAngle(samples, 'right', 1000)).toThrow();
    expect(() => calibrationAngle(samples, 'left', 3000)).toThrow();
    samples[0]!.angle = 140;
    expect(() => calibrationAngle(samples, 'left', 1000)).toThrow();
    expect(() => new PushupCounter().calibrate(170, 160)).toThrow();
  });
});

describe('full-rep state machine', () => {
  it('counts only complete up-down-up cycles, not a starting bottom or held positions', () => {
    const counter = new PushupCounter();
    counter.calibrate(170, 90);
    feed(counter, 90, 0);
    feed(counter, 170, 800);
    expect(counter.count).toBe(0);
    feed(counter, 90, 1600);
    feed(counter, 90, 2400);
    feed(counter, 170, 3200);
    expect(counter.count).toBe(1);
    feed(counter, 170, 4000);
    expect(counter.count).toBe(1);
    feed(counter, 90, 4800);
    feed(counter, 170, 5600);
    expect(counter.count).toBe(2);
  });
  it('does not bridge a rep across tracking loss, pause, gaps or a reset', () => {
    const counter = new PushupCounter();
    counter.calibrate(170, 90);
    feed(counter, 170, 0);
    feed(counter, 90, 800);
    counter.update(null, 1600);
    feed(counter, 170, 1700);
    expect(counter.count).toBe(0);
    feed(counter, 90, 2500);
    counter.interrupt();
    feed(counter, 170, 3300);
    expect(counter.count).toBe(0);
    feed(counter, 90, 4100);
    feed(counter, 170, 6000);
    expect(counter.count).toBe(0);
    feed(counter, 90, 6800);
    feed(counter, 170, 7600);
    expect(counter.count).toBe(1);
    counter.reset();
    expect(counter.count).toBe(0);
    expect(counter.phase).toBe('find-top');
  });
  it('ignores threshold flicker, invalid values and out-of-order timestamps', () => {
    const counter = new PushupCounter();
    counter.calibrate(170, 90);
    feed(counter, 170, 0);
    for (let index = 0; index < 20; index++)
      counter.update(index % 2 ? 110 : 97, 800 + index * 100);
    feed(counter, 170, 2800);
    expect(counter.count).toBe(0);
    counter.update(NaN, 3700);
    counter.update(90, 3600);
    counter.update(170, NaN);
    expect(counter.count).toBe(0);
  });
});

function cameraFixture(
  media?: () => Promise<MediaStream>,
  captureBitmap?: (video: HTMLVideoElement) => Promise<ImageBitmap>,
) {
  const tracks = [{ stop: vi.fn(), onended: null }];
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream;
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  const video = {
    srcObject: null,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    currentTime: 0,
  } as unknown as HTMLVideoElement;
  let frame: FrameRequestCallback | undefined;
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  const results = vi.fn(),
    errors = vi.fn(),
    states = vi.fn();
  const getMedia = vi.fn(media || (() => Promise.resolve(stream)));
  const camera = new PoseCamera(() => video, results, states, errors, {
    worker: () => worker as unknown as Worker,
    media: getMedia,
    bitmap: captureBitmap ?? vi.fn().mockResolvedValue(bitmap),
    requestFrame: (callback) => {
      frame = callback;
      return 1;
    },
    cancelFrame: vi.fn(),
  });
  const ready = () => worker.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
  return {
    camera,
    worker,
    video,
    tracks,
    stream,
    getMedia,
    ready,
    bitmap,
    results,
    errors,
    states,
    frame: (time: number) => frame?.(time),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('camera lifecycle without hardware access', () => {
  it('stops the camera when the preview freezes before any new video frame arrives', async () => {
    vi.useFakeTimers();
    const fixture = cameraFixture();
    const start = fixture.camera.start();
    fixture.ready();
    await start;
    (fixture.video as unknown as { readyState: number }).readyState = 1;
    fixture.frame(100);
    await vi.advanceTimersByTimeAsync(5100);
    expect(fixture.errors).toHaveBeenCalledWith(expect.stringContaining('preview'));
    expect(fixture.tracks[0]!.stop).toHaveBeenCalled();
  });
  it('stops a frozen preview after a successful inference and can start again', async () => {
    vi.useFakeTimers();
    const fixture = cameraFixture();
    const start = fixture.camera.start();
    fixture.ready();
    await start;
    fixture.frame(100);
    await Promise.resolve();
    fixture.worker.onmessage?.({
      data: { type: 'result', points: [], time: 100, people: 0 },
    } as MessageEvent);
    await vi.advanceTimersByTimeAsync(5100);
    expect(fixture.errors).toHaveBeenCalledOnce();
    expect(fixture.tracks[0]!.stop).toHaveBeenCalledOnce();
    const restart = fixture.camera.start();
    fixture.ready();
    await restart;
    expect(fixture.video.play).toHaveBeenCalledTimes(2);
    fixture.camera.stop();
    await vi.advanceTimersByTimeAsync(6000);
    expect(fixture.errors).toHaveBeenCalledOnce();
  });
  it('times out stalled bitmap capture and closes a bitmap that arrives after shutdown', async () => {
    vi.useFakeTimers();
    let resolveCapture!: (bitmap: ImageBitmap) => void;
    const fixture = cameraFixture(
      undefined,
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    const start = fixture.camera.start();
    fixture.ready();
    await start;
    fixture.frame(100);
    await vi.advanceTimersByTimeAsync(5100);
    expect(fixture.errors).toHaveBeenCalledOnce();
    expect(fixture.tracks[0]!.stop).toHaveBeenCalledOnce();
    resolveCapture(fixture.bitmap);
    await Promise.resolve();
    expect(fixture.bitmap.close).toHaveBeenCalledOnce();
    expect(fixture.worker.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'frame' }),
      expect.anything(),
    );
  });
  it('cleans up a synchronous bitmap capture failure instead of leaving the camera on', async () => {
    const fixture = cameraFixture(undefined, () => {
      throw new Error('Capture failed');
    });
    const start = fixture.camera.start();
    fixture.ready();
    await start;
    expect(() => fixture.frame(100)).not.toThrow();
    expect(fixture.errors).toHaveBeenCalledWith(expect.stringContaining('preview'));
    expect(fixture.tracks[0]!.stop).toHaveBeenCalledOnce();
  });
  it('forwards model-estimated world landmarks to the tracker without uploading frames', async () => {
    const fixture = cameraFixture();
    const preparing = fixture.camera.prepare();
    fixture.ready();
    await preparing;
    const points = [{ x: 0.2, y: 0.3, visibility: 0.9 }];
    const worldPoints = [{ x: 0.1, y: 0.2, z: -0.1 }];
    fixture.worker.onmessage?.({
      data: { type: 'result', points, worldPoints, time: 100, people: 1 },
    } as MessageEvent);
    expect(fixture.results).toHaveBeenCalledWith(points, 100, 1, worldPoints);
    fixture.camera.stop();
  });
  it('keeps native animation cancellation bound to the browser window', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(function (
      this: Window,
    ) {
      expect(this).toBe(window);
    });
    const camera = new PoseCamera(() => null, vi.fn(), vi.fn(), vi.fn());
    expect(() => camera.stop()).not.toThrow();
    expect(cancel).toHaveBeenCalledWith(0);
  });
  it('model preparation never asks for camera permission', async () => {
    const fixture = cameraFixture();
    const preparing = fixture.camera.prepare();
    fixture.ready();
    await preparing;
    expect(fixture.getMedia).not.toHaveBeenCalled();
    fixture.camera.stop();
    expect(fixture.worker.terminate).toHaveBeenCalledOnce();
  });
  it('stops tracks, preview and worker and ignores late results after stop', async () => {
    const fixture = cameraFixture();
    const start = fixture.camera.start();
    fixture.ready();
    await start;
    expect(fixture.video.srcObject).toBe(fixture.stream);
    fixture.frame(100);
    await Promise.resolve();
    expect(fixture.worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'frame' }),
      [fixture.bitmap],
    );
    fixture.camera.stop();
    expect(fixture.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(fixture.video.srcObject).toBeNull();
    fixture.worker.onmessage?.({ data: { type: 'result', points: [], time: 100 } } as MessageEvent);
    expect(fixture.results).not.toHaveBeenCalled();
  });
  it('cancels a permission request safely even if a stream arrives later', async () => {
    let resolveMedia!: (stream: MediaStream) => void;
    const fixture = cameraFixture(
      () =>
        new Promise((resolve) => {
          resolveMedia = resolve;
        }),
    );
    const start = fixture.camera.start();
    fixture.ready();
    await Promise.resolve();
    fixture.camera.stop();
    resolveMedia(fixture.stream);
    await start;
    expect(fixture.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(fixture.video.play).not.toHaveBeenCalled();
  });
  it('reports denied permission and cleans up instead of continuing inference', async () => {
    const fixture = cameraFixture(() =>
      Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    );
    const start = fixture.camera.start();
    fixture.ready();
    await start;
    expect(fixture.errors).toHaveBeenCalledWith(expect.stringContaining('permission was denied'));
    expect(fixture.worker.terminate).toHaveBeenCalledOnce();
    expect(fixture.video.srcObject).toBeNull();
  });
});
