import * as THREE from 'three';
import { Timer } from 'three';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { scene, sceneRoot, renderer, isSceneDirty, clearSceneDirty, markSceneDirty } from './scene.js';
import { camera, controls, controlsDirty, resetControlsDirty, enforceCameraGroundBounds, getActiveCameraTween, setActiveCameraTween } from './camera.js';
import { state } from '../state/configState.js';
import { dom } from '../ui/domElements.js';
import { sideConfigs } from '../graphics/graphicConfig.js';
import { vatMaterials } from '../models/vatLoader.js';
import { updateARHitTesting } from '../features/arManager.js';
import { updateGizmoOverlay, isGizmoInteracting } from '../graphics/gizmo.js';

export const timer = new Timer();
export let isPlaying = true;
export let accumulatedTime = 0;
let lastRenderTime = performance.now();
let autoPauseTimeout = null;

export const INITIAL_ROTATION_SPEED = THREE.MathUtils.degToRad(26);
export const TOTAL_ROTATION_CYCLES = 5;
const TOTAL_ROTATION_ANGLE = Math.PI * 2 * TOTAL_ROTATION_CYCLES;

let initialRotationAngle = 0;
let initialRotationActive = false;
let initialRotationDone = false;

/**
 * Starts the 5-cycle continuous initial auto-rotation inspection.
 */
export function startInitialAutoRotation() {
    if (initialRotationDone || state.isInAR) return;

    const activeTween = getActiveCameraTween();
    if (activeTween) {
        activeTween.stop();
        setActiveCameraTween(null);
        controls.enabled = true;
    }

    timer.reset();
    lastRenderTime = performance.now();
    sceneRoot.rotation.y = 0;
    initialRotationActive = true;
    initialRotationAngle = 0;
    markSceneDirty();
}

/**
 * Immediately cancels and permanently stops the initial auto-rotation.
 */
export function stopInitialAutoRotation() {
    if (!initialRotationActive && initialRotationDone) return;
    initialRotationActive = false;
    initialRotationDone = true;
    markSceneDirty();
    if (isPlaying) {
        startVatAnimationTimer();
    }
}

export function isInitialRotationActive() {
    return initialRotationActive;
}

export function setAnimationPlaying(playing) {
    isPlaying = Boolean(playing);
    syncPlayPauseButton();
}

/**
 * Toggles the flag cloth vertex animation playback.
 */
export function toggleAnimation() {
    if (dom.playPause && dom.playPause.disabled) return;

    isPlaying = !isPlaying;
    if (isPlaying) {
        startVatAnimationTimer();
    } else {
        if (autoPauseTimeout) {
            window.clearTimeout(autoPauseTimeout);
            autoPauseTimeout = null;
        }
    }
    syncPlayPauseButton();
    markSceneDirty();
}

/**
 * Synchronizes the play/pause button state, CSS classes, and aria attributes.
 */
export function syncPlayPauseButton() {
    if (!dom.playPause) return;
    dom.playPause.classList.toggle('is-paused', !isPlaying);
    dom.playPause.classList.toggle('is-active', isPlaying);
    dom.playPause.title = isPlaying ? 'Pause Animation' : 'Play Animation';
    dom.playPause.setAttribute('aria-label', isPlaying ? 'Pause Animation' : 'Play Animation');
}

/**
 * Starts a 60-second auto-pause timer for the flag cloth animation to conserve device battery.
 */
export function startVatAnimationTimer() {
    if (autoPauseTimeout) window.clearTimeout(autoPauseTimeout);
    autoPauseTimeout = window.setTimeout(() => {
        if (isPlaying) {
            isPlaying = false;
            syncPlayPauseButton();
        }
    }, 60000);
}

/**
 * Starts initial auto-rotation inspection (flag animation is synchronized and pauses smoothly on the 5th rotation).
 */
export function startPostGuideTimers() {
    startInitialAutoRotation();
}

/**
 * Displays the WebXR AR supported toast notification if device is capable.
 * (Disabled per user request to avoid unnecessary notifications)
 */
