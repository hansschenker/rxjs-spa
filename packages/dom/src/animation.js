// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------
/**
 * waitForTransition(el, timeout?)
 *
 * Returns a Promise that resolves when the next `transitionend` event fires
 * on `el`. If no event fires within `timeout` ms (default 5000), resolves
 * anyway to prevent hangs.
 */
export function waitForTransition(el, timeout = 5000) {
    return new Promise((resolve) => {
        let resolved = false;
        const done = () => {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        };
        el.addEventListener('transitionend', function handler(e) {
            if (e.target !== el)
                return;
            el.removeEventListener('transitionend', handler);
            done();
        });
        setTimeout(done, timeout);
    });
}
/**
 * waitForAnimation(el, timeout?)
 *
 * Returns a Promise that resolves when the next `animationend` event fires
 * on `el`. If no event fires within `timeout` ms (default 5000), resolves
 * anyway to prevent hangs.
 */
export function waitForAnimation(el, timeout = 5000) {
    return new Promise((resolve) => {
        let resolved = false;
        const done = () => {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        };
        el.addEventListener('animationend', function handler(e) {
            if (e.target !== el)
                return;
            el.removeEventListener('animationend', handler);
            done();
        });
        setTimeout(done, timeout);
    });
}
// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
/**
 * cssTransition({ from, active, to?, duration? })
 *
 * CSS class-based transition animation:
 * 1. Add `from` class (initial state, e.g. `opacity: 0`)
 * 2. Force reflow
 * 3. Remove `from`, add `active` (target state + `transition` property)
 * 4. Wait for `transitionend`
 * 5. Remove `active`, optionally add `to` class
 *
 * @example
 *   cssTransition({
 *     from: 'fade-enter-from',   // opacity: 0
 *     active: 'fade-enter-active', // opacity: 1; transition: opacity 300ms
 *   })
 */
export function cssTransition(config) {
    return (el) => {
        el.classList.add(config.from);
        // Force reflow so the browser registers the initial state
        void el.offsetHeight;
        el.classList.remove(config.from);
        el.classList.add(config.active);
        return waitForTransition(el, config.duration ?? 5000).then(() => {
            el.classList.remove(config.active);
            if (config.to)
                el.classList.add(config.to);
        });
    };
}
/**
 * cssKeyframes(className, duration?)
 *
 * CSS @keyframes animation: add a class that triggers a CSS animation,
 * wait for `animationend`, then remove the class.
 *
 * @example
 *   // CSS: .bounce-in { animation: bounceIn 500ms ease; }
 *   cssKeyframes('bounce-in', 600)
 */
export function cssKeyframes(className, duration) {
    return (el) => {
        el.classList.add(className);
        return waitForAnimation(el, duration ?? 5000).then(() => {
            el.classList.remove(className);
        });
    };
}
/**
 * webAnimate(keyframes, options?)
 *
 * Web Animations API wrapper. Calls `el.animate(keyframes, options)` and
 * resolves when the animation finishes.
 *
 * @example
 *   webAnimate(
 *     [{ opacity: 0 }, { opacity: 1 }],
 *     { duration: 300, easing: 'ease-out' },
 *   )
 */
export function webAnimate(keyframes, options) {
    return (el) => new Promise((resolve) => {
        const anim = el.animate(keyframes, options);
        anim.onfinish = () => resolve();
        anim.oncancel = () => resolve();
    });
}
// ---------------------------------------------------------------------------
// Built-in Presets (Web Animations API — zero CSS needed)
// ---------------------------------------------------------------------------
/**
 * fadeIn(duration?)
 *
 * Fades element from opacity 0 to 1. Default 300ms.
 */
export function fadeIn(duration = 300) {
    return webAnimate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'ease-out', fill: 'forwards' });
}
/**
 * fadeOut(duration?)
 *
 * Fades element from opacity 1 to 0. Default 300ms.
 */
export function fadeOut(duration = 300) {
    return webAnimate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-out', fill: 'forwards' });
}
const slideOffsets = {
    left: { x: '-20px', y: '0' },
    right: { x: '20px', y: '0' },
    up: { x: '0', y: '-20px' },
    down: { x: '0', y: '20px' },
};
/**
 * slideIn(direction?, duration?)
 *
 * Slides element in from the given direction. Default 'left', 300ms.
 */
export function slideIn(direction = 'left', duration = 300) {
    const { x, y } = slideOffsets[direction];
    return webAnimate([
        { opacity: 0, transform: `translate(${x}, ${y})` },
        { opacity: 1, transform: 'translate(0, 0)' },
    ], { duration, easing: 'ease-out', fill: 'forwards' });
}
/**
 * slideOut(direction?, duration?)
 *
 * Slides element out toward the given direction. Default 'left', 300ms.
 */
export function slideOut(direction = 'left', duration = 300) {
    const { x, y } = slideOffsets[direction];
    return webAnimate([
        { opacity: 1, transform: 'translate(0, 0)' },
        { opacity: 0, transform: `translate(${x}, ${y})` },
    ], { duration, easing: 'ease-in', fill: 'forwards' });
}
/**
 * scaleIn(duration?)
 *
 * Scales element from 0.8 to 1 with fade. Default 300ms.
 */
export function scaleIn(duration = 300) {
    return webAnimate([
        { opacity: 0, transform: 'scale(0.8)' },
        { opacity: 1, transform: 'scale(1)' },
    ], { duration, easing: 'ease-out', fill: 'forwards' });
}
/**
 * scaleOut(duration?)
 *
 * Scales element from 1 to 0.8 with fade. Default 300ms.
 */
export function scaleOut(duration = 300) {
    return webAnimate([
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.8)' },
    ], { duration, easing: 'ease-in', fill: 'forwards' });
}
// ---------------------------------------------------------------------------
// Internal helper: find first Element child
// ---------------------------------------------------------------------------
/** Find the first Element node in an array of nodes. */
export function findFirstElement(nodes) {
    for (const n of nodes) {
        if (n.nodeType === Node.ELEMENT_NODE)
            return n;
    }
    return null;
}
