import type { PosePoint } from './pushupCounter';
import { Capacitor } from '@capacitor/core';
export type CameraState = 'off' | 'loading' | 'requesting' | 'on';
type Dependencies = {
  worker: () => Worker;
  media: () => Promise<MediaStream>;
  bitmap: (video: HTMLVideoElement) => Promise<ImageBitmap>;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
};
export class PoseCamera {
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private generation = 0;
  private frame = 0;
  private busy = false;
  private lastFrame = -1;
  private videoTime = -1;
  private ready = false;
  private preparing: Promise<void> | null = null;
  private rejectPreparation: ((reason: Error) => void) | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private frameTimeout: ReturnType<typeof setTimeout> | null = null;
  private previewTimeout: ReturnType<typeof setTimeout> | null = null;
  private requesting = false;
  private deps: Dependencies;
  constructor(
    private video: () => HTMLVideoElement | null,
    private result: (
      points: PosePoint[],
      time: number,
      people: number,
      worldPoints: PosePoint[],
    ) => void,
    private state: (state: CameraState) => void,
    private error: (message: string) => void,
    dependencies?: Partial<Dependencies>,
  ) {
    this.deps = {
      worker: () =>
        new Worker(new URL('../workers/pose.worker.ts', import.meta.url), { type: 'module' }),
      media: () =>
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        }),
      bitmap: (video) => createImageBitmap(video),
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
      ...dependencies,
    };
  }
  prepare() {
    if (this.ready) return Promise.resolve();
    if (this.preparing) return this.preparing;
    this.state('loading');
    const generation = this.generation;
    this.preparing = new Promise<void>((resolve, reject) => {
      this.rejectPreparation = reject;
      const worker = this.deps.worker();
      this.worker = worker;
      worker.onmessage = (
        event: MessageEvent<{
          type: string;
          points: PosePoint[];
          worldPoints?: PosePoint[];
          time: number;
          people: number;
          message: string;
        }>,
      ) => {
        if (generation !== this.generation) return;
        const data = event.data;
        if (data.type === 'ready') {
          if (this.timeout) clearTimeout(this.timeout);
          this.timeout = null;
          this.ready = true;
          this.rejectPreparation = null;
          this.state('off');
          resolve();
        } else if (data.type === 'result') {
          if (this.frameTimeout) clearTimeout(this.frameTimeout);
          this.frameTimeout = null;
          this.busy = false;
          this.result(data.points, data.time, data.people, data.worldPoints ?? []);
        } else if (data.type === 'error') this.fail(data.message);
      };
      worker.onerror = () =>
        this.fail('Tracking model failed to load. Reload and try current Chrome or Edge.');
      this.timeout = setTimeout(
        () => this.fail('Tracking model timed out. Reload and check the local model assets.'),
        30000,
      );
      worker.postMessage({
        type: 'init',
        base: new URL(`${import.meta.env.BASE_URL}pose`, location.href).href,
      });
    });
    return this.preparing;
  }
  async start() {
    if (this.requesting || this.stream) return;
    this.requesting = true;
    const generation = this.generation;
    try {
      await this.prepare();
      if (generation !== this.generation) return;
      this.state('requesting');
      const stream = await this.deps.media();
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const video = this.video();
      if (!video) throw new Error('Preview unavailable.');
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => this.fail('Camera disconnected or permission was revoked.');
      });
      video.srcObject = stream;
      this.watchPreview();
      await video.play();
      if (generation !== this.generation) return;
      this.state('on');
      this.loop(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      const name =
        typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
      this.fail(
        name === 'NotAllowedError'
          ? Capacitor.isNativePlatform()
            ? 'Camera permission was denied. Open Android Settings > Apps > LiftUp > Permissions, allow Camera, then return and try again.'
            : 'Camera permission was denied. Allow it in the browser, then try again.'
          : name === 'NotFoundError'
            ? 'No camera was found. Connect or enable your webcam.'
            : name === 'NotReadableError'
              ? 'Camera is busy. Close other apps using it, then try again.'
              : Capacitor.isNativePlatform()
                ? 'Camera or tracking could not start. Close other camera apps, reopen LiftUp and try again.'
                : 'Camera or model could not start. Use localhost in current Chrome or Edge.',
      );
    } finally {
      if (generation === this.generation) this.requesting = false;
    }
  }
  private watchPreview() {
    if (this.previewTimeout) clearTimeout(this.previewTimeout);
    this.previewTimeout = setTimeout(
      () => this.fail('Camera preview stopped updating. Restart the camera to try again.'),
      5000,
    );
  }
  private loop(generation: number) {
    this.frame = this.deps.requestFrame((time) => {
      if (generation !== this.generation || !this.stream) return;
      this.loop(generation);
      const video = this.video();
      if (
        !video ||
        video.readyState < 2 ||
        !video.videoWidth ||
        this.busy ||
        time - this.lastFrame < 100 ||
        video.currentTime === this.videoTime
      )
        return;
      this.busy = true;
      this.lastFrame = time;
      this.videoTime = video.currentTime;
      this.watchPreview();
      // Cover both bitmap capture and worker inference; either can stall.
      this.frameTimeout = setTimeout(
        () =>
          this.fail('Tracking stopped responding. Camera has been stopped; restart to try again.'),
        5000,
      );
      const captureFailed = () => {
        if (generation === this.generation)
          this.fail('Could not read the camera preview. Restart the camera.');
      };
      let capture: Promise<ImageBitmap>;
      try {
        capture = this.deps.bitmap(video);
      } catch {
        captureFailed();
        return;
      }
      void capture
        .then((bitmap) => {
          if (generation !== this.generation || !this.worker) {
            bitmap.close();
            return;
          }
          this.worker.postMessage({ type: 'frame', bitmap, time }, [bitmap]);
        })
        .catch(captureFailed);
    });
  }
  private fail(message: string) {
    this.stop();
    this.error(message);
  }
  stop() {
    this.generation++;
    this.deps.cancelFrame(this.frame);
    if (this.timeout) clearTimeout(this.timeout);
    if (this.frameTimeout) clearTimeout(this.frameTimeout);
    if (this.previewTimeout) clearTimeout(this.previewTimeout);
    this.timeout = null;
    this.frameTimeout = null;
    this.previewTimeout = null;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    const video = this.video();
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    this.worker?.terminate();
    this.worker = null;
    this.rejectPreparation?.(new DOMException('Stopped', 'AbortError'));
    this.rejectPreparation = null;
    this.preparing = null;
    this.ready = false;
    this.busy = false;
    this.lastFrame = -1;
    this.videoTime = -1;
    this.requesting = false;
    this.state('off');
  }
}
