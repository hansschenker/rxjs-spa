import { createHttpClient } from '@rxjs-spa/http'
import type { HttpInterceptor } from '@rxjs-spa/http'
import type { Post, User } from '../types'

export interface LoginPayload { username: string; password: string }
export interface LoginResponse { id: number; username: string; email: string; accessToken: string }

// ---------------------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------------------

const loggingInterceptor: HttpInterceptor = {
  request: (config) => {
    console.log(`[http] ${config.method} ${config.url}`)
    return config
  },
}

// ---------------------------------------------------------------------------
// HTTP client with base URL + interceptors
// ---------------------------------------------------------------------------

const http = createHttpClient({
  baseUrl: 'https://jsonplaceholder.typicode.com',
  interceptors: [loggingInterceptor],
})

// Auth uses a different host — absolute URL bypasses baseUrl
const authHttp = createHttpClient({
  baseUrl: 'https://dummyjson.com',
  interceptors: [loggingInterceptor],
})

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const api = {
  users: {
    list: () => http.get<User[]>('/users'),
    get: (id: number | string) => http.get<User>(`/users/${id}`),
  },
  posts: {
    byUser: (userId: number | string) =>
      http.get<Post[]>(`/posts?userId=${userId}`),
  },
  auth: {
    login: (payload: LoginPayload) =>
      authHttp.post<LoginResponse>('/auth/login', payload),
  },
}
