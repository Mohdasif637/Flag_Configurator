/**
 * Single source of truth for the flag configurator state.
 */
export const configState = {
    size: 'Feather Flag Convex L',
    printing: 'Double Sided',
    direction: 'Right',
    poleCoverColor: '#000000',
    pole: 'With Pole',
    base: 'Cross base-grey'
};

/**
 * Runtime viewer state (AR, active viewports, loading flags).
 */
export const state = {
    ready: false,
    isInAR: false,
    arPlaced: false,
    activeView: 'home'
};

/**
 * Generates the cache key corresponding to the active size, printing type, and direction.
 * Single Sided and Air Textile share the same graphic template and mapping.
 * 
 * @returns {string} Cache key (e.g., 'l_doublesided_right').
 */
export function getCurrentConfigKey() {
    const sizeCode = configState.size.split(' ').pop().toLowerCase();
    let printing = configState.printing;
    if (printing === 'Air Textile') {
        printing = 'Single Sided';
    }
    return `${sizeCode}_${printing.toLowerCase()}_${configState.direction.toLowerCase()}`;
}
