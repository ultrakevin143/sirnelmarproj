import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => true),
  get: vi.fn(),
  writeFile: vi.fn(),
  share: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.native } }));
vi.mock('axios', () => ({ default: { get: mocks.get } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: mocks.writeFile },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));

import { authenticatedImageUrl, exportFile } from '@/utils/exportFile';

describe('Android file integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.native.mockReturnValue(true);
    mocks.writeFile.mockResolvedValue({ uri: 'file:///cache/exports/plan.json' });
    mocks.share.mockResolvedValue({});
  });

  it('writes a private export to cache and opens Android sharing', async () => {
    const content = JSON.stringify({ formatVersion: 1, plan: { days: [] } });
    mocks.get.mockResolvedValue({ data: content });
    await exportFile('/api/v1/plans/default/export', 'plan.json', 'application/json');
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: 'exports/plan.json',
      data: content,
      directory: 'CACHE',
      encoding: 'utf8',
      recursive: true,
    });
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: ['file:///cache/exports/plan.json'],
      }),
    );
  });

  it('does not open sharing when fetching the protected export fails', async () => {
    mocks.get.mockRejectedValue(new Error('Offline'));
    await expect(
      exportFile('/api/v1/workouts/export.csv', 'history.csv', 'text/csv'),
    ).rejects.toThrow('Offline');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('treats closing the Android share sheet as cancellation while preserving real failures', async () => {
    mocks.get.mockResolvedValue({ data: 'history' });
    mocks.share.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(
      exportFile('/api/v1/workouts/export.csv', 'history.csv', 'text/csv'),
    ).resolves.toBeUndefined();
    mocks.share.mockRejectedValueOnce(new Error('No provider available'));
    await expect(
      exportFile('/api/v1/workouts/export.csv', 'history.csv', 'text/csv'),
    ).rejects.toThrow('No provider available');
  });

  it('loads protected images through the authenticated native client', async () => {
    mocks.get.mockResolvedValue({ data: new Blob(['image bytes'], { type: 'image/png' }) });
    expect(await authenticatedImageUrl('/api/v1/custom-exercises/1/image')).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/custom-exercises/1/image', {
      responseType: 'blob',
    });
    mocks.get.mockClear();
    expect(await authenticatedImageUrl('/exercises/bench-press.svg')).toBe(
      '/exercises/bench-press.svg',
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
