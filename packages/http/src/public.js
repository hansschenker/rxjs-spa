import { of } from 'rxjs';
import { ajax, AjaxError } from 'rxjs/ajax';
import { map, catchError, startWith } from 'rxjs/operators';
export const idle = () => ({ status: 'idle' });
export const loading = () => ({ status: 'loading' });
export const success = (data) => ({ status: 'success', data });
export const failure = (error, statusCode) => ({
    status: 'error',
    error,
    statusCode,
});
export function isIdle(rd) {
    return rd.status === 'idle';
}
export function isLoading(rd) {
    return rd.status === 'loading';
}
export function isSuccess(rd) {
    return rd.status === 'success';
}
export function isError(rd) {
    return rd.status === 'error';
}
/**
 * toRemoteData(source$)
 *
 * Wraps any Observable into a RemoteData stream:
 *   - Immediately emits `{ status: 'loading' }`
 *   - On success emits `{ status: 'success', data }`
 *   - On error emits `{ status: 'error', error, statusCode? }`
 *
 * Usage:
 *   const users$ = http.get<User[]>('/api/users').pipe(toRemoteData())
 */
export function toRemoteData() {
    return (source$) => source$.pipe(map((data) => ({ status: 'success', data })), startWith({ status: 'loading' }), catchError((err) => {
        const statusCode = err instanceof AjaxError ? err.status : undefined;
        const message = err instanceof AjaxError
            ? (err.message ?? `HTTP ${err.status}`)
            : String(err.message ?? err);
        return of({ status: 'error', error: message, statusCode });
    }));
}
// ---------------------------------------------------------------------------
// Internal request factory
// ---------------------------------------------------------------------------
function request(config) {
    return ajax({
        ...config,
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...config.headers,
        },
    }).pipe(map((res) => res.response));
}
// ---------------------------------------------------------------------------
// createHttpClient
// ---------------------------------------------------------------------------
/**
 * createHttpClient(config?)
 *
 * Creates an HTTP client with optional base URL and interceptors.
 * Returns the same `HttpClient` interface as the default `http` export.
 *
 * Interceptor execution order:
 *   Request phase:  interceptor[0].request → interceptor[1].request → … → XHR
 *   Response phase: … → interceptor[1].response → interceptor[0].response → subscriber
 *
 * @example
 *   const api = createHttpClient({
 *     baseUrl: 'https://api.example.com',
 *     interceptors: [
 *       { request: (c) => ({ ...c, headers: { ...c.headers, Authorization: `Bearer ${token}` } }) },
 *       { response: (res$) => res$.pipe(retry(2)) },
 *     ],
 *   })
 *
 *   api.get<User[]>('/users').subscribe(console.log) // → GET https://api.example.com/users
 */
export function createHttpClient(config) {
    const baseUrl = config?.baseUrl?.replace(/\/+$/, '') ?? '';
    const interceptors = config?.interceptors ?? [];
    function interceptedRequest(ajaxConfig) {
        // Apply request interceptors left-to-right
        let cfg = ajaxConfig;
        for (const i of interceptors) {
            if (i.request)
                cfg = i.request(cfg);
        }
        // Prepend base URL to relative paths
        if (baseUrl && cfg.url && !cfg.url.startsWith('http://') && !cfg.url.startsWith('https://')) {
            cfg = { ...cfg, url: baseUrl + (cfg.url.startsWith('/') ? cfg.url : '/' + cfg.url) };
        }
        let result$ = request(cfg);
        // Apply response interceptors right-to-left (reverse order)
        for (let idx = interceptors.length - 1; idx >= 0; idx--) {
            const i = interceptors[idx];
            if (i.response)
                result$ = i.response(result$);
        }
        return result$;
    }
    return {
        get(url, options) {
            return interceptedRequest({ ...options, url, method: 'GET' });
        },
        post(url, body, options) {
            return interceptedRequest({ ...options, url, method: 'POST', body });
        },
        put(url, body, options) {
            return interceptedRequest({ ...options, url, method: 'PUT', body });
        },
        patch(url, body, options) {
            return interceptedRequest({ ...options, url, method: 'PATCH', body });
        },
        delete(url, options) {
            return interceptedRequest({ ...options, url, method: 'DELETE' });
        },
    };
}
// ---------------------------------------------------------------------------
// http — default client (no interceptors, no base URL)
// ---------------------------------------------------------------------------
/**
 * Default HTTP client with no interceptors or base URL.
 * Use `createHttpClient(config)` for customisation.
 *
 * Every method returns a cold Observable — nothing is sent until you subscribe,
 * and unsubscribing cancels the in-flight XHR.
 *
 * @example
 *   http.get<User[]>('/api/users').subscribe(console.log)
 *   http.get<User[]>('/api/users').pipe(toRemoteData())
 */
export const http = {
    get(url, options) {
        return request({ ...options, url, method: 'GET' });
    },
    post(url, body, options) {
        return request({ ...options, url, method: 'POST', body });
    },
    put(url, body, options) {
        return request({ ...options, url, method: 'PUT', body });
    },
    patch(url, body, options) {
        return request({ ...options, url, method: 'PATCH', body });
    },
    delete(url, options) {
        return request({ ...options, url, method: 'DELETE' });
    },
};
