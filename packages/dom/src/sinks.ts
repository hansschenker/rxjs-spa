import type { Observable } from 'rxjs'
import { BehaviorSubject, Subscription } from 'rxjs'

type Unsub = () => void

function isNil(v: unknown): v is null | undefined {
  return v === null || v === undefined
}

/**
 * text(el)(value$)
 * Writes each incoming value to el.textContent.
 */
export function text(el: Element) {
  return (value$: Observable<string | number>): Subscription =>
    value$.subscribe((v) => {
      el.textContent = String(v)
    })
}

/**
 * html(el)(value$)
 * Writes each incoming value to el.innerHTML.
 */
export function html(el: Element) {
  return (value$: Observable<string>): Subscription =>
    value$.subscribe((v) => {
      ;(el as HTMLElement).innerHTML = v
    })
}

/**
 * attr(el, name)(value$)
 * - string/number -> setAttribute(name, String(value))
 * - null/undefined -> removeAttribute(name)
 */
export function attr(el: Element, name: string) {
  return (value$: Observable<string | number | null | undefined>): Subscription =>
    value$.subscribe((v) => {
      if (isNil(v)) el.removeAttribute(name)
      else el.setAttribute(name, String(v))
    })
}

/**
 * prop(el, key)(value$)
 * Writes each incoming value to (el as any)[key].
 * Useful for `value`, `checked`, etc.
 */
export function prop<T extends object, K extends keyof T>(el: T, key: K) {
  return (value$: Observable<T[K]>): Subscription =>
    value$.subscribe((v) => {
      ;(el as any)[key] = v
    })
}

/**
 * style(el, name)(value$)
 * - string/number -> set style
 * - null/undefined -> remove style
 */
export function style(el: HTMLElement, name: keyof CSSStyleDeclaration) {
  return (value$: Observable<string | number | null | undefined>): Subscription =>
    value$.subscribe((v) => {
      if (isNil(v)) (el.style as any)[name] = ''
      else (el.style as any)[name] = String(v)
    })
}

/**
 * classToggle(el, className)(on$)
 * Adds/removes a class on each boolean.
 */
export function classToggle(el: Element, className: string) {
  return (on$: Observable<boolean>): Subscription =>
    on$.subscribe((on) => {
      el.classList.toggle(className, !!on)
    })
}

/**
 * dispatch(target)(value$)
 *
 * Turns an Observable into a sink that forwards values into a target with `next(...)`
 * (typically a Subject). Business rules live in upstream `map(...)` functions.
 */
export function dispatch<T>(target: { next: (value: T) => void }) {
  return (value$: Observable<T>): Subscription => value$.subscribe((v) => target.next(v))
}

/**
 * effect(...subs)
 * Combine multiple subscriptions/teardowns into one Subscription.
 */
export function effect(...items: Array<Subscription | Unsub>): Subscription {
  const s = new Subscription()
  for (const it of items) {
    s.add(typeof it === 'function' ? new Subscription(it) : it)
  }
  return s
}

/**
 * mount(root, setup)
 *
 * Run setup once, return one Subscription representing the whole view lifecycle.
 */
export function mount(
  root: Element,
  setup: (root: Element) => Subscription | Array<Subscription | Unsub>,
): Subscription {
  const s = new Subscription()
  const out = setup(root)
  if (Array.isArray(out)) {
    for (const it of out) s.add(typeof it === 'function' ? new Subscription(it) : it)
  } else {
    s.add(out)
  }
  return s
}

export type KeyFn<T> = (item: T, index: number) => string
export type CreateFn<T> = (item: T, index: number) => Node
export type UpdateFn<T> = (node: Node, item: T, index: number) => void

/**
 * renderList(container, keyFn, createNode, updateNode?)(items$)
 *
 * Emits arrays. The DOM is kept in sync by key.
 */
export function renderList<T>(
  container: Element,
  keyFn: KeyFn<T>,
  createNode: CreateFn<T>,
  updateNode?: UpdateFn<T>,
) {
  const nodes = new Map<string, Node>()

  return (items$: Observable<readonly T[]>): Subscription =>
    items$.subscribe((items) => {
      const nextKeys = new Set<string>()
      const nextNodes: Node[] = []

      items.forEach((item, i) => {
        const key = keyFn(item, i)
        nextKeys.add(key)

        let node = nodes.get(key)
        if (!node) {
          node = createNode(item, i)
          nodes.set(key, node)
        } else if (updateNode) {
          updateNode(node, item, i)
        }

        nextNodes.push(node)
      })

      for (const [key, node] of nodes) {
        if (!nextKeys.has(key)) {
          nodes.delete(key)
          if (node.parentNode === container) container.removeChild(node)
        }
      }

      const frag = document.createDocumentFragment()
      for (const node of nextNodes) frag.appendChild(node)
      container.replaceChildren(frag)
    })
}

