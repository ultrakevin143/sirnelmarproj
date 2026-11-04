<template>
  <q-page class="camera-page">
    <div class="camera-shell">
      <RouterLink class="back-link" to="/app">← Back to workout</RouterLink>
      <header class="camera-heading">
        <div>
          <p class="eyebrow">MOVEMENT LAB · EXPERIMENTAL</p>
          <h2>Push-up counter</h2>
          <p>Automatic setup. Side or front view. Up → down → up counts one rep.</p>
        </div>
        <span class="privacy-note"
          ><q-icon name="videocam_off" /> On-device only · no recording</span
        >
      </header>

      <fieldset
        class="view-selector"
        :disabled="cameraState !== 'off' || loadingModel || reviewing || saving || saved"
      >
        <legend>What to track</legend>
        <label
          ><input
            v-model="trackingStrategy"
            type="radio"
            name="tracking-strategy"
            value="chest"
            @change="resetCapture"
          />
          Chest / torso movement</label
        >
        <label
          ><input
            v-model="trackingStrategy"
            type="radio"
            name="tracking-strategy"
            value="arms"
            @change="resetCapture"
          />
          Arm movement</label
        >
        <p>
          Chest mode does not need visible elbows or wrists. The ring marks an estimated upper-body
          point, not a detected chest surface.
        </p>
      </fieldset>
      <fieldset
        v-if="trackingStrategy === 'arms'"
        class="view-selector"
        :disabled="cameraState !== 'off' || loadingModel || reviewing || saving || saved"
      >
        <legend>Camera position</legend>
        <label
          ><input
            v-model="viewMode"
            type="radio"
            name="camera-view"
            value="auto"
            @change="resetCapture"
          />
          Auto detect</label
        >
        <label
          ><input
            v-model="viewMode"
            type="radio"
            name="camera-view"
            value="side"
            @change="resetCapture"
          />
          Side view</label
        >
        <label
          ><input
            v-model="viewMode"
            type="radio"
            name="camera-view"
            value="front"
            @change="resetCapture"
          />
          Front view <span>Experimental</span></label
        >
        <p>
          No manual calibration. Auto detects your view; Side and Front let you choose explicitly.
          Stop and start a new set to change this choice.
        </p>
      </fieldset>

      <div class="camera-grid">
        <section class="preview-panel" aria-label="Camera preview">
          <div class="preview-stage">
            <video ref="video" autoplay muted playsinline aria-label="Live camera preview" />
            <canvas ref="overlay" aria-hidden="true" />
            <div v-if="cameraState !== 'on'" class="preview-placeholder">
              <q-icon name="videocam" size="36px" />
              <h3>
                {{
                  cameraState === 'loading'
                    ? 'Preparing on-device tracking…'
                    : cameraState === 'requesting'
                      ? 'Waiting for camera permission…'
                      : 'Your camera is off'
                }}
              </h3>
              <p>No camera access until you choose Start camera. {{ positioning }}</p>
            </div>
            <span v-if="cameraState === 'on'" class="live-label"
              ><span /> Camera on{{
                !counting
                  ? ' · paused'
                  : trackingDiagnostics?.readiness === 'ready'
                    ? ' · ready'
                    : ' · finding position'
              }}</span
            >
          </div>
          <div class="preview-controls">
            <button
              v-if="cameraState === 'off' && !reviewing"
              class="primary-button"
              :disabled="saving || loadingModel"
              @click="startCamera"
            >
              Start camera
            </button>
            <button v-if="cameraState !== 'off'" class="secondary-button" @click="stopAndReview">
              {{ cameraState === 'on' ? 'Stop camera & review' : 'Cancel camera request' }}
            </button>
            <button
              v-if="cameraState === 'on' && !reviewing"
              class="secondary-button"
              @click="toggleCounting"
            >
              {{ counting ? 'Pause counting' : 'Resume counting' }}
            </button>
            <button
              v-if="cameraState === 'off' && !reviewing"
              class="text-button"
              :disabled="loadingModel"
              @click="checkModel"
            >
              Check tracking model (no camera)
            </button>
          </div>
          <p class="state-message" role="status" aria-live="polite">{{ message }}</p>
          <p v-if="error" class="error-message" role="alert">{{ error }}</p>
          <p class="camera-footnote">
            Camera stops on navigation, when this tab is hidden, or if tracking fails. Counts are
            estimates, not a form or safety assessment.
          </p>
        </section>

        <aside class="counter-panel">
          <div class="count-display">
            <span>Estimated reps</span
            ><strong aria-live="polite" aria-atomic="true">{{ count }}</strong>
            <p>{{ trackingLabel }}</p>
            <p
              class="readiness-status"
              :data-ready="trackingDiagnostics?.readiness === 'ready'"
              role="status"
            >
              {{
                cameraState !== 'on'
                  ? 'Position check starts with the camera'
                  : !counting
                    ? 'Counting paused'
                    : trackingDiagnostics?.readiness === 'ready'
                      ? 'Position detected · counting enabled'
                      : 'Not counting · checking position / repositioning'
              }}
            </p>
            <span class="angle-readout">{{
              trackingStrategy === 'chest'
                ? 'Chest / torso movement · estimate'
                : trackingDiagnostics?.method === 'up-down'
                  ? 'Skeleton up/down · body context checked'
                  : `${currentAngle === null ? '—' : Math.round(currentAngle) + '°'} tracked elbow angle · estimate`
            }}</span>
            <div v-if="trackingStrategy === 'chest'" class="movement-feedback">
              <label for="chest-movement">Observed movement</label>
              <progress
                id="chest-movement"
                max="100"
                :value="
                  cameraState === 'on' && trackingDiagnostics?.readiness === 'ready'
                    ? (trackingDiagnostics?.movementProgress ?? 0)
                    : 0
                "
              />
              <span>{{
                cameraState !== 'on'
                  ? 'Start camera to follow chest movement'
                  : trackingDiagnostics?.readiness !== 'ready'
                    ? 'Waiting for a visible push-up position'
                    : trackingPhase === 'down'
                      ? 'Return up to finish this rep'
                      : 'Lower and return up · no hold'
              }}</span>
            </div>
          </div>
          <section class="setup-section" aria-label="Automatic setup">
            <h3>Ready when you are</h3>
            <p>{{ positioning }}</p>
            <ol>
              <li>Start the camera and get into your starting / up position.</li>
              <li>No setup hold. Once “Position detected” appears, move at your normal pace.</li>
              <li>Lower and return up. One full cycle adds one rep.</li>
            </ol>
            <p class="detected-view" role="status">
              {{
                trackingStrategy === 'chest'
                  ? 'Tracking: Chest / torso movement · experimental'
                  : trackingDiagnostics?.method === 'up-down'
                    ? 'Tracking: Skeleton up/down · experimental'
                    : detectedView
                      ? `Tracking: ${detectedView === 'front' ? 'Front view · experimental' : 'Side view'}`
                      : 'Waiting for a visible elbow and hand'
              }}
            </p>
            <p v-if="trackingStrategy === 'chest'" class="front-caution">
              The ring estimates your upper-body location from shoulders or a shoulder/hip pair.
              Chest mode follows vertical travel or apparent shoulder-size changes toward the
              camera. It cannot measure floor distance or verify form. Keep the laptop still;
              leaning, body rotation and other movements can cause false counts. Review the estimate
              before saving.
            </p>
            <p v-else-if="viewMode !== 'side'" class="front-caution">
              Arm fallback can follow elbow/wrist movement, but still needs a visible shoulder, hip
              and knee for the position check. Moving into place or changing the lower-body
              reference discards an unfinished rep. This is not a form or floor-depth assessment;
              other movements in a similar pose may still cause false counts.
            </p>
          </section>
          <details class="tracking-details">
            <summary>Tracking details</summary>
            <p v-if="!trackingDiagnostics">Start the camera to see tracking timing and position.</p>
            <template v-else>
              <dl>
                <dt>Tracking method</dt>
                <dd>
                  {{
                    trackingDiagnostics.method === 'chest'
                      ? 'Chest / torso'
                      : trackingDiagnostics.method === 'up-down'
                        ? 'Skeleton up/down'
                        : 'Elbow angle'
                  }}
                </dd>
                <dt>Movement state</dt>
                <dd>{{ trackingPhase }}</dd>
                <dt>Position check</dt>
                <dd>{{ trackingDiagnostics.readiness ?? 'unknown' }}</dd>
                <dt>Position detail</dt>
                <dd>{{ trackingDiagnostics.readinessReason }}</dd>
                <dt>Frame interval</dt>
                <dd>
                  {{
                    trackingDiagnostics.frameIntervalMs === null
                      ? 'First frame'
                      : `${Math.round(trackingDiagnostics.frameIntervalMs)} ms`
                  }}
                </dd>
                <template v-if="trackingStrategy === 'chest'">
                  <dt>Body reference</dt>
                  <dd>{{ trackingDiagnostics.landmarkGroup ?? 'Not visible yet' }}</dd>
                  <dt>Movement cue</dt>
                  <dd>{{ trackingDiagnostics.movementChannel ?? 'Waiting for movement' }}</dd>
                </template>
                <dt v-if="trackingStrategy === 'arms'">Starting angle</dt>
                <dd v-if="trackingStrategy === 'arms'">
                  {{
                    trackingDiagnostics.baselineAngle === null
                      ? 'Not found yet'
                      : `${Math.round(trackingDiagnostics.baselineAngle)}°`
                  }}
                </dd>
                <dt v-if="trackingStrategy === 'arms'">Tracked arm</dt>
                <dd v-if="trackingStrategy === 'arms'">
                  {{ trackingDiagnostics.arm ?? 'Not found yet' }}
                </dd>
                <dt>Angle source</dt>
                <dd>
                  {{
                    trackingDiagnostics.source === 'world'
                      ? 'Estimated 3D'
                      : trackingDiagnostics.source === 'image'
                        ? '2D image'
                        : 'Not found yet'
                  }}
                </dd>
                <dt>Last interruption</dt>
                <dd>{{ trackingDiagnostics.lastInterruption }}</dd>
              </dl>
              <p v-if="(trackingDiagnostics.frameIntervalMs ?? 0) > 900">
                Tracking is slow. Setup stays ready, but fast movements between frames may be
                missed.
              </p>
              <p>
                Unclear position pauses counting. Standing or repositioning discards the unfinished
                rep and refreshes its starting reference. No video or coordinates are stored.
              </p>
            </template>
          </details>
        </aside>
      </div>

      <section class="review-panel" aria-labelledby="review-heading">
        <div>
          <p class="eyebrow">YOU HAVE THE FINAL SAY</p>
          <h3 id="review-heading">Review before saving</h3>
          <p>
            Stop the camera, correct the estimate if needed, then save one new working set.
            Bodyweight is recorded as 0 kg external load. No video or pose coordinates are saved.
          </p>
        </div>
        <div class="review-fields">
          <label for="reviewed-reps"
            >Reviewed reps<input
              id="reviewed-reps"
              v-model.number="reviewedReps"
              type="number"
              min="1"
              max="1000"
              step="1"
              :disabled="!reviewing || saving || saved || !!pendingSave"
          /></label>
          <p v-if="sessionLoading" role="status">Checking active workout…</p>
          <p v-else-if="activeSession">
            Save to: <strong>{{ activeSession.name }}</strong>
          </p>
          <p v-else>
            No active workout. You can practice without saving, or start a camera workout below.
          </p>
          <div class="review-actions">
            <button
              v-if="!activeSession"
              class="secondary-button"
              :disabled="saving || sessionLoading"
              @click="createWorkout"
            >
              Start a camera workout
            </button>
            <button class="primary-button" :disabled="!canSave" @click="saveSet">
              {{
                saving
                  ? 'Saving…'
                  : saved
                    ? 'Set saved'
                    : pendingSave
                      ? 'Retry this same save'
                      : 'Save reviewed set'
              }}
            </button>
            <button class="secondary-button" :disabled="saving" @click="requestReset">
              New set / reset tracking
            </button>
          </div>
          <div
            v-if="resetConfirmation"
            class="reset-confirmation"
            role="group"
            aria-label="Discard unsaved capture"
          >
            <p>
              Clear this count and position lock? If a save response was interrupted, check the
              workout first: the set may already be saved.
            </p>
            <button class="secondary-button" @click="resetCapture">Clear capture</button
            ><button class="text-button" @click="resetConfirmation = false">Keep it</button>
          </div>
          <p v-if="saveMessage" role="status">{{ saveMessage }}</p>
          <p v-if="sessionError" class="error-message" role="alert">{{ sessionError }}</p>
          <RouterLink v-if="saved" class="back-link" to="/app"
            >View saved set in workout →</RouterLink
          >
        </div>
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import axios from 'axios';
import { PoseCamera, type CameraState } from '@/utils/poseCamera';
import { SIDES, type PosePoint } from '@/utils/pushupCounter';
import type { WorkoutSession } from '@/types/workout';
import {
  AutomaticPushupTracker,
  type ViewSelection,
  type PushupView,
  type TrackingDiagnostics,
  type TrackingStrategy,
} from '@/utils/automaticPushup';