export function showArSupportedToastIfSupported() {
    // Disabled: AR notification removed per user request
}

/**
 * Main animation loop callback invoked by WebXR / requestAnimationFrame.
 * Performs updates to tweens, camera controls, VAT shader uniforms, initial auto-rotation,
 * and executes conditional dirty rendering.
 * 
 * @param {number} _ - WebXR timestamp
 * @param {XRFrame} [frame] - Active WebXR frame for hit testing
 */
export function renderFrame(_, frame) {
    const now = performance.now();
    const targetFps = 60;
    const minFrameInterval = 1000 / targetFps;

    if (now - lastRenderTime < minFrameInterval - 1) {
        return;
    }
    lastRenderTime = now;

    TWEEN.update();

    if (state.isInAR) updateARHitTesting(frame);

    timer.update();
    const delta = Math.min(timer.getDelta(), 0.1);

    let animDelta = delta;

    if (initialRotationActive && !state.isInAR) {
        const remaining = TOTAL_ROTATION_ANGLE - initialRotationAngle;

        // Apply smooth deceleration in the final 60 degrees of the 5th rotation
        const easeOutThreshold = THREE.MathUtils.degToRad(60);
        let speed = INITIAL_ROTATION_SPEED;
        let animSpeedFactor = 1.0;

        if (remaining < easeOutThreshold) {
            const progress = Math.min(1.0, Math.max(0.0, remaining / easeOutThreshold));
            const smoothFactor = Math.sin(progress * (Math.PI / 2));
            const easeFactor = 0.12 + 0.88 * smoothFactor;
            speed = INITIAL_ROTATION_SPEED * easeFactor;
            animSpeedFactor = easeFactor;
        }

        const step = speed * delta;
        animDelta = delta * animSpeedFactor;

        if (remaining <= step) {
            sceneRoot.rotation.y = 0;
            initialRotationAngle = TOTAL_ROTATION_ANGLE;
            initialRotationActive = false;
            initialRotationDone = true;

            // Seamlessly conclude flag cloth animation at the end of the 5th rotation
            if (isPlaying) {
                isPlaying = false;
                syncPlayPauseButton();
            }
            markSceneDirty();
        } else {
            initialRotationAngle += step;
            sceneRoot.rotation.y += step;
        }
    }

    if (isPlaying) {
        accumulatedTime += animDelta;
    }

    vatMaterials.forEach((mat) => {
        if (mat.userData.shader) {
            mat.userData.shader.uniforms.uTime.value = accumulatedTime;
        }
        if (mat.userData.compiledShaders) {
            mat.userData.compiledShaders.forEach((shader) => {
                if (shader && shader.uniforms && shader.uniforms.uTime) {
                    shader.uniforms.uTime.value = accumulatedTime;
                }
            });
        }
    });

    enforceCameraGroundBounds();
    const controlsChanged = controls.update() || controlsDirty;
    enforceCameraGroundBounds();
    resetControlsDirty();

    const tweensActive = TWEEN.getAll().length > 0;
    const initialSpinActive = initialRotationActive && !state.isInAR;
    const flagActive = isPlaying;
    const arActive = state.isInAR;
    const gizmoActive = sideConfigs.graphic.gizmoActive && Boolean(sideConfigs.graphic.uploadedTexture);

    if (gizmoActive && !isGizmoInteracting()) {
        updateGizmoOverlay();
    }

    const needsRender = isSceneDirty() ||
                        controlsChanged ||
                        tweensActive ||
                        initialSpinActive ||
                        flagActive ||
                        arActive;

    if (needsRender && state.modelLoaded) {
        renderer.render(scene, camera);
        clearSceneDirty();
    }
}

/**
 * Starts the continuous rendering loop through Three.js WebXR animation loop.
 */
export function startRenderLoop() {
    lastRenderTime = performance.now();
    timer.reset();
    renderer.setAnimationLoop(renderFrame);
}

/**
 * Stops the rendering loop.
 */
export function stopRenderLoop() {
    renderer.setAnimationLoop(null);
}
