import * as THREE from 'three';

/**
 * Normalizes an angle in radians to the [-PI, PI] range.
 * 
 * @param {number} angle - Input angle in radians.
 * @returns {number} Normalized angle in [-PI, PI].
 */
export function getNormalizedRotationAngle(angle) {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

/**
 * Finds the equivalent target angle closest to current to avoid unnecessary 360-degree spins.
 * 
 * @param {number} current - Current angle in radians.
 * @param {number} target - Target angle in radians.
 * @returns {number} Closest equivalent angle.
 */
export function getClosestAngle(current, target) {
    const diff = (target - current) % (Math.PI * 2);
    const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return current + normalizedDiff;
}

/**
 * Calculates viewport aspect ratio from the canvas container or window.
 * 
 * @param {HTMLElement} container - Canvas container element.
 * @returns {number} Aspect ratio (width / height).
 */
export function getViewportAspect(container) {
    const width = (container && container.clientWidth) || window.innerWidth;
    const height = (container && container.clientHeight) || window.innerHeight;
    return width / Math.max(height, 1);
}

/**
 * Returns clamped device pixel ratio to maintain high performance on mobile devices.
 * 
 * @param {boolean} isMobile - Whether the current viewport matches mobile breakpoint.
 * @returns {number} Clamped pixel ratio.
 */
export function getClampedPixelRatio(isMobile = false) {
    const maxDPR = isMobile ? 1.5 : 2.0;
    return Math.min(window.devicePixelRatio || 1, maxDPR);
}
