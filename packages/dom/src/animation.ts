export type AnimateFn = (el: HTMLElement) => Promise<void>;
export function slideUp(duration = 200): AnimateFn {
  return async (el) => {
    const height = el.offsetHeight;
    el.style.overflow = "hidden";
    el.style.height = `${height}px`;
    el.style.transition = `height ${duration}ms ease`;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        el.style.height = "0px";
        setTimeout(() => {
          el.style.height = "";
          el.style.overflow = "";
          resolve();
        }, duration);
      });
    });
  };
}

export function scaleIn(duration = 150): AnimateFn {
  return async (el) => {
    el.style.transform = "scale(0.95)";
    el.style.opacity = "0";
    el.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        el.style.transform = "scale(1)";
        el.style.opacity = "1";
        setTimeout(() => {
          el.style.transform = "";
          el.style.opacity = "";
          resolve();
        }, duration);
      });
    });
  };
}

export function scaleOut(duration = 150): AnimateFn {
  return async (el) => {
    el.style.transform = "scale(1)";
    el.style.opacity = "1";
    el.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        el.style.transform = "scale(0.95)";
        el.style.opacity = "0";
        setTimeout(() => {
          el.style.transform = "";
          el.style.opacity = "";
          resolve();
        }, duration);
      });
    });
  };
}

export function findFirstElement(nodes: Node[]): HTMLElement | null {
  for (const n of nodes) {
    if (n.nodeType === Node.ELEMENT_NODE) return n as HTMLElement;
    if (n.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      const el = findFirstElement(
        Array.from((n as DocumentFragment).childNodes),
      );
      if (el) return el;
    }
  }
  return null;
}

// // ---------------------------------------------------------------------------
// // Types
// // ---------------------------------------------------------------------------

// /** Core animation primitive. Takes an element, animates it, resolves when done. */
// export type AnimateFn = (el: Element) => Promise<void>

// /** Animation config for enter/leave transitions. */
// export interface AnimationConfig {
//   enter?: AnimateFn
//   leave?: AnimateFn
// }

// // ---------------------------------------------------------------------------
// // Low-level helpers
// // ---------------------------------------------------------------------------

// /**
//  * waitForTransition(el, timeout?)
//  *
//  * Returns a Promise that resolves when the next `transitionend` event fires
//  * on `el`. If no event fires within `timeout` ms (default 5000), resolves
//  * anyway to prevent hangs.
//  */
// export function waitForTransition(el: Element, timeout = 5000): Promise<void> {
//   return new Promise<void>((resolve) => {
//     let resolved = false
//     const done = () => {
//       if (!resolved) {
//         resolved = true
//         resolve()
//       }
//     }
//     el.addEventListener(
//       'transitionend',
//       function handler(e: Event) {
//         if ((e as TransitionEvent).target !== el) return
//         el.removeEventListener('transitionend', handler)
//         done()
//       },
//     )
//     setTimeout(done, timeout)
//   })
// }

// /**
//  * waitForAnimation(el, timeout?)
//  *
//  * Returns a Promise that resolves when the next `animationend` event fires
//  * on `el`. If no event fires within `timeout` ms (default 5000), resolves
//  * anyway to prevent hangs.
//  */
// export function waitForAnimation(el: Element, timeout = 5000): Promise<void> {
//   return new Promise<void>((resolve) => {
//     let resolved = false
//     const done = () => {
//       if (!resolved) {
//         resolved = true
//         resolve()
//       }
//     }
//     el.addEventListener(
//       'animationend',
//       function handler(e: Event) {
//         if ((e as AnimationEvent).target !== el) return
//         el.removeEventListener('animationend', handler)
//         done()
//       },
//     )
//     setTimeout(done, timeout)
//   })
// }

// // ---------------------------------------------------------------------------
// // Factories
// // ---------------------------------------------------------------------------

// /**
//  * cssTransition({ from, active, to?, duration? })
//  *
//  * CSS class-based transition animation:
//  * 1. Add `from` class (initial state, e.g. `opacity: 0`)
//  * 2. Force reflow
//  * 3. Remove `from`, add `active` (target state + `transition` property)
//  * 4. Wait for `transitionend`
//  * 5. Remove `active`, optionally add `to` class
//  *
//  * @example
//  *   cssTransition({
//  *     from: 'fade-enter-from',   // opacity: 0
//  *     active: 'fade-enter-active', // opacity: 1; transition: opacity 300ms
//  *   })
//  */
// export function cssTransition(config: {
//   from: string
//   active: string
//   to?: string
//   duration?: number
// }): AnimateFn {
//   return (el: Element) => {
//     el.classList.add(config.from)
//     // Force reflow so the browser registers the initial state
//     void (el as HTMLElement).offsetHeight
//     el.classList.remove(config.from)
//     el.classList.add(config.active)

//     return waitForTransition(el, config.duration ?? 5000).then(() => {
//       el.classList.remove(config.active)
//       if (config.to) el.classList.add(config.to)
//     })
//   }
// }

