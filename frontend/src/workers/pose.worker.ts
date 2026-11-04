import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

let detector: PoseLandmarker | null = null;
self.onmessage = (event: MessageEvent) => {
  void handle(event.data as { type: string; base?: string; bitmap?: ImageBitmap; time?: number });
};
async function handle(message: {
  type: string;
  base?: string;
  bitmap?: ImageBitmap;
  time?: number;
}) {
  try {
    if (message.type === 'init') {
      const files = await FilesetResolver.forVisionTasks(`${message.base}/wasm`, true);
      detector = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${message.base}/pose_landmarker_lite.task`,
          delegate: 'CPU',
        },
        canvas: new OffscreenCanvas(1, 1),
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      // Exercise the actual inference path without accessing a camera.
      const blank = new OffscreenCanvas(320, 240);
      blank.getContext('2d')!.fillRect(0, 0, 320, 240);
      const bitmap = blank.transferToImageBitmap();
      try {
        detector.detectForVideo(bitmap, 0);
      } finally {
        bitmap.close();
      }
      self.postMessage({ type: 'ready' });
    } else if (message.type === 'frame' && message.bitmap && detector) {
      const result = detector.detectForVideo(message.bitmap, message.time!);
      self.postMessage({
        type: 'result',
        points: result.landmarks.length === 1 ? result.landmarks[0] : [],
        worldPoints: result.landmarks.length === 1 ? result.worldLandmarks[0] : [],
        people: result.landmarks.length,
        time: message.time,
      });
    }
  } catch {
    self.postMessage({
      type: 'error',
      message: 'Pose tracking could not run. Try current Chrome or Edge and reload the page.',
    });
  } finally {
    message.bitmap?.close();
  }
}
