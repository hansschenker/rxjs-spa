/** Core animation primitive. Takes an element, animates it, resolves when done. */
export type AnimateFn = (el: Element) => Promise<void>;
/** Animation config for enter/leave transitions. */
export interface AnimationConfig {
    enter?: AnimateFn;
    leave?: AnimateFn;
}
/**
 * waitForTransition(el, timeout?)
 *
 * Returns a Promise that resolves when the next `transitionend` event fires
 * on `el`. If no event fires within `timeout` ms (default 5000), resolves
 * anyway to prevent hangs.
 */
export declare function waitForTransition(el: Element, timeout?: number): Promise<void>;
/**
 * waitForAnimation(el, timeout?)
 *
 * Returns a Promise that resolves when the next `animationend` event fires
 * on `el`. If no event fires within `timeout` ms (default 5000), resolves
 * anyway to prevent hangs.
 */
export declare function waitForAnimation(el: Element, timeout?: number): Promise<void>;
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
export declare function cssTransition(config: {
    from: string;
    active: string;
    to?: string;
    duration?: number;
}): AnimateFn;
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
export declare function cssKeyframes(className: string, duration?: number): AnimateFn;
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
export declare function webAnimate(keyframes: Keyframe[], options?: KeyframeAnimationOptions): AnimateFn;
/**
 * fadeIn(duration?)
 *
 * Fades element from opacity 0 to 1. Default 300ms.
 */
export declare function fadeIn(duration?: number): AnimateFn;
/**
 * fadeOut(duration?)
 *
 * Fades element from opacity 1 to 0. Default 300ms.
 */
export declare function fadeOut(duration?: number): AnimateFn;
/**
 * slideIn(direction?, duration?)
 *
 * Slides element in from the given direction. Default 'left', 300ms.
 */
export declare function slideIn(direction?: 'left' | 'right' | 'up' | 'down', duration?: number): AnimateFn;
/**
 * slideOut(direction?, duration?)
 *
 * Slides element out toward the given direction. Default 'left', 300ms.
 */
export declare function slideOut(direction?: 'left' | 'right' | 'up' | 'down', duration?: number): AnimateFn;
/**
 * scaleIn(duration?)
 *
 * Scales element from 0.8 to 1 with fade. Default 300ms.
 */
export declare function scaleIn(duration?: number): AnimateFn;
/**
 * scaleOut(duration?)
 *
 * Scales element from 1 to 0.8 with fade. Default 300ms.
 */
export declare function scaleOut(duration?: number): AnimateFn;
/** Find the first Element node in an array of nodes. */
export declare function findFirstElement(nodes: Node[]): Element | null;
