import { http } from '@rxjs-spa/http'
import type { Post, User } from '../types'

const BASE = 'https://jsonplaceholder.typicode.com'

export interface LoginPayload { username: string; password: string }
export interface LoginResponse { id: number; username: string; email: string; accessToken: string }

export const api = {
  users: {
    list: () => http.get<User[]>(`${BASE}/users`),
    get: (id: number | string) => http.get<User>(`${BASE}/users/${id}`),
  },
  posts: {
    byUser: (userId: number | string) =>
      http.get<Post[]>(`${BASE}/posts?userId=${userId}`),
  },
  auth: {
    login: (payload: LoginPayload) =>
      http.post<LoginResponse>('https://dummyjson.com/auth/login', payload),
  },
}
