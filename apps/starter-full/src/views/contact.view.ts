import { Subscription, of } from 'rxjs'
import { catchError, exhaustMap, map } from 'rxjs/operators'
import { mount, classToggle } from '@rxjs-spa/dom'
import { ofType } from '@rxjs-spa/store'
import { http } from '@rxjs-spa/http'
import { createForm, s, bindInput, bindSelect, bindError } from '@rxjs-spa/forms'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const contactSchema = {
  name:     s.string('').required('Name is required').minLength(2, 'At least 2 characters'),
  email:    s.string('').required('Email is required').email('Enter a valid email'),
  subject:  s.string('').required('Subject is required').minLength(3, 'At least 3 characters'),
  message:  s.string('').required('Message is required').minLength(20, 'At least 20 characters').maxLength(500, 'Max 500 characters'),
  priority: s.string('medium').oneOf(['low', 'medium', 'high'], 'Choose a valid priority'),
}

// ---------------------------------------------------------------------------
// View (imperative — forms use DOM element bindings)
// ---------------------------------------------------------------------------

export function contactView(container: Element): Subscription {
  container.innerHTML = `
    <section class="view">
      <h1>Contact Us</h1>
      <p>Fill in the form below and we'll get back to you.</p>

      <div id="submit-success" class="alert alert-success hidden">
        Message sent! We'll be in touch soon.
      </div>
      <div id="submit-error" class="alert alert-error hidden">
        Something went wrong. Please try again.
      </div>

      <form id="contact-form" novalidate>
        <div class="field-group">
          <label for="field-name">Name</label>
          <input id="field-name" type="text" placeholder="Your name" />
          <span class="field-error" id="error-name"></span>
        </div>

        <div class="field-group">
          <label for="field-email">Email</label>
          <input id="field-email" type="email" placeholder="you@example.com" />
          <span class="field-error" id="error-email"></span>
        </div>

        <div class="field-group">
          <label for="field-subject">Subject</label>
          <input id="field-subject" type="text" placeholder="What's this about?" />
          <span class="field-error" id="error-subject"></span>
        </div>

        <div class="field-group">
          <label for="field-priority">Priority</label>
          <select id="field-priority">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
          <span class="field-error" id="error-priority"></span>
        </div>

        <div class="field-group">
          <label for="field-message">Message</label>
          <textarea id="field-message" rows="5" placeholder="Tell us more…"></textarea>
          <span class="field-error" id="error-message"></span>
          <span class="char-count" id="char-count">0 / 500</span>
        </div>

        <div class="form-actions">
          <button type="submit" id="submit-btn">Send message</button>
          <button type="button" id="reset-btn">Reset</button>
          <span id="loading-indicator" class="loading-text hidden">Sending…</span>
        </div>
      </form>
    </section>
  `

  // ── Elements ──────────────────────────────────────────────────────────────
  const nameInput      = container.querySelector<HTMLInputElement>('#field-name')!
  const emailInput     = container.querySelector<HTMLInputElement>('#field-email')!
  const subjectInput   = container.querySelector<HTMLInputElement>('#field-subject')!
  const messageInput   = container.querySelector<HTMLTextAreaElement>('#field-message')!
  const prioritySelect = container.querySelector<HTMLSelectElement>('#field-priority')!

  const errorName     = container.querySelector<HTMLElement>('#error-name')!
  const errorEmail    = container.querySelector<HTMLElement>('#error-email')!
  const errorSubject  = container.querySelector<HTMLElement>('#error-subject')!
  const errorMessage  = container.querySelector<HTMLElement>('#error-message')!
  const errorPriority = container.querySelector<HTMLElement>('#error-priority')!

  const charCount   = container.querySelector<HTMLElement>('#char-count')!
  const submitBtn   = container.querySelector<HTMLButtonElement>('#submit-btn')!
  const resetBtn    = container.querySelector<HTMLButtonElement>('#reset-btn')!
  const loadingEl   = container.querySelector<HTMLElement>('#loading-indicator')!
  const successEl   = container.querySelector<HTMLElement>('#submit-success')!
  const submitErrEl = container.querySelector<HTMLElement>('#submit-error')!
  const formEl      = container.querySelector<HTMLFormElement>('#contact-form')!

  // ── Form ──────────────────────────────────────────────────────────────────
  const form = createForm(contactSchema)

  // ── Submit effect ─────────────────────────────────────────────────────────
  const submitEffect$ = form.actions$.pipe(
    ofType('SUBMIT_START'),
    exhaustMap(() => {
      if (!form.isValid()) {
        form.submitEnd(false)
        return of(null)
      }
      const values = form.getValues()
      return http.post('https://jsonplaceholder.typicode.com/posts', values).pipe(
        map(() => {
          form.submitEnd(true)
          return null
        }),
        catchError(() => {
          form.submitEnd(false)
          return of(null)
        }),
      )
    }),
  )

  // ── Sinks ─────────────────────────────────────────────────────────────────
  return mount(container, () => [
    bindInput(nameInput, form, 'name'),
    bindInput(emailInput, form, 'email'),
    bindInput(subjectInput, form, 'subject'),
    bindInput(messageInput as unknown as HTMLInputElement, form, 'message'),
    bindSelect(prioritySelect, form, 'priority'),

    bindError(errorName,     form.field('name').showError$),
    bindError(errorEmail,    form.field('email').showError$),
    bindError(errorSubject,  form.field('subject').showError$),
    bindError(errorMessage,  form.field('message').showError$),
    bindError(errorPriority, form.field('priority').showError$),

    form.field('message').value$.subscribe(v => {
      charCount.textContent = `${v.length} / 500`
    }),

    classToggle(loadingEl, 'hidden')(form.submitting$.pipe(map(s => !s))),
    form.submitting$.subscribe(s => { submitBtn.disabled = s }),
    submitEffect$.subscribe(),

    form.actions$.subscribe(action => {
      if (action.type === 'SUBMIT_END') {
        successEl.classList.toggle('hidden', !action.ok)
        submitErrEl.classList.toggle('hidden', action.ok)
        if (action.ok) formEl.classList.add('hidden')
      }
      if (action.type === 'RESET') {
        successEl.classList.add('hidden')
        submitErrEl.classList.add('hidden')
        formEl.classList.remove('hidden')
      }
    }),

    (() => {
      const handler = (e: Event) => { e.preventDefault(); form.submit() }
      formEl.addEventListener('submit', handler)
      return new Subscription(() => formEl.removeEventListener('submit', handler))
    })(),

    (() => {
      const handler = () => form.reset()
      resetBtn.addEventListener('click', handler)
      return new Subscription(() => resetBtn.removeEventListener('click', handler))
    })(),
  ])
}
