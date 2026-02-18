import { createPersistedStore } from '@rxjs-spa/persist'

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark'

export interface AuthUser {
  id: number
  username: string
  email: string
  token: string
}

export interface AppState {
  theme: Theme
  isAuthenticated: boolean
  user: AuthUser | null
  redirectPath: string | null
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type AppAction =
  | { type: 'TOGGLE_THEME' }
  | { type: 'LOGIN_SUCCESS'; user: AuthUser }
  | { type: 'LOGOUT' }
  | { type: 'SET_REDIRECT'; path: string | null }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function appReducer(state: AppState, action: AppAction): AppState {
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
// Store (singleton — persisted to localStorage)
// ---------------------------------------------------------------------------

export const appStore = createPersistedStore<AppState, AppAction>(
  appReducer,
  { theme: 'light', isAuthenticated: false, user: null, redirectPath: null },
  'rxjs-spa:app',
  {
    pick: ['theme', 'isAuthenticated', 'user'],
    version: 1,
  },
)
