import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { scene, sceneRoot, renderer, reticle, markSceneDirty } from '../core/scene.js';
import { camera, controls } from '../core/camera.js';
import { dom, mobileViewportMediaQuery } from '../ui/domElements.js';
import { state } from '../state/configState.js';
import { showToast } from '../ui/toast.js';

let hitTestSource = null;
let hitTestSourceRequested = false;
let arButton = null;
let postArRestoreTimer = null;
let previewStateBeforeAR = null;

let arTouchStartX = 0;
let arTouchStartRotationY = 0;
let arIsDragging = false;
let arHasDragged = false;

/**
 * Initializes WebXR AR support detection and ARButton creation.
 */
export function initializeARSupport() {
    if (!navigator.xr) {
        markARUnsupported();
        return;
    }

    navigator.xr.isSessionSupported('immersive-ar')
        .then((supported) => {
            state.arSupportResolved = true;
            if (supported) {
                state.arSupported = true;
                setupARButton();
            } else {
                markARUnsupported();
            }
        })
        .catch(() => markARUnsupported());
}

function setupARButton() {
    if (!dom.arContainer) return;

    arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
    });

    arButton.id = 'ARButton';
    dom.arContainer.appendChild(arButton);
    dom.arContainer.hidden = false;

    if (dom.stopArBtn) {
        dom.stopArBtn.addEventListener('click', () => {
            const session = renderer.xr.getSession();
            if (session) session.end();
        });
    }

    renderer.xr.addEventListener('sessionstart', onARSessionStart);
    renderer.xr.addEventListener('sessionend', onARSessionEnd);

    const arController = renderer.xr.getController(0);
    arController.addEventListener('select', placeModelFromReticle);
    scene.add(arController);

    // Bind drag-to-rotate in AR
    window.addEventListener('touchstart', (e) => {
        if (!state.isInAR || !sceneRoot.visible || e.touches.length !== 1) return;
        arTouchStartX = e.touches[0].clientX;
        arTouchStartRotationY = sceneRoot.rotation.y;
        arIsDragging = true;
        arHasDragged = false;
    });

    window.addEventListener('touchmove', (e) => {
        if (!arIsDragging || !state.isInAR || !sceneRoot.visible || e.touches.length !== 1) return;
        const deltaX = e.touches[0].clientX - arTouchStartX;
        if (Math.abs(deltaX) > 8) arHasDragged = true;
        sceneRoot.rotation.y = arTouchStartRotationY + (deltaX * 0.015);
    });

    window.addEventListener('touchend', () => arIsDragging = false);
    window.addEventListener('touchcancel', () => arIsDragging = false);
}

function markARUnsupported() {
    state.arUnsupported = true;
    state.arSupportResolved = true;
    state.arSupported = false;
    if (dom.arContainer) dom.arContainer.hidden = true;
}

function onARSessionStart() {
    state.isInAR = true;
    document.body.classList.add('is-in-ar');
    controls.enabled = false;
    reticle.visible = false;
    window.clearTimeout(postArRestoreTimer);

    sceneRoot.visible = false;

    const coachingOverlay = document.getElementById('ar-coaching-overlay');
    if (coachingOverlay) {
        coachingOverlay.classList.add('is-visible');
    }

    showToast('AR mode active', 'Move your device to find a surface, then tap to place. Drag to rotate.', 'info', 10000);
}

function onARSessionEnd() {
    state.isInAR = false;
    document.body.classList.remove('is-in-ar');
    controls.enabled = true;
    reticle.visible = false;
    resetHitTestState();

    const coachingOverlay = document.getElementById('ar-coaching-overlay');
    if (coachingOverlay) {
        coachingOverlay.classList.remove('is-visible');
    }

    sceneRoot.visible = true;
    markSceneDirty();
}

function resetHitTestState() {
    if (hitTestSource) {
        hitTestSource.cancel();
        hitTestSource = null;
    }
    hitTestSourceRequested = false;
}

/**
 * Updates surface hit-testing using WebXR frame data and positions the reticle.
 * 
 * @param {XRFrame} frame - WebXR animation frame.
 */
export function updateARHitTesting(frame) {
    const session = renderer.xr.getSession();
    if (!session || !frame) return;

    if (!hitTestSourceRequested) {
        session.requestReferenceSpace('viewer')
            .then((referenceSpace) => session.requestHitTestSource({ space: referenceSpace }))
            .then((source) => { hitTestSource = source; })
            .catch(() => showToast('AR placement unavailable', 'Hit testing could not be started for this session.', 'error', 4200));

        session.addEventListener('end', resetHitTestState, { once: true });
        hitTestSourceRequested = true;
    }

    if (!hitTestSource) return;

    const referenceSpace = renderer.xr.getReferenceSpace();
    const hitTestResults = frame.getHitTestResults(hitTestSource);
    const coachingOverlay = document.getElementById('ar-coaching-overlay');

    if (hitTestResults.length === 0) {
        reticle.visible = false;
        if (coachingOverlay && sceneRoot && !sceneRoot.visible) {
            coachingOverlay.classList.add('is-visible');
        }
        return;
    }

    const pose = hitTestResults[0].getPose(referenceSpace);
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);

    if (coachingOverlay) {
        coachingOverlay.classList.remove('is-visible');
    }
}

function placeModelFromReticle() {
    if (!state.isInAR || !reticle.visible || arHasDragged) return;

    const placementPosition = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
    sceneRoot.position.copy(placementPosition);
    sceneRoot.visible = true;

    const coachingOverlay = document.getElementById('ar-coaching-overlay');
    if (coachingOverlay) {
        coachingOverlay.classList.remove('is-visible');
    }

    const xrCamera = renderer.xr.getCamera(camera);
    const cameraPosition = new THREE.Vector3();
    xrCamera.getWorldPosition(cameraPosition);

    const lookDirection = new THREE.Vector3().subVectors(cameraPosition, placementPosition);
    sceneRoot.rotation.set(0, Math.atan2(lookDirection.x, lookDirection.z), 0);

    showToast('Object placed', 'Tap again on another surface if you want to reposition the flag.', 'success', 3200);
}
