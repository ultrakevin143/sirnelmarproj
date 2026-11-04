import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { createNativeApiAdapter, HOSTED_API_ORIGIN } from '../src/utils/nativeApi';

describe('Android API transport', () => {
  it('sends API queries and JSON writes once to the hosted origin', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: {} });
    const client = axios.create({ adapter: createNativeApiAdapter(request) });
    await client.get('/api/v1/exercises', { params: { q: 'bench press' }, timeout: 10000 });
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: `${HOSTED_API_ORIGIN}/api/v1/exercises?q=bench+press`,
      method: 'GET',
      connectTimeout: 10000,
      readTimeout: 10000,
      disableRedirects: true,
    });
    await client.post('/api/v1/workouts/1/sets', { reps: 12, weightKg: 0 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      method: 'POST',
      data: { reps: 12, weightKg: 0 },
    });
  });

  it('rejects foreign destinations before any credentials are transmitted', async () => {
    const request = vi.fn();
    const client = axios.create({ adapter: createNativeApiAdapter(request) });
    await expect(
      client.post('https://example.invalid/api/auth/login', { password: 'fixture' }),
    ).rejects.toMatchObject({ code: 'ERR_BAD_REQUEST' });
    await expect(client.get('/private-file')).rejects.toMatchObject({ code: 'ERR_BAD_REQUEST' });
    expect(request).not.toHaveBeenCalled();
  });

  it('preserves API status and validation messages for existing auth and save handling', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 401,
      data: { error: 'Sign in to continue.' },
      headers: {},
    });
    const client = axios.create({ adapter: createNativeApiAdapter(request) });
    await expect(client.get('/api/v1/workouts')).rejects.toMatchObject({
      isAxiosError: true,
      response: { status: 401, data: { error: 'Sign in to continue.' } },
    });
    await expect(
      client.get('/api/v1/exercises/custom/1/image', { responseType: 'blob' }),
    ).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('decodes authenticated image bytes and keeps session cookie headers out of the JS response', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      data: btoa('image fixture'),
      headers: { 'Content-Type': 'image/png', 'Set-Cookie': 'private-fixture' },
    });
    const client = axios.create({ adapter: createNativeApiAdapter(request) });
    const result = await client.get('/api/v1/exercises/custom/1/image', { responseType: 'blob' });
    expect(result.data).toBeInstanceOf(Blob);
    expect(result.data.type).toBe('image/png');
    expect(result.data.size).toBe(13);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(request.mock.calls[0]?.[0].responseType).toBe('arraybuffer');
  });

  it('preserves file-export text and reports network failures without replaying a write', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, data: '\ufeffname,reps\r\nPress,12\r\n', headers: {} })
      .mockRejectedValueOnce(new Error('Connection lost'));
    const client = axios.create({ adapter: createNativeApiAdapter(request) });
    const csv = await client.get('/api/v1/workouts/export.csv', { responseType: 'text' });
    expect(csv.data).toBe('\ufeffname,reps\r\nPress,12\r\n');
    await expect(client.post('/api/v1/workouts', { name: 'Fixture' })).rejects.toMatchObject({
      code: 'ERR_NETWORK',
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not send an already-cancelled request', async () => {
    const request = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const client = axios.create({ adapter: createNativeApiAdapter(request) });
    await expect(
      client.post('/api/v1/workouts', {}, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(request).not.toHaveBeenCalled();
  });

  it('converts Android auto-parsed JSON back into text for plan-file export', async () => {
    const plan = { formatVersion: 1, plan: { name: 'Fixture', days: [] } };
    const request = vi
      .fn()
      .mockResolvedValue({
        status: 200,
        data: plan,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = axios.create({ adapter: createNativeApiAdapter(request) });
    const result = await client.get('/api/v1/plans/default/export', { responseType: 'text' });
    expect(typeof result.data).toBe('string');
    expect(JSON.parse(result.data)).toEqual(plan);
  });
});
