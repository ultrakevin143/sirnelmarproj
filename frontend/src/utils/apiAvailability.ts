import axios from 'axios';
import { ref } from 'vue';

export class LiftUpConnectionError extends Error {}

export const apiConnectionMessage = ref('');
export const apiConnectionError = ref('');
let pendingCheck: Promise<void> | null = null;

async function check() {
  apiConnectionError.value = '';
  apiConnectionMessage.value = 'Connecting to LiftUp…';
  try {
    // Retry only this read-only check. Account submissions and saves are never replayed.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const response = await axios.get<{ service?: string; status?: string }>('/api/health', {
          timeout: 10000,
        });
        if (response.data?.service !== 'gym-tracker-api' || response.data?.status !== 'ok') {
          throw new LiftUpConnectionError(
            'This address is connected to a different app. Check the LiftUp address and try again. Your account details have not been sent.',
          );
        }
        return;
      } catch (error) {
        if (error instanceof LiftUpConnectionError) throw error;
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (attempt === 5 || (status !== undefined && ![502, 503, 504].includes(status))) {
          throw new LiftUpConnectionError(
            'LiftUp could not connect. Check your internet connection and try again.',
          );
        }
        apiConnectionMessage.value = 'LiftUp is starting. This can take about a minute.';
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    apiConnectionError.value =
      error instanceof Error ? error.message : 'Could not connect to LiftUp.';
    throw error;
  } finally {
    apiConnectionMessage.value = '';
  }
}

export function verifyLiftUpApi(): Promise<void> {
  pendingCheck ??= check().finally(() => {
    pendingCheck = null;
  });
  return pendingCheck;
}
