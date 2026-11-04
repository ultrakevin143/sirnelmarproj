import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { useAuth } from '../src/composables/useAuth';
import {
  LiftUpConnectionError,
  verifyLiftUpApi,
  apiConnectionMessage,
  apiConnectionError,
} from '../src/utils/apiAvailability';

const initialAdapter = axios.defaults.adapter;
afterEach(() => {
  vi.useRealTimers();
  if (initialAdapter === undefined) delete axios.defaults.adapter;
  else axios.defaults.adapter = initialAdapter;
});

describe('API identity before account actions', () => {
  it('waits through a sleeping server and submits credentials exactly once after recovery', async () => {
    vi.useFakeTimers();
    const requests: string[] = [];
    let healthAttempts = 0;
    axios.defaults.adapter = async (config) => {
      requests.push(config.url ?? '');
      if (config.url === '/api/health' && ++healthAttempts < 3) throw new Error('Server waking');
      return {
        config,
        headers: {},
        status: 200,
        statusText: 'OK',
        data:
          config.url === '/api/health'
            ? { status: 'ok', service: 'gym-tracker-api' }
            : { user: { id: 'fixture', name: 'Fixture', settings: {} } },
      };
    };
    const login = useAuth().login('fixture@example.invalid', 'synthetic-password');
    await vi.advanceTimersByTimeAsync(0);
    expect(apiConnectionMessage.value).toContain('starting');
    expect(requests).toEqual(['/api/health']);
    await vi.runAllTimersAsync();
    await login;
    expect(requests).toEqual(['/api/health', '/api/health', '/api/health', '/api/auth/login']);
    expect(apiConnectionMessage.value).toBe('');
  });

  it('bounds health retries, shares concurrent checks, and preserves the error for manual recovery', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    axios.defaults.adapter = async () => {
      attempts += 1;
      throw new Error('Offline');
    };
    const first = verifyLiftUpApi();
    expect(verifyLiftUpApi()).toBe(first);
    const rejection = expect(first).rejects.toBeInstanceOf(LiftUpConnectionError);
    await vi.runAllTimersAsync();
    await rejection;
    expect(attempts).toBe(6);
    expect(apiConnectionMessage.value).toBe('');
    expect(apiConnectionError.value).toContain('Check your internet');
  });
  it('blocks credential submissions when another project is behind the proxy', async () => {
    const requests: string[] = [];
    axios.defaults.adapter = async (config) => {
      requests.push(config.url ?? '');
      return {
        config,
        headers: {},
        status: 200,
        statusText: 'OK',
        data: { status: 'ok', service: 'different-app' },
      };
    };
    await expect(
      useAuth().login('synthetic@example.invalid', 'synthetic-password'),
    ).rejects.toBeInstanceOf(LiftUpConnectionError);
    expect(requests).toEqual(['/api/health']);
    await expect(
      axios.post('/api/auth/change-password', {
        currentPassword: 'synthetic',
        newPassword: 'also-synthetic',
      }),
    ).rejects.toBeInstanceOf(LiftUpConnectionError);
    expect(requests).toEqual(['/api/health', '/api/health']);
  });
  it('allows the intended login only after LiftUp health is verified', async () => {
    const requests: string[] = [];
    axios.defaults.adapter = async (config) => {
      requests.push(config.url ?? '');
      return {
        config,
        headers: {},
        status: 200,
        statusText: 'OK',
        data:
          config.url === '/api/health'
            ? { status: 'ok', service: 'gym-tracker-api' }
            : {
                user: {
                  id: 'synthetic',
                  name: 'Fixture',
                  email: 'synthetic@example.invalid',
                  experienceLevel: 'beginner',
                  joinedAt: '',
                },
              },
      };
    };
    await useAuth().login('synthetic@example.invalid', 'synthetic-password');
    expect(requests).toEqual(['/api/health', '/api/auth/login']);
  });
});
