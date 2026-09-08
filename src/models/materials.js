import * as THREE from 'three';
import { markSceneDirty } from '../core/scene.js';

export let pocketMaterial = null;
export const flagMaterialsCache = { global: {} };

/**
 * Sets the active pocket material reference.
 * @param {THREE.Material} mat
 */
export function setPocketMaterial(mat) {
    pocketMaterial = mat;
}

/**
 * Updates the color of the flag's pole pocket material.
 * @param {string} hex - Hexadecimal color code (e.g. '#000000').
 */
export function updatePocketMaterialColor(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    if (pocketMaterial) {
        pocketMaterial.color.set(normalized);
        markSceneDirty();
    }
}

/**
 * Normalizes hex colors from 3-character or 6-character formats to standard uppercase #RRGGBB.
 * 
 * @param {string} value - Hex string with or without leading hash.
 * @returns {string|null} Normalized hex or null if invalid.
 */
export function normalizeHex(value) {
    if (!value) return null;
    const trimmedValue = value.trim();
    const withHash = trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`;
    const shortMatch = /^#([\da-fA-F]{3})$/;
    const fullMatch = /^#([\da-fA-F]{6})$/;

    if (fullMatch.test(withHash)) return withHash.toUpperCase();

    const shortResult = withHash.match(shortMatch);
    if (!shortResult) return null;

    const expanded = shortResult[1]
        .split('')
        .map((character) => `${character}${character}`)
        .join('');

    return `#${expanded}`.toUpperCase();
}