// /**
//  * cssKeyframes(className, duration?)
//  *
//  * CSS @keyframes animation: add a class that triggers a CSS animation,
//  * wait for `animationend`, then remove the class.
//  *
//  * @example
//  *   // CSS: .bounce-in { animation: bounceIn 500ms ease; }
//  *   cssKeyframes('bounce-in', 600)
//  */
// export function cssKeyframes(className: string, duration?: number): AnimateFn {
//   return (el: Element) => {
//     el.classList.add(className)
//     return waitForAnimation(el, duration ?? 5000).then(() => {
//       el.classList.remove(className)
//     })
//   }
// }

// /**
//  * webAnimate(keyframes, options?)
//  *
//  * Web Animations API wrapper. Calls `el.animate(keyframes, options)` and
//  * resolves when the animation finishes.
//  *
//  * @example
//  *   webAnimate(
//  *     [{ opacity: 0 }, { opacity: 1 }],
//  *     { duration: 300, easing: 'ease-out' },
//  *   )
//  */
// export function webAnimate(
//   keyframes: Keyframe[],
//   options?: KeyframeAnimationOptions,
// ): AnimateFn {
//   return (el: Element) =>
//     new Promise<void>((resolve) => {
//       const anim = el.animate(keyframes, options)
//       anim.onfinish = () => resolve()
//       anim.oncancel = () => resolve()
//     })
// }

// // ---------------------------------------------------------------------------
// // Built-in Presets (Web Animations API — zero CSS needed)
// // ---------------------------------------------------------------------------

// /**
//  * fadeIn(duration?)
//  *
//  * Fades element from opacity 0 to 1. Default 300ms.
//  */
// export function fadeIn(duration = 300): AnimateFn {
//   return webAnimate(
//     [{ opacity: 0 }, { opacity: 1 }],
//     { duration, easing: 'ease-out', fill: 'forwards' },
//   )
// }

// /**
//  * fadeOut(duration?)
//  *
//  * Fades element from opacity 1 to 0. Default 300ms.
//  */
// export function fadeOut(duration = 300): AnimateFn {
//   return webAnimate(
//     [{ opacity: 1 }, { opacity: 0 }],
//     { duration, easing: 'ease-out', fill: 'forwards' },
//   )
// }

// const slideOffsets: Record<string, { x: string; y: string }> = {
//   left: { x: '-20px', y: '0' },
//   right: { x: '20px', y: '0' },
//   up: { x: '0', y: '-20px' },
//   down: { x: '0', y: '20px' },
// }

// /**
//  * slideIn(direction?, duration?)
//  *
//  * Slides element in from the given direction. Default 'left', 300ms.
//  */
// export function slideIn(
//   direction: 'left' | 'right' | 'up' | 'down' = 'left',
//   duration = 300,
// ): AnimateFn {
//   const { x, y } = slideOffsets[direction]
//   return webAnimate(
//     [
//       { opacity: 0, transform: `translate(${x}, ${y})` },
//       { opacity: 1, transform: 'translate(0, 0)' },
//     ],
//     { duration, easing: 'ease-out', fill: 'forwards' },
//   )
// }

// /**
//  * slideOut(direction?, duration?)
//  *
//  * Slides element out toward the given direction. Default 'left', 300ms.
//  */
// export function slideOut(
//   direction: 'left' | 'right' | 'up' | 'down' = 'left',
//   duration = 300,
// ): AnimateFn {
//   const { x, y } = slideOffsets[direction]
//   return webAnimate(
//     [
//       { opacity: 1, transform: 'translate(0, 0)' },
//       { opacity: 0, transform: `translate(${x}, ${y})` },
//     ],
//     { duration, easing: 'ease-in', fill: 'forwards' },
//   )
// }

// /**
//  * scaleIn(duration?)
//  *
//  * Scales element from 0.8 to 1 with fade. Default 300ms.
//  */
// export function scaleIn(duration = 300): AnimateFn {
//   return webAnimate(
//     [
//       { opacity: 0, transform: 'scale(0.8)' },
//       { opacity: 1, transform: 'scale(1)' },
//     ],
//     { duration, easing: 'ease-out', fill: 'forwards' },
//   )
// }

// /**
//  * scaleOut(duration?)
//  *
//  * Scales element from 1 to 0.8 with fade. Default 300ms.
//  */
// export function scaleOut(duration = 300): AnimateFn {
//   return webAnimate(
//     [
//       { opacity: 1, transform: 'scale(1)' },
//       { opacity: 0, transform: 'scale(0.8)' },
//     ],
//     { duration, easing: 'ease-in', fill: 'forwards' },
//   )
// }

// // ---------------------------------------------------------------------------
// // Internal helper: find first Element child
// // ---------------------------------------------------------------------------

// /** Find the first Element node in an array of nodes. */
// export function findFirstElement(nodes: Node[]): Element | null {
//   for (const n of nodes) {
//     if (n.nodeType === Node.ELEMENT_NODE) return n as Element
//   }
//   return null
// }
