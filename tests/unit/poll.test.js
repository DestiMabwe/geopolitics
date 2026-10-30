import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startPolling } from '../../public/js/poll.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startPolling (ARCHITECTURE §3, visitors poll every 2 s)', () => {
  it('calls fn every interval', async () => {
    const fn = vi.fn(async () => {});
    startPolling(fn, 2000);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never overlaps: the next call waits for a slow one to finish', async () => {
    let finish;
    const fn = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    startPolling(fn, 2000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keeps going after a failed call', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue();
    startPolling(fn, 2000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stops when told to', async () => {
    const fn = vi.fn(async () => {});
    const stop = startPolling(fn, 2000);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).not.toHaveBeenCalled();
  });
});