const viewMode = ref<ViewSelection>('auto');
const trackingStrategy = ref<TrackingStrategy>('chest');
const detectedView = ref<PushupView | null>(null);
const trackingDiagnostics = ref<TrackingDiagnostics | null>(null);
const trackingPhase = ref('find-top');
const positioning = computed(() =>
  trackingStrategy.value === 'chest'
    ? 'Show at least one shoulder, hip and knee. Feet help reject repositioning. Elbows and hands can be outside the frame. Side or front is fine.'
    : viewMode.value === 'side'
      ? 'Place the laptop to your side. Show a shoulder, hip and knee, plus an elbow and wrist for arm tracking.'
      : viewMode.value === 'front'
        ? 'Face the laptop. Show a shoulder, hip and knee, plus an elbow and wrist for arm tracking.'
        : 'Side or front is fine. Show a shoulder, hip and knee, plus an elbow and wrist for arm tracking.',
);

const video = ref<HTMLVideoElement | null>(null),
  overlay = ref<HTMLCanvasElement | null>(null);
const cameraState = ref<CameraState>('off'),
  loadingModel = ref(false);
const message = ref(
  'Start camera, get into position, then lower and return up. Setup and counting start automatically.',
);
const error = ref(''),
  count = ref(0),
  counting = ref(false),
  currentAngle = ref<number | null>(null);