export type KeyedView = { node: Node; sub: Subscription }
export type CreateViewFn<T> = (item: T, index: number) => { node: Node; sub?: Subscription | Unsub }
export type UpdateViewFn<T> = (view: KeyedView, item: T, index: number) => void

function toSubscription(x?: Subscription | Unsub): Subscription {
  if (!x) return new Subscription()
  return typeof x === 'function' ? new Subscription(x) : x
}

/**
 * renderKeyedList(container, keyFn, createView, updateView?)(items$)
 *
 * Like renderList, but each item can have its own Subscription lifecycle.
 * When an item disappears (by key), its subscription is unsubscribed.
 */
export function renderKeyedList<T>(
  container: Element,
  keyFn: KeyFn<T>,
  createView: CreateViewFn<T>,
  updateView?: UpdateViewFn<T>,
) {
  const views = new Map<string, KeyedView>()

  return (items$: Observable<readonly T[]>): Subscription =>
    items$.subscribe((items) => {
      const nextKeys = new Set<string>()
      const nextNodes: Node[] = []

      items.forEach((item, i) => {
        const key = keyFn(item, i)
        nextKeys.add(key)

        let view = views.get(key)
        if (!view) {
          const created = createView(item, i)
          view = { node: created.node, sub: toSubscription(created.sub) }
          views.set(key, view)
        } else if (updateView) {
          updateView(view, item, i)
        }

        nextNodes.push(view.node)
      })

      for (const [key, view] of views) {
        if (!nextKeys.has(key)) {
          views.delete(key)
          view.sub.unsubscribe()
          if (view.node.parentNode === container) container.removeChild(view.node)
        }
      }

      const frag = document.createDocumentFragment()
      for (const node of nextNodes) frag.appendChild(node)
      container.replaceChildren(frag)
    })
}

export type ComponentCtx<A> = {
  /** Send actions upstream (usually into a Subject<Action>) */
  dispatch: (action: A) => void
}

export type ComponentFactory<T, A> = (
  item$: Observable<T>,
  ctx: ComponentCtx<A>,
  key: string,
) => { node: Node; sub?: Subscription | Unsub }

type ComponentView<T> = {
  node: Node
  sub: Subscription
  input: BehaviorSubject<T>
}

/**
 * renderKeyedComponents(container, keyFn, factory, actions)(items$)
 *
 * Each keyed item becomes a mini component:
 * - it gets its own `item$` stream (BehaviorSubject) that updates over time
 * - it can create internal event streams once, and keep them alive across updates
 * - it can dispatch multiple action types upstream
 * - when removed, its subscription is unsubscribed and its `item$` completes
 */
export function renderKeyedComponents<T, A>(
  container: Element,
  keyFn: KeyFn<T>,
  factory: ComponentFactory<T, A>,
  actions: { next: (action: A) => void },
) {
  const views = new Map<string, ComponentView<T>>()

  const ctx: ComponentCtx<A> = {
    dispatch: (a) => actions.next(a),
  }

  return (items$: Observable<readonly T[]>): Subscription =>
    items$.subscribe((items) => {
      const nextKeys = new Set<string>()
      const nextNodes: Node[] = []

      items.forEach((item, i) => {
        const key = keyFn(item, i)
        nextKeys.add(key)

        let view = views.get(key)
        if (!view) {
          const input = new BehaviorSubject<T>(item)
          const created = factory(input.asObservable(), ctx, key)
          view = { node: created.node, sub: toSubscription(created.sub), input }
          views.set(key, view)
        } else {
          // push updated item into the per-item stream, without recreating subscriptions
          view.input.next(item)
        }

        nextNodes.push(view.node)
      })

      // remove disappeared
      for (const [key, view] of views) {
        if (!nextKeys.has(key)) {
          views.delete(key)
          view.sub.unsubscribe()
          view.input.complete()
          if (view.node.parentNode === container) container.removeChild(view.node)
        }
      }

      // order nodes
      const frag = document.createDocumentFragment()
      for (const node of nextNodes) frag.appendChild(node)
      container.replaceChildren(frag)
    })
}
