import { createHttpClient } from '@rxjs-spa/http'
import type { HttpInterceptor } from '@rxjs-spa/http'
import type { Product } from '../types'

const loggingInterceptor: HttpInterceptor = {
  request: (config) => {
    console.log(`[shop] ${config.method} ${config.url}`)
    return config
  },
}

const http = createHttpClient({
  baseUrl: 'https://fakestoreapi.com',
  interceptors: [loggingInterceptor],
})

export const api = {
  products: {
    list: () => http.get<Product[]>('/products'),
    get: (id: number | string) => http.get<Product>(`/products/${id}`),
    categories: () => http.get<string[]>('/products/categories'),
  },
}
