// ---------------------------------------------------------------------------
// Domain models — match the JSONPlaceholder API schema
// ---------------------------------------------------------------------------

export interface User {
  id: number
  name: string
  username: string
  email: string
  phone: string
  website: string
  company: { name: string; catchPhrase: string }
  address: { street: string; city: string; zipcode: string }
}

export interface Post {
  id: number
  userId: number
  title: string
  body: string
}
