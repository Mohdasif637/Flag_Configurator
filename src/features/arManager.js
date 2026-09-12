import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { scene, sceneRoot, renderer, reticle, defaultBackground, markSceneDirty } from '../core/scene.js';
import { camera, controls, cameraHome, targetCenter, setActiveCameraView } from '../core/camera.js';
import { dom, mobileViewportMediaQuery } from '../ui/domElements.js';
import { state } from '../state/configState.js';
import { showToast } from '../ui/toast.js';
import { modelRoot, characterModel, showCharacter } from '../models/flagModel.js';
import { syncControlAvailability, handleResize } from '../ui/uiController.js';
import { stopInitialAutoRotation } from '../core/renderLoop.js';

let hitTestSource = null;
let hitTestSourceRequested = false;
let arButton = null;
let postArRestoreTimer = null;
let previewStateBeforeAR = null;

let arTouchStartX = 0;
let arTouchStartRotationY = 0;
let arIsDragging = false;
let arHasDragged = false;

const arButtonIconMarkup = `
    <img src="icons/ar.svg" alt="" aria-hidden="true" data-ar-icon="true" class="control-icon ar-icon">
    <span class="ar-badge-label">AR</span>
`;

let arDisabledFallback = null;

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
                syncARVisibility();
            } else {
                markARUnsupported();
            }
        })
        .catch(() => markARUnsupported());
}

export function syncARButtonLabel() {
    if (state.arUnsupported || !arButton || !arButton.isConnected) return;
    if (!arButton.querySelector('[data-ar-icon="true"]')) arButton.innerHTML = arButtonIconMarkup;
    const label = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('ar.start') : 'Start AR';
    arButton.setAttribute('aria-label', label);
    arButton.title = label;
}

export function ensureArDisabledFallback() {
    if (arDisabledFallback?.isConnected) return;

    arDisabledFallback = document.createElement('button');
    arDisabledFallback.type = 'button';
    arDisabledFallback.id = 'ARButton';
    arDisabledFallback.className = 'is-ar-disabled';
    arDisabledFallback.innerHTML = arButtonIconMarkup;
    const labelVal = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('ar.unavailable_label') : 'AR preview unavailable on this device';
    const titleVal = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('ar.unavailable_title') : 'AR preview unavailable';
    arDisabledFallback.setAttribute('aria-label', labelVal);
    arDisabledFallback.title = titleVal;
    arDisabledFallback.addEventListener('click', (event) => {
        event.preventDefault();
        showToast('AR unavailable', 'This device or browser does not support AR preview.', 'info', 3600);
    });
    dom.arContainer.appendChild(arDisabledFallback);
}

export function syncARVisibility() {
    if (!dom.arContainer) return;
    const showContainer = state.ready && state.arSupportResolved;
    dom.arContainer.hidden = !showContainer;
    if (!showContainer) return;

    if (state.arUnsupported) {
        if (arButton && arButton.isConnected) arButton.remove();
        ensureArDisabledFallback();
        return;
    }

    if (arDisabledFallback?.isConnected) {
        arDisabledFallback.remove();
        arDisabledFallback = null;
    }

    if (arButton && !arButton.isConnected) dom.arContainer.appendChild(arButton);

    if (arButton) {
        arButton.hidden = false;
        arButton.disabled = state.modelFailed || state.isExporting || state.isInAR;
        syncARButtonLabel();
    }
}

function setupARButton() {
    if (!dom.arContainer) return;

    arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: dom.arOverlay }
    });

    arButton.id = 'ARButton';
    arButton.hidden = true;
    dom.arContainer.hidden = true;
    dom.arContainer.appendChild(arButton);
    syncARButtonLabel();

    const arButtonLabelObserver = new MutationObserver(syncARButtonLabel);
    arButtonLabelObserver.observe(arButton, { childList: true, characterData: true, subtree: true });

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
    syncARVisibility();
}

export function capturePreviewState() {
    const activeViewButton = dom.cameraButtons.find((button) => button.classList.contains('is-active'));
    return {
        activeView: activeViewButton?.dataset.view ?? null,
        cameraPosition: camera.position.clone(),
        cameraQuaternion: camera.quaternion.clone(),
        cameraZoom: camera.zoom,
        cameraFov: camera.fov,
        cameraNear: camera.near,
        cameraFar: camera.far,
        controlsTarget: controls.target.clone(),
        sceneRootPosition: sceneRoot.position.clone(),
        sceneRootRotation: sceneRoot.rotation.clone()
    };
}

export function restorePreviewState(previewState = null) {
    const snapshot = previewState ?? {
        activeView: 'home',
        cameraPosition: cameraHome.clone(),
        cameraQuaternion: new THREE.Quaternion(),
        cameraZoom: 1,
        cameraFov: 45,
        cameraNear: 0.1,
        cameraFar: 100,
        controlsTarget: targetCenter.clone(),
        sceneRootPosition: new THREE.Vector3(),
        sceneRootRotation: new THREE.Euler()
    };

    TWEEN.removeAll();
    controls.enabled = true;
    sceneRoot.visible = true;
    sceneRoot.position.copy(snapshot.sceneRootPosition);
    sceneRoot.rotation.copy(snapshot.sceneRootRotation);
    camera.position.copy(snapshot.cameraPosition);
    camera.quaternion.copy(snapshot.cameraQuaternion);
    camera.zoom = snapshot.cameraZoom;
    camera.fov = snapshot.cameraFov;
    camera.near = snapshot.cameraNear;
    camera.far = snapshot.cameraFar;
    camera.updateProjectionMatrix();
    controls.target.copy(snapshot.controlsTarget);
    controls.update();
    controls.saveState();
    setActiveCameraView(snapshot.activeView);
}

function schedulePostARRestore() {
    const restorePreview = () => {
        handleResize();
        restorePreviewState(previewStateBeforeAR);
    };

    window.clearTimeout(postArRestoreTimer);
    restorePreview();

    window.requestAnimationFrame(() => {
        restorePreview();
        postArRestoreTimer = window.setTimeout(() => restorePreview(), mobileViewportMediaQuery.matches ? 320 : 140);
    });
}

function onARSessionStart() {
    state.isInAR = true;
    document.body.classList.add('is-in-ar');
    controls.enabled = false;
    reticle.visible = false;
    stopInitialAutoRotation();
    window.clearTimeout(postArRestoreTimer);
    previewStateBeforeAR = capturePreviewState();

    scene.background = null;
    if (modelRoot) sceneRoot.visible = false;
    if (characterModel) characterModel.visible = false;

    syncControlAvailability();

    const coachingOverlay = document.getElementById('ar-coaching-overlay');
    if (coachingOverlay) {
        coachingOverlay.classList.add('is-visible');
    }
}

function onARSessionEnd() {
    state.isInAR = false;
    document.body.classList.remove('is-in-ar');
    controls.enabled = true;
    reticle.visible = false;
    resetHitTestState();

    scene.background = defaultBackground;

    const coachingOverlay = document.getElementById('ar-coaching-overlay');
    if (coachingOverlay) {
        coachingOverlay.classList.remove('is-visible');
    }

    if (characterModel) characterModel.visible = showCharacter;

    schedulePostARRestore();
    syncControlAvailability();
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
}
