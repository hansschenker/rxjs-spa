import { createStore } from '@rxjs-spa/store'

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark'

export interface GlobalState {
  theme: Theme
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type GlobalAction = { type: 'TOGGLE_THEME' }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function globalReducer(state: GlobalState, action: GlobalAction): GlobalState {
  switch (action.type) {
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' }
  }
}

// ---------------------------------------------------------------------------
// Store (singleton — shared across all views)
// ---------------------------------------------------------------------------

export const globalStore = createStore<GlobalState, GlobalAction>(globalReducer, {
  theme: 'light',
})
