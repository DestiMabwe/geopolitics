// The browser's only door to the server (ARCHITECTURE §3). The browser never talks to Firestore.

/** An error response from the API, or a network failure (`status` 0, `code` "network"). */
export class ApiError extends Error {
  /**
   * @param {number} status   HTTP status, or 0 when the request never reached the server
   * @param {string} code     the server's `error.code`, "network", or "unknown"
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Builds the API client. `fetch` and `getToken` are passed in so tests can use fakes.
 *
 * - Every path is prefixed with `/api`.
 * - `getToken()` is called on every request. When it gives a token, send
 *   `Authorization: Bearer <token>`; when it gives null, send no Authorization header.
 * - `post` sends `Content-Type: application/json` and a JSON body (`{}` when none is given).
 * - A 2xx resolves to the parsed JSON body.
 * - Any other status throws `ApiError(status, error.code, error.message)` from the server's
 *   `{ error: { code, message } }`, or code "unknown" when the body isn't that shape.
 * - A rejected fetch throws `ApiError(0, 'network', …)`.
 *
 * @param {object} deps
 * @param {typeof fetch} deps.fetch
 * @param {() => Promise<string | null>} deps.getToken
 * @returns {{ get(path: string): Promise<any>, post(path: string, body?: object): Promise<any> }}
 */
export function createApi({ fetch, getToken }) {
  fetch = fetch ?? globalThis.fetch;
  getToken = getToken ?? (async () => null);

  return {
    async get(path) {
      return request('GET', path);
    },
    async post(path, body) {
      return request('POST', path, body);
    },
  };

  async function request(method, path, body) {
    const token = await getToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (method === 'POST') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body ?? {});
    }
    let response;
    try {
      response = await fetch(`/api${path}`, { method, headers, body });
    } catch (err) {
      throw new ApiError(0, 'network', err.message);
    }
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (response.ok) {
      return json;
    } else {
      const code = json?.error?.code ?? 'unknown';
      const message = json?.error?.message ?? text;
      throw new ApiError(response.status, code, message);
    }
  }
}
