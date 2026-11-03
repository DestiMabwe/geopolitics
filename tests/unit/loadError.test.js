import { describe, it, expect } from 'vitest';
import { ApiError } from '../../public/js/api.js';
import { loadErrorMessage } from '../../public/js/loadError.js';

// QA 2026-11-03 ISSUE-A: the sentence shown instead of "Loading…" when a load fails.

describe('loadErrorMessage', () => {
  it('says the server is taking too long on a timeout', () => {
    expect(loadErrorMessage(new ApiError(0, 'timeout', 'x'))).toMatch(/too long/i);
  });

  it("says the server can't be reached on a network error", () => {
    expect(loadErrorMessage(new ApiError(0, 'network', 'Failed to fetch'))).toMatch(/can.?t reach/i);
  });

  it('says the service is unavailable on a 503', () => {
    expect(loadErrorMessage(new ApiError(503, 'unavailable', 'x'))).toMatch(/unavailable/i);
  });

  it("uses the server's own message for other API errors", () => {
    expect(loadErrorMessage(new ApiError(404, 'not_found', 'No such game'))).toContain('No such game');
  });

  it('falls back to a generic line for anything that is not an ApiError', () => {
    expect(loadErrorMessage(new TypeError('boom'))).toMatch(/something went wrong/i);
    expect(loadErrorMessage(undefined)).toMatch(/something went wrong/i);
  });

  it('never shows raw internals such as the thrown message of an unknown error', () => {
    expect(loadErrorMessage(new TypeError('secret path C:\\x'))).not.toContain('secret');
  });

  it('tells the player they can try again when retrying could help', () => {
    for (const err of [new ApiError(0, 'timeout', 'x'), new ApiError(0, 'network', 'x'), new ApiError(503, 'unavailable', 'x')]) {
      expect(loadErrorMessage(err)).toMatch(/try again/i);
    }
  });
});
