import * as THREE from 'three';
import { scene, renderer, lightingGroup, markSceneDirty } from './scene.js';
import { environmentLoader } from '../models/loaders.js';
import { dom } from '../ui/domElements.js';
import { showToast } from '../ui/toast.js';
import { eventBus } from '../state/eventBus.js';
import { state } from '../state/configState.js';

export let environmentTexture = null;
let envPanelShouldBeOpen = false;
let envPanelHideTimer = null;

/**
 * Loads the HDR studio environment map and applies it to the scene.
 * @returns {Promise<THREE.Texture>}
 */
export function loadEnvironment() {
    return new Promise((resolve) => {
        environmentLoader.load(
            'assets/studio.hdr',
            (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                environmentTexture = texture;
                scene.environment = texture;
                state.environmentLoaded = true;
                state.environmentResolved = true;
                markSceneDirty();
                eventBus.emit('environment:loaded', texture);
                resolve(texture);
            },
            undefined,
            () => {
                state.environmentLoaded = false;
                state.environmentResolved = true;
                scene.environment = null;
                showToast('Environment unavailable', 'Studio lighting could not be loaded. Continuing with the default background.', 'error', 4500);
                eventBus.emit('environment:failed');
                resolve(null);
            }
        );
    });
}

/**
 * Checks whether the environment settings panel is currently open.
 * @returns {boolean}
 */
export function isEnvPanelOpen() {
    return dom.envPanel ? dom.envPanel.classList.contains('is-open') : false;
}

/**
 * Toggles the visibility of the environment settings panel.
 * @param {boolean} open
 */
export function setEnvPanelOpen(open) {
    if (!dom.envPanel || !dom.envToggle) return;
    envPanelShouldBeOpen = open;
    window.clearTimeout(envPanelHideTimer);
    dom.envToggle.classList.toggle('is-active', open);
    dom.envToggle.setAttribute('aria-expanded', open ? 'true' : 'false');

    if (dom.cameraWrapper) {
        if (open) {
            dom.cameraWrapper.classList.add('has-env-open');
        }
    }

    if (open) {
        dom.envPanel.hidden = false;
        window.requestAnimationFrame(() => {
            if (envPanelShouldBeOpen) dom.envPanel.classList.add('is-open');
        });
        return;
    }

    dom.envPanel.classList.remove('is-open');
    envPanelHideTimer = window.setTimeout(() => {
        if (!isEnvPanelOpen()) {
            dom.envPanel.hidden = true;
            if (dom.cameraWrapper) {
                dom.cameraWrapper.classList.remove('has-env-open');
            }
        }
    }, 200);
}
