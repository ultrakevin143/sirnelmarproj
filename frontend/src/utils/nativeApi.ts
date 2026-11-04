import axios, { AxiosError, AxiosHeaders, CanceledError, type AxiosAdapter } from 'axios';

export const HOSTED_API_ORIGIN = 'https://liftup-ldlv.onrender.com';

export interface NativeHttpOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: unknown;
  responseType: 'json' | 'text' | 'arraybuffer';
  connectTimeout: number;
  readTimeout: number;
  disableRedirects: boolean;
}

export interface NativeHttpResult {
  data: unknown;
  status: number;
  headers: Record<string, string>;
}

// The native cookie manager handles HttpOnly sessions; JavaScript never stores a session token.
export function createNativeApiAdapter(
  request: (options: NativeHttpOptions) => Promise<NativeHttpResult>,
): AxiosAdapter {
  return async (config) => {
    if (config.signal?.aborted) throw new CanceledError('Request cancelled.', config);
    const url = new URL(axios.getUri({ ...config, baseURL: HOSTED_API_ORIGIN }));
    if (url.origin !== HOSTED_API_ORIGIN || !url.pathname.startsWith('/api/')) {
      throw new AxiosError('The mobile API address is invalid.', 'ERR_BAD_REQUEST', config);
    }
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(config.headers.toJSON())) {
      if (value != null) headers[key] = String(value);
    }
    let data: unknown = config.data;
    if (typeof data === 'string' && String(config.headers.getContentType()).includes('json')) {
      data = JSON.parse(data);
    }
    const timeout = config.timeout || 30000;
    let result: NativeHttpResult;
    try {
      result = await request({
        url: url.href,
        method: (config.method || 'get').toUpperCase(),
        headers,
        ...(data !== undefined ? { data } : {}),
        responseType:
          config.responseType === 'blob' || config.responseType === 'arraybuffer'
            ? 'arraybuffer'
            : config.responseType === 'text'
              ? 'text'
              : 'json',
        connectTimeout: timeout,
        readTimeout: timeout,
        disableRedirects: true,
      });
    } catch (error) {
      throw AxiosError.from(error, 'ERR_NETWORK', config);
    }
    if (config.signal?.aborted) throw new CanceledError('Request cancelled.', config);
    const responseHeaders = new AxiosHeaders();
    for (const [key, value] of Object.entries(result.headers)) {
      if (key.toLowerCase() !== 'set-cookie') responseHeaders.set(key, value);
    }
    const response = {
      config,
      data: result.data,
      headers: responseHeaders,
      status: result.status,
      statusText: String(result.status),
    };
    if (config.validateStatus && !config.validateStatus(result.status)) {
      throw new AxiosError(
        `Request failed with status code ${result.status}`,
        result.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
        config,
        undefined,
        response,
      );
    }
    if (config.responseType === 'blob' || config.responseType === 'arraybuffer') {
      const bytes = Uint8Array.from(atob(String(result.data)), (character) =>
        character.charCodeAt(0),
      );
      response.data =
        config.responseType === 'blob'
          ? new Blob([bytes], { type: String(responseHeaders.getContentType() || '') })
          : bytes.buffer;
    } else if (config.responseType === 'text' && typeof result.data !== 'string') {
      // Android parses application/json regardless of the requested response type.
      // Exports still need text for the browser download and native filesystem.
      response.data = JSON.stringify(result.data);
    }
    return response;
  };
}
