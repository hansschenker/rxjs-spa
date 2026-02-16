export interface Product {
  id: number
  title: string
  price: number
  description: string
  category: string
  image: string
  rating: {
    rate: number
    count: number
  }
}

export interface CartItem {
  product: Product
  quantity: number
}

export type SortOption = 'price-asc' | 'price-desc' | 'rating' | 'title'

export interface CatalogQuery {
  category?: string
  search?: string
  sort?: SortOption
  page?: string
}
