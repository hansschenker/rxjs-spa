# Animations Deep Dive

The `@rxjs-spa/dom` package includes a powerful and flexible animation system designed to work seamlessly with reactive DOM updates. It supports both CSS-based transitions and the modern Web Animations API (WAAPI).

## Core Concepts

Animations are driven by the `AnimateFn` type:

```typescript
type AnimateFn = (el: Element) => Promise<void>
```

An animation function takes a DOM element, performs visual changes, and returns a `Promise` that resolves when the animation is complete.

These functions are primarily used in **Structural Directives** like `when()` (conditionals) and `list()` (loops) via the `enter` and `leave` options.

## structural Animations

### 1. Conditional Rendering (`when`)

You can animate elements as they enter and leave the DOM based on an Observable condition.

```typescript
import { html, when } from '@rxjs-spa/dom'
import { fadeIn, fadeOut } from '@rxjs-spa/dom/animation'

const visible$ = new BehaviorSubject(false)

const template = html`
  <div>
    <button @click=${() => visible$.next(!visible$.value)}>Toggle</button>
    
    ${when(visible$,
      () => html`<div class="box">I fade in and out!</div>`,
      undefined,
      // Animation Config
      {
        enter: fadeIn(300),
        leave: fadeOut(300)
      }
    )}
  </div>
`
```

### 2. List Rendering (`list`)

Animating lists is just as easy. New items trigger `enter`, and removed items trigger `leave`.

```typescript
import { list } from '@rxjs-spa/dom'
import { slideIn, slideOut } from '@rxjs-spa/dom/animation'

const items$ = store.select(s => s.items)

const template = html`
  <ul>
    ${list(items$,
      item => item.id,
      item$ => html`<li>${item$.pipe(map(i => i.text))}</li>`,
      // Animation Config
      {
        enter: slideIn('left', 200),
        leave: slideOut('right', 200)
      }
    )}
  </ul>
`
```

## Built-in Presets

We provide several high-performance presets powered by the Web Animations API (no CSS required):

| Preset | Arguments | Description |
| :--- | :--- | :--- |
| `fadeIn` | `(duration?)` | Opacity 0 → 1 |
| `fadeOut` | `(duration?)` | Opacity 1 → 0 |
| `slideIn` | `(direction?, duration?)` | Slides element in (`left`, `right`, `up`, `down`) |
| `slideOut` | `(direction?, duration?)` | Slides element out (`left`, `right`, `up`, `down`) |
| `scaleIn` | `(duration?)` | Scaling 0.8 → 1 with fade |
| `scaleOut` | `(duration?)` | Scaling 1 → 0.8 with fade |

## Custom Animations

### 1. CSS Transitions (`cssTransition`)

If you prefer using CSS classes (similar to Vue's `<Transition>`), use `cssTransition`.

**CSS:**
```css
/* Initial state */
.fade-enter-from { opacity: 0; transform: translateY(-10px); }
/* Active state (transition property) */
.fade-enter-active { transition: opacity 0.3s, transform 0.3s; }
/* Target state is automatic (classes removed) */
```

**TypeScript:**
```typescript
import { cssTransition } from '@rxjs-spa/dom/animation'

const myFadeIn = cssTransition({
  from: 'fade-enter-from',
  active: 'fade-enter-active',
  duration: 300 // fallback timeout
})

when(cond$, template, undefined, { enter: myFadeIn })
```

### 2. Web Animations API (`webAnimate`)

For full programmatic control, wrapper `Element.animate()`:

```typescript
import { webAnimate } from '@rxjs-spa/dom/animation'

const spinIn = webAnimate(
  [
    { transform: 'rotate(0deg) scale(0)' },
    { transform: 'rotate(360deg) scale(1)' }
  ],
  { duration: 500, easing: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)' }
)
```

### 3. Fully Custom

Since `AnimateFn` is just a function returning a Promise, you can use any library (GSAP, Anime.js, etc.).

```typescript
const gsapEnter = (el: Element) => new Promise<void>(resolve => {
  gsap.fromTo(el, 
    { x: -100, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.5, onComplete: resolve }
  )
})
```
