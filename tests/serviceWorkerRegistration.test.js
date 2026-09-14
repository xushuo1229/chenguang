import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupServiceWorker } from '../js/serviceWorkerRegistration.js';

describe('serviceWorkerRegistration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dev loads unregister the old worker and clear branded caches', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const caches = {
      keys: vi.fn().mockResolvedValue(['cgl-dev-static', 'other-cache']),
      delete: vi.fn().mockResolvedValue(true),
    };
    const serviceWorker = { getRegistration: vi.fn().mockResolvedValue({ unregister }) };
    vi.stubGlobal('navigator', { ...navigator, serviceWorker });
    vi.stubGlobal('caches', caches);

    setupServiceWorker();
    await vi.waitFor(() => expect(unregister).toHaveBeenCalled());
    await Promise.resolve();

    expect(caches.delete).toHaveBeenCalledWith('cgl-dev-static');
    expect(caches.delete).not.toHaveBeenCalledWith('other-cache');
  });
});
