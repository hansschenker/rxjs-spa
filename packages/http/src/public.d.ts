import { Observable } from 'rxjs';
import { AjaxConfig } from 'rxjs/ajax';
export type RemoteData<T> = {
    status: 'idle';
} | {
    status: 'loading';
} | {
    status: 'success';
    data: T;
} | {
    status: 'error';
    error: string;
    statusCode?: number;
};
export declare const idle: () => RemoteData<never>;
export declare const loading: () => RemoteData<never>;
export declare const success: <T>(data: T) => RemoteData<T>;
export declare const failure: (error: string, statusCode?: number) => RemoteData<never>;
export declare function isIdle<T>(rd: RemoteData<T>): rd is {
    status: 'idle';
};
export declare function isLoading<T>(rd: RemoteData<T>): rd is {
    status: 'loading';
};
export declare function isSuccess<T>(rd: RemoteData<T>): rd is {
    status: 'success';
    data: T;
};
export declare function isError<T>(rd: RemoteData<T>): rd is {
    status: 'error';
    error: string;
    statusCode?: number;
};
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
export declare function toRemoteData<T>(): (source$: Observable<T>) => Observable<RemoteData<T>>;
export interface HttpRequestOptions extends Omit<AjaxConfig, 'url' | 'method' | 'body'> {
}
export interface HttpClient {
    get<T>(url: string, options?: HttpRequestOptions): Observable<T>;
    post<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>;
    put<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>;
    patch<T>(url: string, body?: unknown, options?: HttpRequestOptions): Observable<T>;
    delete<T>(url: string, options?: HttpRequestOptions): Observable<T>;
}
/**
 * An interceptor can modify the outgoing request config and/or the
 * incoming response Observable.
 *
 * - `request(config)` — called before the XHR is sent. Return a modified config.
 * - `response(source$)` — called after the XHR Observable is created.
 *   Return a transformed Observable (e.g. for retry, logging, error mapping).
 *
 * Both methods are optional.
 */
export interface HttpInterceptor {
    request?(config: AjaxConfig): AjaxConfig;
    response?<T>(source$: Observable<T>): Observable<T>;
}
export interface HttpClientConfig {
    /** Base URL prepended to all relative paths. */
    baseUrl?: string;
    /** Interceptors applied in order: request phase left-to-right, response phase right-to-left. */
    interceptors?: HttpInterceptor[];
}
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
export declare function createHttpClient(config?: HttpClientConfig): HttpClient;
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
export declare const http: HttpClient;
