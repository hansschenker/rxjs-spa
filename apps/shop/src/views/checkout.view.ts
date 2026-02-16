import { Subscription, of } from 'rxjs'
import { map, exhaustMap, catchError } from 'rxjs/operators'
import { mount, text, classToggle } from '@rxjs-spa/dom'
import { ofType } from '@rxjs-spa/store'
import { http, toRemoteData, isSuccess, isError } from '@rxjs-spa/http'
import { createForm, s, bindInput, bindError } from '@rxjs-spa/forms'
import type { Router } from '@rxjs-spa/router'
import type { Store } from '@rxjs-spa/store'
import type { CartState, CartAction } from '../store/cart.store'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const checkoutSchema = {
  firstName:  s.string('').required('First name is required'),
  lastName:   s.string('').required('Last name is required'),
  email:      s.string('').required('Email is required').email('Enter a valid email'),
  phone:      s.string(''),
  address:    s.string('').required('Address is required').minLength(5, 'Too short'),
  city:       s.string('').required('City is required'),
  state:      s.string('').required('State is required'),
  zip:        s.string('').required('ZIP code is required').pattern(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP'),
  cardNumber: s.string('').required('Card number is required').pattern(/^\d{16}$/, '16 digits required'),
  expiry:     s.string('').required('Expiry is required').pattern(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Format: MM/YY'),
  cvv:        s.string('').required('CVV is required').pattern(/^\d{3,4}$/, '3 or 4 digits'),
}

// ---------------------------------------------------------------------------
// View (imperative DOM pattern — matches contact.view.ts)
// ---------------------------------------------------------------------------

export function checkoutView(
  deps: { router: Router<any>; cartStore: Store<CartState, CartAction> },
) {
  const { router, cartStore } = deps
  const container = document.createElement('div')

  const items = cartStore.getState().items
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  container.innerHTML = `
    <section class="view checkout-view">
      <h1>Checkout</h1>

      <div id="empty-cart-msg" class="${items.length > 0 ? 'hidden' : ''}">
        <p>Your cart is empty. Add some products before checking out.</p>
        <a href="${router.link('/')}" class="btn btn-primary">Continue Shopping</a>
      </div>

      <div id="checkout-content" class="${items.length === 0 ? 'hidden' : ''} checkout-layout">
        <div class="checkout-form-wrap">
          <div id="submit-success" class="alert alert-success hidden">
            <h2>Order Placed!</h2>
            <p>Your order has been submitted successfully.</p>
            <a href="${router.link('/')}" class="btn btn-primary">Continue Shopping</a>
          </div>
          <div id="submit-error" class="alert alert-error hidden">
            Something went wrong. Please try again.
          </div>

          <form id="checkout-form" novalidate>
            <h2>Shipping Information</h2>
            <div class="form-row">
              <div class="field-group">
                <label for="field-firstName">First Name</label>
                <input id="field-firstName" type="text" placeholder="John" />
                <span class="field-error" id="error-firstName"></span>
              </div>
              <div class="field-group">
                <label for="field-lastName">Last Name</label>
                <input id="field-lastName" type="text" placeholder="Doe" />
                <span class="field-error" id="error-lastName"></span>
              </div>
            </div>

            <div class="form-row">
              <div class="field-group">
                <label for="field-email">Email</label>
                <input id="field-email" type="email" placeholder="john@example.com" />
                <span class="field-error" id="error-email"></span>
              </div>
              <div class="field-group">
                <label for="field-phone">Phone (optional)</label>
                <input id="field-phone" type="tel" placeholder="+1 555-0123" />
                <span class="field-error" id="error-phone"></span>
              </div>
            </div>

            <div class="field-group">
              <label for="field-address">Address</label>
              <input id="field-address" type="text" placeholder="123 Main St" />
              <span class="field-error" id="error-address"></span>
            </div>

            <div class="form-row form-row-3">
              <div class="field-group">
                <label for="field-city">City</label>
                <input id="field-city" type="text" placeholder="New York" />
                <span class="field-error" id="error-city"></span>
              </div>
              <div class="field-group">
                <label for="field-state">State</label>
                <input id="field-state" type="text" placeholder="NY" />
                <span class="field-error" id="error-state"></span>
              </div>
              <div class="field-group">
                <label for="field-zip">ZIP Code</label>
                <input id="field-zip" type="text" placeholder="10001" />
                <span class="field-error" id="error-zip"></span>
              </div>
            </div>

            <h2>Payment Information</h2>
            <p class="hint">This is a demo — no real payment is processed.</p>

            <div class="field-group">
              <label for="field-cardNumber">Card Number</label>
              <input id="field-cardNumber" type="text" placeholder="4111111111111111" maxlength="16" />
              <span class="field-error" id="error-cardNumber"></span>
            </div>

            <div class="form-row">
              <div class="field-group">
                <label for="field-expiry">Expiry</label>
                <input id="field-expiry" type="text" placeholder="MM/YY" maxlength="5" />
                <span class="field-error" id="error-expiry"></span>
              </div>
              <div class="field-group">
                <label for="field-cvv">CVV</label>
                <input id="field-cvv" type="text" placeholder="123" maxlength="4" />
                <span class="field-error" id="error-cvv"></span>
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" id="submit-btn" class="btn btn-primary btn-lg">Place Order</button>
              <span id="loading-indicator" class="loading-text hidden">Processing...</span>
            </div>
          </form>
        </div>

        <div class="order-summary">
          <h2>Order Summary</h2>
          <ul class="summary-items">
            ${items.map(item => `
              <li class="summary-item">
                <span class="summary-item-name">${item.product.title.slice(0, 40)}${item.product.title.length > 40 ? '...' : ''}</span>
                <span class="summary-item-qty">x${item.quantity}</span>
                <span class="summary-item-price">$${(item.product.price * item.quantity).toFixed(2)}</span>
              </li>
            `).join('')}
          </ul>
          <div class="summary-row summary-total">
            <strong>Total (${itemCount} items)</strong>
            <strong>$${subtotal.toFixed(2)}</strong>
          </div>
        </div>
      </div>
    </section>
  `

  // If cart is empty, return early with minimal wiring
  if (items.length === 0) {
    const fragment = document.createDocumentFragment()
    fragment.appendChild(container.firstElementChild!)
    return { fragment, sub: new Subscription(), strings: [] as any, values: [] }
  }

  // ── Elements ──────────────────────────────────────────────────────────
  const section = container.querySelector('section')!
  const formEl = section.querySelector<HTMLFormElement>('#checkout-form')!
  const submitBtn = section.querySelector<HTMLButtonElement>('#submit-btn')!
  const loadingEl = section.querySelector<HTMLElement>('#loading-indicator')!
  const successEl = section.querySelector<HTMLElement>('#submit-success')!
  const submitErrEl = section.querySelector<HTMLElement>('#submit-error')!

  const firstNameInput = section.querySelector<HTMLInputElement>('#field-firstName')!
  const lastNameInput = section.querySelector<HTMLInputElement>('#field-lastName')!
  const emailInput = section.querySelector<HTMLInputElement>('#field-email')!
  const phoneInput = section.querySelector<HTMLInputElement>('#field-phone')!
  const addressInput = section.querySelector<HTMLInputElement>('#field-address')!
  const cityInput = section.querySelector<HTMLInputElement>('#field-city')!
  const stateInput = section.querySelector<HTMLInputElement>('#field-state')!
  const zipInput = section.querySelector<HTMLInputElement>('#field-zip')!
  const cardNumberInput = section.querySelector<HTMLInputElement>('#field-cardNumber')!
  const expiryInput = section.querySelector<HTMLInputElement>('#field-expiry')!
  const cvvInput = section.querySelector<HTMLInputElement>('#field-cvv')!

  const errorFirstName = section.querySelector<HTMLElement>('#error-firstName')!
  const errorLastName = section.querySelector<HTMLElement>('#error-lastName')!
  const errorEmail = section.querySelector<HTMLElement>('#error-email')!
  const errorPhone = section.querySelector<HTMLElement>('#error-phone')!
  const errorAddress = section.querySelector<HTMLElement>('#error-address')!
  const errorCity = section.querySelector<HTMLElement>('#error-city')!
  const errorState = section.querySelector<HTMLElement>('#error-state')!
  const errorZip = section.querySelector<HTMLElement>('#error-zip')!
  const errorCardNumber = section.querySelector<HTMLElement>('#error-cardNumber')!
  const errorExpiry = section.querySelector<HTMLElement>('#error-expiry')!
  const errorCvv = section.querySelector<HTMLElement>('#error-cvv')!

  // ── Form ──────────────────────────────────────────────────────────────
  const form = createForm(checkoutSchema)

  // ── Submit effect ─────────────────────────────────────────────────────
  const submitEffect$ = form.actions$.pipe(
    ofType('SUBMIT_START'),
    exhaustMap(() => {
      if (!form.isValid()) {
        form.submitEnd(false)
        return of(null)
      }
      const values = form.getValues()
      const order = { ...values, items, total: subtotal }
      return http.post('https://jsonplaceholder.typicode.com/posts', order).pipe(
        toRemoteData(),
        map((rd) => {
          if (isSuccess(rd)) {
            form.submitEnd(true)
            cartStore.dispatch({ type: 'CLEAR_CART' })
          }
          if (isError(rd)) form.submitEnd(false)
          return rd
        }),
        catchError(() => {
          form.submitEnd(false)
          return of(null)
        }),
      )
    }),
  )

  // ── Wire everything ───────────────────────────────────────────────────
  const fragment = document.createDocumentFragment()
  fragment.appendChild(section)

  const sub = new Subscription()

  // Bind inputs
  sub.add(bindInput(firstNameInput, form, 'firstName'))
  sub.add(bindInput(lastNameInput, form, 'lastName'))
  sub.add(bindInput(emailInput, form, 'email'))
  sub.add(bindInput(phoneInput, form, 'phone'))
  sub.add(bindInput(addressInput, form, 'address'))
  sub.add(bindInput(cityInput, form, 'city'))
  sub.add(bindInput(stateInput, form, 'state'))
  sub.add(bindInput(zipInput, form, 'zip'))
  sub.add(bindInput(cardNumberInput, form, 'cardNumber'))
  sub.add(bindInput(expiryInput, form, 'expiry'))
  sub.add(bindInput(cvvInput, form, 'cvv'))

  // Bind errors
  sub.add(bindError(errorFirstName, form.field('firstName').showError$))
  sub.add(bindError(errorLastName, form.field('lastName').showError$))
  sub.add(bindError(errorEmail, form.field('email').showError$))
  sub.add(bindError(errorPhone, form.field('phone').showError$))
  sub.add(bindError(errorAddress, form.field('address').showError$))
  sub.add(bindError(errorCity, form.field('city').showError$))
  sub.add(bindError(errorState, form.field('state').showError$))
  sub.add(bindError(errorZip, form.field('zip').showError$))
  sub.add(bindError(errorCardNumber, form.field('cardNumber').showError$))
  sub.add(bindError(errorExpiry, form.field('expiry').showError$))
  sub.add(bindError(errorCvv, form.field('cvv').showError$))

  // Loading + submit state
  sub.add(classToggle(loadingEl, 'hidden')(form.submitting$.pipe(map(s => !s))))
  sub.add(form.submitting$.subscribe(s => { submitBtn.disabled = s }))

  // Submit effect
  sub.add(submitEffect$.subscribe())

  // Success / error banners
  sub.add(form.actions$.subscribe(action => {
    if (action.type === 'SUBMIT_END') {
      successEl.classList.toggle('hidden', !action.ok)
      submitErrEl.classList.toggle('hidden', action.ok)
      if (action.ok) {
        formEl.classList.add('hidden')
      }
    }
  }))

  // Form submit handler
  const submitHandler = (e: Event) => { e.preventDefault(); form.submit() }
  formEl.addEventListener('submit', submitHandler)
  sub.add(new Subscription(() => formEl.removeEventListener('submit', submitHandler)))

  return { fragment, sub, strings: [] as any, values: [] }
}
