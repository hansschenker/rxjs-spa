import { createStore } from '@rxjs-spa/store'

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark'

export interface AuthUser {
  id: number
  email: string
  token: string
}

export interface GlobalState {
  theme: Theme
  isAuthenticated: boolean
  user: AuthUser | null
  redirectPath: string | null
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type GlobalAction =
  | { type: 'TOGGLE_THEME' }
  | { type: 'LOGIN_SUCCESS'; user: AuthUser }
  | { type: 'LOGOUT' }
  | { type: 'SET_REDIRECT'; path: string | null }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function globalReducer(state: GlobalState, action: GlobalAction): GlobalState {
  switch (action.type) {
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' }
    case 'LOGIN_SUCCESS':
      return { ...state, isAuthenticated: true, user: action.user, redirectPath: null }
    case 'LOGOUT':
      return { ...state, isAuthenticated: false, user: null }
    case 'SET_REDIRECT':
      return { ...state, redirectPath: action.path }
  }
}

// ---------------------------------------------------------------------------
// Store (singleton — shared across all views)
// ---------------------------------------------------------------------------

export const globalStore = createStore<GlobalState, GlobalAction>(globalReducer, {
  theme: 'light',
  isAuthenticated: false,
  user: null,
  redirectPath: null,
})
