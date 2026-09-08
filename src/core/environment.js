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
        } else {
            envPanelHideTimer = window.setTimeout(() => {
                if (!envPanelShouldBeOpen && dom.cameraWrapper) {
                    dom.cameraWrapper.classList.remove('has-env-open');
                }
            }, 200);
        }
    }

    dom.envPanel.classList.toggle('is-open', open);
}

/**
 * Initializes DOM listeners for environment exposure, rotation, and reset controls.
 */
export function initEnvironmentControls() {
    if (dom.envToggle) {
        dom.envToggle.addEventListener('click', () => {
            if (dom.envToggle.disabled) return;
            setEnvPanelOpen(!isEnvPanelOpen());
        });
    }

    document.addEventListener('click', (event) => {
        if (dom.cameraWrapper && !dom.cameraWrapper.contains(event.target) && isEnvPanelOpen()) {
            setEnvPanelOpen(false);
        }
    });

    if (dom.envExposure) {
        dom.envExposure.addEventListener('input', (event) => {
            renderer.toneMappingExposure = Number.parseFloat(event.target.value);
            markSceneDirty();
        });
    }

    if (dom.envRotate) {
        dom.envRotate.addEventListener('input', (event) => {
            if (!environmentTexture) return;
            const radians = Number.parseFloat(event.target.value);
            scene.environmentRotation.y = radians;
            lightingGroup.rotation.y = radians;
            markSceneDirty();
        });
    }

    if (dom.envReset) {
        dom.envReset.addEventListener('click', () => {
            if (dom.envExposure) dom.envExposure.value = '1';
            if (dom.envRotate) dom.envRotate.value = '0';
            renderer.toneMappingExposure = 1;
            scene.environmentRotation.y = 0;
            lightingGroup.rotation.y = 0;
            markSceneDirty();
        });
    }
}
