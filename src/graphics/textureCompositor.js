import { sideConfigs, saveCurrentGraphicToCache } from './graphicConfig.js';
import { markSceneDirty } from '../core/scene.js';
import { updateTransformBadges } from './gizmo.js';

/**
 * Resets 2D graphic translation, rotation, and scale values to defaults.
 * @param {string} [side='graphic']
 */
export function resetTransformInputs(side = 'graphic') {
    const config = sideConfigs[side];
    config.scale = 1.0;
    config.panX = 0.0;
    config.panY = 0.0;
    config.rotation = 0.0;
    updateTransformBadges();
}

/**
 * Resets transforms and updates both texture matrices and the active Moveable gizmo overlay.
 * @param {string} [side='graphic']
 */
export function resetTransforms(side = 'graphic') {
    resetTransformInputs(side);
    updateTextureTransforms(side);
}

/**
 * Updates texture transform coordinates (offset, rotation, scale) for front and back flag faces.
 * Rotation is decoupled from translation so the graphic rotates in place around its own center.
 * 
 * @param {string} [side='graphic']
 */
export function updateTextureTransforms(side = 'graphic') {
    markSceneDirty();
    const config = sideConfigs[side];
    if (!config.uploadedTexture) return;

    const scale = config.scale;
    const panX = config.panX;
    const panY = config.panY;
    const rotation = config.rotation;

    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const offsetX = -(cosR * panX - sinR * panY);
    const offsetY = sinR * panX + cosR * panY;

    [config.uploadedTexture, config.uploadedFrontTex, config.uploadedBackTex].forEach(tex => {
        if (tex) {
            tex.center.set(0.5, 0.5);
            tex.rotation = rotation;
            tex.repeat.set(1 / scale, 1 / scale);
            tex.offset.set(offsetX, offsetY);
            tex.needsUpdate = true;
        }
    });

    updateTransformBadges();
    saveCurrentGraphicToCache();
}
