import { http } from '@rxjs-spa/http'
import type { Post, User } from '../types'

const BASE = 'https://jsonplaceholder.typicode.com'

export const api = {
  users: {
    list: () => http.get<User[]>(`${BASE}/users`),
    get: (id: number | string) => http.get<User>(`${BASE}/users/${id}`),
  },
  posts: {
    byUser: (userId: number | string) =>
      http.get<Post[]>(`${BASE}/posts?userId=${userId}`),
  },
}