const trackingLabel = ref('Camera off');
const reviewing = ref(false),
  reviewedReps = ref<number | string>(0),
  saved = ref(false),
  saving = ref(false);
const activeSession = ref<WorkoutSession | null>(null),
  sessionLoading = ref(false),
  sessionError = ref(''),
  saveMessage = ref('');
const resetConfirmation = ref(false);
const pendingSave = ref<{ workoutId: number; reps: number; requestKey: string } | null>(null);
const canSave = computed(
  () =>
    reviewing.value &&
    !saved.value &&
    !saving.value &&
    !!activeSession.value &&
    Number.isInteger(reviewedReps.value) &&
    Number(reviewedReps.value) > 0 &&
    Number(reviewedReps.value) <= 1000,
);
const tracker = new AutomaticPushupTracker('auto', 'chest');
const camera = new PoseCamera(
  () => video.value,
  processPose,
  (state) => {
    cameraState.value = state;
  },
  (text) => {
    error.value = text;
    stopAndReview();
  },
);

function draw(points: PosePoint[]) {
  const canvas = overlay.value,
    element = video.value;
  if (!canvas || !element) return;
  canvas.width = element.videoWidth || 640;
  canvas.height = element.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const ids of Object.values(SIDES)) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#a3e635';
    ctx.fillStyle = '#a3e635';
    for (const [a, b] of [
      [ids[0], ids[1]],
      [ids[1], ids[2]],
      [ids[0], ids[3]],
      [ids[3], ids[4]],
      [ids[4], ids[5]],
    ]) {
      const first = points[a!],
        second = points[b!];
      if (!first || !second || (first.visibility ?? 0) < 0.35 || (second.visibility ?? 0) < 0.35)
        continue;
      ctx.beginPath();
      ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
      ctx.lineTo(second.x * canvas.width, second.y * canvas.height);
      ctx.stroke();
    }
    for (const id of ids) {
      const point = points[id];
      if (!point || (point.visibility ?? 0) < 0.35) continue;
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
function processPose(points: PosePoint[], time: number, people: number, worldPoints: PosePoint[]) {
  draw(points);
  const reading = tracker.update(
    points,
    worldPoints,
    video.value?.videoWidth || 640,
    video.value?.videoHeight || 480,
    time,
    people,
    counting.value,
  );
  currentAngle.value = reading.angle;
  detectedView.value = reading.view;
  count.value = reading.count;
  trackingLabel.value = reading.status;
  trackingDiagnostics.value = reading.diagnostics;
  trackingPhase.value = reading.phase;
  if (reading.chestPoint && overlay.value) {
    const ctx = overlay.value.getContext('2d');
    if (ctx) {
      const x = reading.chestPoint.x * overlay.value.width,
        y = reading.chestPoint.y * overlay.value.height;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 20, y);
      ctx.lineTo(x + 20, y);
      ctx.moveTo(x, y - 20);
      ctx.lineTo(x, y + 20);
      ctx.stroke();
    }
  }
  if (count.value === 1000) stopAndReview();
}
function supported() {
  return (
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  );
}
async function checkModel() {
  if (!supported()) {
    error.value =
      'Use localhost or HTTPS in current Chrome/Edge. This browser does not expose all camera/tracking features.';
    return;
  }
  loadingModel.value = true;
  error.value = '';
  try {
    await camera.prepare();
    message.value = 'Tracking model loaded and inference check passed. Camera remains off.';
  } catch (caught) {
    camera.stop();
    if (!(caught instanceof DOMException && caught.name === 'AbortError'))
      error.value ||= 'Could not initialize the tracking model.';
  } finally {
    loadingModel.value = false;
  }
}
async function startCamera() {
  if (!supported()) {
    error.value = 'Use localhost or HTTPS in current Chrome/Edge with a working camera.';
    return;
  }
  error.value = '';
  message.value = 'Preparing tracking, then requesting camera permission…';
  tracker.reset(viewMode.value, trackingStrategy.value);
  trackingPhase.value = 'find-top';
  trackingDiagnostics.value = null;
  detectedView.value = null;
  currentAngle.value = null;
  await camera.start();
  if (cameraState.value === 'on') {
    counting.value = true;
    message.value =
      'Camera is on. Setup and counting are automatic: get into your up position, then lower and return up.';
  }
}
function toggleCounting() {
  tracker.interrupt();
  counting.value = !counting.value;
  message.value = counting.value
    ? 'Counting a full up → down → up cycle. Stop camera & review when finished.'
    : 'Counting paused. The camera is still on; use Stop camera to turn it off.';
}
function stopAndReview() {
  const wasOn = cameraState.value === 'on' || (!reviewing.value && count.value > 0);
  counting.value = false;
  tracker.interrupt();
  camera.stop();
  draw([]);
  currentAngle.value = null;
  trackingLabel.value = 'Camera off';
  if (wasOn) {
    reviewing.value = true;
    reviewedReps.value = count.value;
    message.value = 'Camera stopped. Review the count below before saving.';
  }
}
function requestReset() {
  if ((count.value > 0 || Number(reviewedReps.value) > 0 || pendingSave.value) && !saved.value)
    resetConfirmation.value = true;
  else resetCapture();
}
function resetCapture() {
  camera.stop();
  tracker.reset(viewMode.value, trackingStrategy.value);
  trackingPhase.value = 'find-top';
  trackingDiagnostics.value = null;
  detectedView.value = null;
  count.value = 0;
  counting.value = false;
  currentAngle.value = null;
  draw([]);
  reviewing.value = false;
  reviewedReps.value = 0;
  saved.value = false;
  pendingSave.value = null;
  resetConfirmation.value = false;
  error.value = '';
  saveMessage.value = '';
  trackingLabel.value = 'Camera off';
  message.value = 'Ready for a new set. Start camera; position setup and counting are automatic.';
}
function requestError(caught: unknown, fallback: string) {
  return axios.isAxiosError<{ error?: string }>(caught)
    ? caught.response?.data.error || fallback
    : fallback;
}
async function loadSession() {
  sessionLoading.value = true;
  try {
    activeSession.value = (
      await axios.get<{ session: WorkoutSession | null }>('/api/v1/workouts/active')
    ).data.session;
  } catch (caught) {
    sessionError.value = requestError(
      caught,
      'Could not check your active workout. Return to Workout to check your connection.',
    );
  } finally {
    sessionLoading.value = false;
  }
}
async function createWorkout() {
  saving.value = true;
  sessionError.value = '';
  try {
    activeSession.value = (
      await axios.post<{ session: WorkoutSession }>('/api/v1/workouts', {
        name: 'Push-up camera session',
      })
    ).data.session;
  } catch (caught) {
    sessionError.value = requestError(caught, 'Could not start a workout.');
    await loadSession();
  } finally {
    saving.value = false;
  }
}
async function saveSet() {
  if (!canSave.value || !activeSession.value) return;
  saving.value = true;
  sessionError.value = '';
  pendingSave.value ??= {
    workoutId: activeSession.value.id,
    reps: Number(reviewedReps.value),
    requestKey: crypto.randomUUID(),
  };
  const pending = pendingSave.value;
  try {
    activeSession.value = (
      await axios.post<{ session: WorkoutSession }>(
        `/api/v1/workouts/${pending.workoutId}/camera-pushups`,
        { reps: pending.reps, requestKey: pending.requestKey },
      )
    ).data.session;
    saved.value = true;
    saveMessage.value = `Saved ${pending.reps} reviewed reps as one new push-up working set.`;
  } catch (caught) {
    sessionError.value = requestError(
      caught,
      'Save response was interrupted. Retry this same save; its request key prevents duplicate sets.',
    );
    saveMessage.value =
      'This capture is locked to its original workout and reviewed count until saved or cleared.';
  } finally {
    saving.value = false;
  }
}
const unsaved = () =>
  !saved.value && (count.value > 0 || Number(reviewedReps.value) > 0 || !!pendingSave.value);
