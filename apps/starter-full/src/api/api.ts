import { createHttpClient } from '@rxjs-spa/http'
import type { HttpInterceptor } from '@rxjs-spa/http'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: number
  name: string
  username: string
  email: string
  phone: string
  website: string
  company: { name: string; catchPhrase: string; bs: string }
  address: { street: string; suite: string; city: string; zipcode: string }
}

export interface Post {
  id: number
  userId: number
  title: string
  body: string
}

export interface LoginPayload { username: string; password: string }
export interface LoginResponse { id: number; username: string; email: string; accessToken: string }

// ---------------------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------------------

const loggingInterceptor: HttpInterceptor = {
  request: (config) => {
    if (import.meta.env.DEV) {
      console.log(`[http] ${config.method} ${config.url}`)
    }
    return config
  },
}

// ---------------------------------------------------------------------------
// HTTP clients
// ---------------------------------------------------------------------------

const http = createHttpClient({
  baseUrl: 'https://jsonplaceholder.typicode.com',
  interceptors: [loggingInterceptor],
})

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
