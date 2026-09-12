import { dom } from '../ui/domElements.js';
import { configState, state, getCurrentConfigKey } from '../state/configState.js';
import { truncateFileName } from '../utils/helpers.js';

export const IMGBB_API_KEY = 'be09b3627886c592e8d7c4bf94518b77';

export const sideConfigs = {
    graphic: {
        label: 'Graphic',
        input: document.getElementById('graphic-upload'),
        dropzone: document.getElementById('graphic-dropzone'),
        titleElement: document.querySelector('#graphic-dropzone .upload-title'),
        subtitleElement: document.querySelector('#graphic-dropzone .upload-subtitle'),
        defaultTitle: 'Drop graphic here',
        actionsWrapper: document.getElementById('graphic-actions-wrapper'),
        actions: document.getElementById('graphic-actions'),
        transformsWrapper: document.getElementById('graphic-transforms-wrapper'),
        transforms: document.getElementById('graphic-transforms'),
        thumbFrame: document.getElementById('graphic-thumb-frame'),
        thumb: document.getElementById('graphic-thumb'),
        resetButton: document.getElementById('reset-graphic-tex'),
        clearButton: document.getElementById('clear-graphic'),
        scale: 1.0,
        panX: 0.0,
        panY: 0.0,
        rotation: 0.0,
        gizmoActive: false,
        uploadedTexture: null,
        uploadedFrontTex: null,
        uploadedBackTex: null,
        previewUrl: null,
        fileName: null
    }
};

export const uploadedGraphicsCache = {};

/**
 * Saves active graphic texture, preview URL, and 2D transform values to memory cache.
 */
export function saveCurrentGraphicToCache() {
    const key = getCurrentConfigKey();
    const config = sideConfigs.graphic;

    if (config.uploadedTexture) {
        uploadedGraphicsCache[key] = {
            uploadedTexture: config.uploadedTexture,
            uploadedFrontTex: config.uploadedFrontTex,
            uploadedBackTex: config.uploadedBackTex,
            previewUrl: config.previewUrl,
            fileName: config.fileName,
            scale: config.scale,
            panX: config.panX,
            panY: config.panY,
            rotation: config.rotation
        };
    } else {
        delete uploadedGraphicsCache[key];
    }
}

/**
 * Synchronizes the upload card UI, action buttons, and thumbnail visibility.
 * 
 * @param {string} side - Config side key (default: 'graphic').
 */
export function syncSideUi(side = 'graphic') {
    const config = sideConfigs[side];
    if (!config) return;
    const canInteract = state.ready && !state.modelFailed && !state.isExporting && !state.isInAR;
    const hasUpload = Boolean(config.uploadedTexture);

    if (config.input) config.input.disabled = !canInteract;
    if (config.resetButton) config.resetButton.disabled = !canInteract || !hasUpload;
    if (config.clearButton) {
        config.clearButton.disabled = !canInteract || !hasUpload;
        config.clearButton.hidden = !hasUpload;
        config.clearButton.classList.toggle('is-visible', hasUpload);
    }

    if (config.actionsWrapper) config.actionsWrapper.classList.toggle('is-visible', hasUpload);
    if (config.transformsWrapper) config.transformsWrapper.classList.toggle('is-visible', hasUpload);

    if (config.thumbFrame) {
        config.thumbFrame.hidden = !config.previewUrl;
        config.thumbFrame.classList.toggle('is-visible', hasUpload);
    }
    if (config.subtitleElement) config.subtitleElement.hidden = hasUpload;
    if (config.dropzone) {
        config.dropzone.classList.toggle('has-texture', hasUpload);
        config.dropzone.classList.toggle('is-disabled', !canInteract);
        config.dropzone.setAttribute('aria-disabled', String(!canInteract));
        config.dropzone.tabIndex = canInteract ? 0 : -1;
    }
    if (dom.btnToggleGizmo) {
        dom.btnToggleGizmo.disabled = !hasUpload;
    }
}

/**
 * Restores graphic texture and 2D transforms from cache if available for active configuration.
 */
export function loadGraphicFromCache() {
    const key = getCurrentConfigKey();
    const config = sideConfigs.graphic;
    const cached = uploadedGraphicsCache[key];

    if (cached) {
        config.uploadedTexture = cached.uploadedTexture;
        config.uploadedFrontTex = cached.uploadedFrontTex;
        config.uploadedBackTex = cached.uploadedBackTex;
        config.previewUrl = cached.previewUrl;
        config.fileName = cached.fileName;

        config.scale = cached.scale !== undefined ? Number(cached.scale) : 1.0;
        config.panX = cached.panX !== undefined ? Number(cached.panX) : 0.0;
        config.panY = cached.panY !== undefined ? Number(cached.panY) : 0.0;
        config.rotation = cached.rotation !== undefined ? Number(cached.rotation) : 0.0;
        if (config.thumb) config.thumb.src = cached.previewUrl;
        if (config.titleElement) {
            config.titleElement.textContent = cached.fileName;
            config.titleElement.title = cached.fileName;
        }
    } else {
        config.uploadedTexture = null;
        config.uploadedFrontTex = null;
        config.uploadedBackTex = null;
        config.previewUrl = null;
        config.fileName = null;

        config.scale = 1.0;
        config.panX = 0.0;
        config.panY = 0.0;
        config.rotation = 0.0;
        if (config.thumb) config.thumb.removeAttribute('src');
        if (config.titleElement) {
            config.titleElement.textContent = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('upload.title') : config.defaultTitle;
            config.titleElement.removeAttribute('title');
        }
    }

    syncSideUi('graphic');
}