function hidden() {
  if (document.hidden) stopAndReview();
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (unsaved()) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onMounted(() => {
  void loadSession();
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeRouteLeave(() => {
  stopAndReview();
  return !unsaved() || window.confirm('This capture is not saved. Leave and discard it?');
});
onBeforeUnmount(() => {
  camera.stop();
  document.removeEventListener('visibilitychange', hidden);
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<style scoped>
.camera-page {
  padding: 28px 24px 110px;
}
.camera-shell {
  max-width: 1160px;
  margin: auto;
}
.back-link {
  color: var(--accent-primary);
  text-decoration: none;
  display: inline-block;
  margin-bottom: 20px;
}
.camera-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 24px;
  margin-bottom: 24px;
}
.camera-heading .eyebrow {
  margin: 0;
}
.camera-heading p:not(.eyebrow) {
  margin: 0;
}
.camera-shell > .back-link {
  margin-bottom: 12px;
}
h2 {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: clamp(2.5rem, 4vw, 3.2rem);
  line-height: 1;
  margin: 6px 0 10px;
}
h3 {
  margin: 0 0 12px;
  font-size: 1.2rem;
  font-weight: 650;
}
p {
  color: var(--text-secondary);
  line-height: 1.65;
  margin: 8px 0;
  max-width: 65ch;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--text-muted);
}
.privacy-note {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  padding-bottom: 4px;
}
.camera-grid {
  display: grid;
  align-items: start;
  grid-template-columns: minmax(0, 1.8fr) minmax(280px, 1fr);
  gap: 24px;
}
.view-selector {
  margin: 0 0 24px;
  padding: 14px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}
.view-selector legend {
  font-size: 13px;
  padding: 0 6px;
}
.view-selector label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.view-selector input {
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
  accent-color: var(--accent-primary);
}
.view-selector label span {
  color: var(--text-muted);
  font-size: 11px;
}
.view-selector p {
  flex-basis: 100%;
  font-size: 12px;
  margin: 0;
}
.view-selector:disabled label {
  opacity: 0.55;
  cursor: not-allowed;
}
.setup-section ol {
  margin: 12px 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.65;
}
.setup-section li + li {
  margin-top: 8px;
}
.preview-panel,
.counter-panel,
.review-panel {
  min-width: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}
.preview-stage {
  position: relative;
  aspect-ratio: 4/3;
  background: #10151e;
  overflow: hidden;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
video,
canvas {
  display: block;
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
  object-fit: contain;
}
.preview-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  padding: 32px;
  text-align: center;
  color: #94a3b8;
}
.preview-placeholder h3 {
  color: #f8fafc;
  margin-top: 18px;
}
.preview-placeholder p {
  max-width: 38ch;
  font-size: 13px;
  color: #94a3b8;
}
.live-label {
  position: absolute;
  top: 14px;
  left: 14px;
  color: #f8fafc;
  background: #10151edc;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 12px;
}
.live-label span {
  display: inline-block;
  background: #a3e635;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
}
.preview-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 20px 20px 0;
}
button {
  font: inherit;
  cursor: pointer;
  border-radius: 7px;
  min-height: 42px;
  padding: 10px 14px;
  transition: background-color 0.2s;
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
button:focus-visible,
input:focus-visible,
a:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 4px;
}
.primary-button {
  border: 1px solid var(--accent-primary);
  background: var(--accent-primary);
  color: var(--accent-contrast);
  font-weight: 650;
}
.secondary-button {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
}
.secondary-button:hover:not(:disabled) {
  background: var(--bg-surface-hover);
}
.text-button {
  background: transparent;
  border: 0;
  color: var(--text-secondary);
}
.state-message,
.error-message,
.camera-footnote {
  padding: 0 20px;
  font-size: 13px;
}
.error-message {
  color: var(--danger-primary);
}
.camera-footnote {
  font-size: 11px;
  margin-bottom: 20px;
}
.counter-panel {
  padding: 26px;
}
.count-display {
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-subtle);
}
.count-display > span {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
}
.count-display strong {
  display: block;
  font:
    600 7rem/1.15 'Barlow Condensed',
    sans-serif;
  font-variant-numeric: tabular-nums;
  color: var(--accent-primary);
}
.count-display p {
  font-size: 13px;
  min-height: 2em;
}
.angle-readout {
  font-variant-numeric: tabular-nums;
}
.readiness-status {
  padding: 8px 10px;
  border-left: 2px solid var(--border-strong);
  color: var(--text-secondary);
}
.readiness-status[data-ready='true'] {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.movement-feedback {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}
.movement-feedback progress {
  width: 100%;
  height: 10px;
  accent-color: var(--accent-primary);
}
.setup-section {
  padding-top: 24px;
}
.setup-section p {
  font-size: 12px;
}
.detected-view {
  color: var(--accent-primary);
}
.tracking-details {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12px;
}
.tracking-details summary {
  cursor: pointer;
  color: var(--text-primary);
}
.tracking-details summary:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 4px;
}
.tracking-details dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  font-variant-numeric: tabular-nums;
}
.tracking-details dt {
  color: var(--text-secondary);
}
.tracking-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.review-panel {
  margin-top: 24px;
  padding: 28px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 36px;
}
.review-panel p {
  font-size: 13px;
}
.review-fields label {
  display: grid;
  gap: 8px;
  font-size: 13px;
}
input {
  width: 110px;
  padding: 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-page);
  color: var(--text-primary);
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.review-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}
.review-fields .error-message {
  padding: 0;
}
.reset-confirmation {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
}
@media (min-width: 801px) {
  .preview-stage {
    aspect-ratio: auto;
    height: clamp(260px, 42vh, 420px);
  }
}
@media (max-width: 800px) {
  .camera-grid {
    grid-template-columns: 1fr;
  }
  .counter-panel {
    display: grid;
    grid-template-columns: 0.8fr 1.2fr;
    gap: 24px;
  }
  .count-display {
    border: 0;
  }
  .setup-section {
    padding: 0;
  }
  .camera-heading {
    display: block;
  }
  .review-panel {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}
@media (max-width: 480px) {
  .camera-page {
    padding: 22px 14px 110px;
  }
  .counter-panel {
    display: block;
    padding: 20px;
  }
  .count-display {
    border-bottom: 1px solid var(--border-subtle);
  }
  .setup-section {
    padding-top: 20px;
  }
  .review-panel {
    padding: 20px;
  }
  .preview-placeholder {
    padding: 18px;
  }
  .preview-placeholder h3 {
    font-size: 1rem;
  }
  .preview-placeholder p {
    font-size: 12px;
  }
}
</style>
