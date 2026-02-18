import { Subscription, of } from 'rxjs'
import { catchError, exhaustMap, map } from 'rxjs/operators'
import { mount, classToggle } from '@rxjs-spa/dom'
import { ofType } from '@rxjs-spa/store'
import { createForm, s, bindInput, bindError } from '@rxjs-spa/forms'
import { AjaxError } from 'rxjs/ajax'
import type { Store } from '@rxjs-spa/store'
import type { Router } from '@rxjs-spa/router'
import type { AppState, AppAction, AuthUser } from '../store/app.store'
import { api } from '../api/api'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const loginSchema = {
  username: s.string('').required('Username is required').minLength(2, 'At least 2 characters'),
  password: s.string('').required('Password is required'),
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function loginView(
  container: Element,
  appStore: Store<AppState, AppAction>,
  router: Router<string>,
): Subscription {
  container.innerHTML = `
    <section class="view login-view">
      <h1>Sign In</h1>
      <p>Sign in to access protected pages.</p>
      <p class="hint">Demo credentials: <code>emilys</code> / <code>emilyspass</code></p>

      <div id="login-error" class="alert alert-error hidden"></div>

      <form id="login-form" novalidate>
        <div class="field-group">
          <label for="field-username">Username</label>
          <input id="field-username" type="text" placeholder="emilys" autocomplete="username" />
          <span class="field-error" id="error-username"></span>
        </div>

        <div class="field-group">
          <label for="field-password">Password</label>
          <input id="field-password" type="password" placeholder="Password" autocomplete="current-password" />
          <span class="field-error" id="error-password"></span>
        </div>

        <div class="form-actions">
          <button type="submit" id="submit-btn">Sign In</button>
          <span id="loading-indicator" class="loading-text hidden">Signing in…</span>
        </div>
      </form>
    </section>
  `

  const usernameInput = container.querySelector<HTMLInputElement>('#field-username')!
  const passwordInput = container.querySelector<HTMLInputElement>('#field-password')!
  const errorUsername = container.querySelector<HTMLElement>('#error-username')!
  const errorPassword = container.querySelector<HTMLElement>('#error-password')!
  const loginErrorEl  = container.querySelector<HTMLElement>('#login-error')!
  const submitBtn     = container.querySelector<HTMLButtonElement>('#submit-btn')!
  const loadingEl     = container.querySelector<HTMLElement>('#loading-indicator')!
  const formEl        = container.querySelector<HTMLFormElement>('#login-form')!

  const form = createForm(loginSchema)

  const submitEffect$ = form.actions$.pipe(
    ofType('SUBMIT_START'),
    exhaustMap(() => {
      if (!form.isValid()) {
        form.submitEnd(false)
        return of(null)
      }
      const { username, password } = form.getValues()
      return api.auth.login({ username, password }).pipe(
        map(res => {
          const user: AuthUser = { id: res.id, username: res.username, email: res.email, token: res.accessToken }
          appStore.dispatch({ type: 'LOGIN_SUCCESS', user })
          form.submitEnd(true)
          const redirect = appStore.getState().redirectPath ?? '/'
          router.navigate(redirect)
          return null
        }),
        catchError((err: unknown) => {
          const msg =
            err instanceof AjaxError && err.status === 400
              ? 'Invalid credentials. Try emilys / emilyspass'
              : 'Login failed — please try again.'
          loginErrorEl.textContent = msg
          loginErrorEl.classList.remove('hidden')
          form.submitEnd(false)
          return of(null)
        }),
      )
    }),
  )

  return mount(container, () => [
    bindInput(usernameInput, form, 'username'),
    bindInput(passwordInput, form, 'password'),

    bindError(errorUsername, form.field('username').showError$),
    bindError(errorPassword, form.field('password').showError$),

    form.values$.subscribe(() => loginErrorEl.classList.add('hidden')),

    classToggle(loadingEl, 'hidden')(form.submitting$.pipe(map(s => !s))),
    form.submitting$.subscribe(s => { submitBtn.disabled = s }),
    submitEffect$.subscribe(),

    (() => {
      const handler = (e: Event) => { e.preventDefault(); form.submit() }
      formEl.addEventListener('submit', handler)
      return new Subscription(() => formEl.removeEventListener('submit', handler))
    })(),
  ])
}
