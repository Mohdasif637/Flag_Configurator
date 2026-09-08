import * as THREE from 'three';
import { Timer } from 'three';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { scene, sceneRoot, renderer, isSceneDirty, clearSceneDirty } from './scene.js';
import { camera, controls, controlsDirty, resetControlsDirty } from './camera.js';
import {
    turntableSpeed,
    turntableAccumulatedAngle,
    setTurntableAccumulatedAngle,
    turntableAutoStopEnabled,
    setTurntableAutoStop,
    syncTurntableButton,
    focusCameraView
} from './cameraTransitions.js';
import { state } from '../state/configState.js';
import { dom } from '../ui/domElements.js';
import { sideConfigs } from '../graphics/graphicConfig.js';
import { vatMaterials } from '../models/vatLoader.js';
import { updateARHitTesting } from '../features/arManager.js';
import { updateGizmoOverlay, isGizmoInteracting } from '../graphics/gizmo.js';
import { showToast, activeToasts } from '../ui/toast.js';

export const timer = new Timer();
export let isPlaying = true;
export let accumulatedTime = 0;
let lastRenderTime = performance.now();
let autoPauseTimeout = null;

/**
 * Toggles the flag cloth vertex animation playback.
 */
export function toggleAnimation() {
    if (dom.playPause && dom.playPause.disabled) return;

    isPlaying = !isPlaying;

    if (!isPlaying && state.turntableEnabled) {
        state.turntableEnabled = false;
        syncTurntableButton();
    }
    syncPlayPauseButton();
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
 * Starts turntable auto-rotation with automatic stop after full inspection cycle.
 */
export function startTurntableAutoStart() {
    state.turntableEnabled = true;
    setTurntableAutoStop(true);
    setTurntableAccumulatedAngle(0);
    syncTurntableButton();
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
            showToast('Flag Animation Paused', '', 'info', 3000);
        }
    }, 60000);
}

/**
 * Starts post-guide timers (turntable auto-start and VAT animation auto-pause).
 */
export function startPostGuideTimers() {
    if (state.turntableEnabled) {
        startTurntableAutoStart();
    }
    startVatAnimationTimer();
}

/**
 * Displays the WebXR AR supported toast notification if device is capable.
 */
export function showArSupportedToastIfSupported() {
    if (state.arSupported && !state.arSupportedToastShown) {
        const guideOverlay = document.getElementById('nav-coaching-overlay');
        const isGuideActiveOrPending = guideOverlay && !guideOverlay.hasAttribute('hidden');
        if (isGuideActiveOrPending) return;

        if (activeToasts.length > 0 || (dom.toastRegion && dom.toastRegion.children.length > 0)) {
            window.setTimeout(showArSupportedToastIfSupported, 100);
            return;
        }

        state.arSupportedToastShown = true;
        showToast('AR Supported', 'Ready for AR! Tap the green AR button on the right to place the flag in the real world.', 'success', 5000);
    }
}

/**
 * Main animation loop callback invoked by WebXR / requestAnimationFrame.
 * Performs updates to tweens, camera controls, VAT shader uniforms, turntable,
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
    const delta = timer.getDelta();

    if (state.turntableEnabled && !state.isInAR) {
        const step = turntableSpeed * delta;
        sceneRoot.rotation.y += step;

        if (turntableAutoStopEnabled) {
            const nextAngle = turntableAccumulatedAngle + Math.abs(step);
            setTurntableAccumulatedAngle(nextAngle);
            if (nextAngle >= Math.PI * 8) {
                state.turntableEnabled = false;
                syncTurntableButton();
                setTurntableAutoStop(false);

                const homeBtn = dom.cameraButtons.find(b => b.dataset.view === 'home');
                if (homeBtn) {
                    homeBtn.click();
                } else {
                    focusCameraView('home');
                }
            }
        }
    }

    if (isPlaying) {
        accumulatedTime += delta;
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

    const controlsChanged = controls.update() || controlsDirty;
    resetControlsDirty();

    const tweensActive = TWEEN.getAll().length > 0;
    const turntableActive = state.turntableEnabled && !state.isInAR;
    const flagActive = isPlaying;
    const arActive = state.isInAR;
    const gizmoActive = sideConfigs.graphic.gizmoActive && Boolean(sideConfigs.graphic.uploadedTexture);

    if (gizmoActive && !isGizmoInteracting()) {
        updateGizmoOverlay();
    }

    const needsRender = isSceneDirty() ||
                        controlsChanged ||
                        tweensActive ||
                        turntableActive ||
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
    renderer.setAnimationLoop(renderFrame);
}

/**
 * Stops the rendering loop.
 */
export function stopRenderLoop() {
    renderer.setAnimationLoop(null);
}
