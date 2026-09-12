import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { dom, mobileViewportMediaQuery } from '../ui/domElements.js';
import { getViewportAspect } from '../utils/mathUtils.js';
import { state } from '../state/configState.js';
import { sideConfigs } from '../graphics/graphicConfig.js';
import { renderer } from './scene.js';
import { eventBus } from '../state/eventBus.js';
import { cancelCameraSequence } from './cameraTransitions.js';
import { stopInitialAutoRotation } from './renderLoop.js';
import { modelRoot, characterModel } from '../models/flagModel.js';

export const camera = new THREE.PerspectiveCamera(45, getViewportAspect(dom.canvasContainer), 0.1, 100);

export const targetCenter = new THREE.Vector3(0, 1.8, 0);
export const cameraHome = new THREE.Vector3(2, 2, 6);
export let cameraDistance = 5.5;

export function setCameraDistance(dist) {
    cameraDistance = dist;
    if (controls) {
        controls.maxDistance = Math.max(6.5, Math.min(10.5, dist * 1.45));
    }
}

export const cameraTargets = {
    home: cameraHome.clone(),
    front: new THREE.Vector3(0, targetCenter.y, cameraDistance),
    back: new THREE.Vector3(0, targetCenter.y, -cameraDistance),
    left: new THREE.Vector3(-cameraDistance, targetCenter.y, 0),
    right: new THREE.Vector3(cameraDistance, targetCenter.y, 0)
};

export const controls = new OrbitControls(camera, dom.canvasContainer);
controls.enableDamping = true;
controls.zoomToCursor = true;
controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN
};
export const MIN_GROUND_Y = 0.08;
export const MIN_TARGET_Y = 0.1;
export const MAX_TARGET_Y = 5.0;
export const MAX_PAN_XZ = 3.5;

/**
 * Enforces orbit rotation and pan bounds to prevent viewing the model from underneath the ground plane.
 */
export function enforceCameraGroundBounds() {
    if (!controls) return;

    // 1. Constrain pan target so focus point never sinks underground or flies too high
    if (controls.target.y < MIN_TARGET_Y) {
        const delta = MIN_TARGET_Y - controls.target.y;
        controls.target.y = MIN_TARGET_Y;
        camera.position.y += delta;
    } else if (controls.target.y > MAX_TARGET_Y) {
        const delta = MAX_TARGET_Y - controls.target.y;
        controls.target.y = MAX_TARGET_Y;
        camera.position.y += delta;
    }

    // Keep horizontal pan within reasonable bounds around the flag
    controls.target.x = Math.max(-MAX_PAN_XZ, Math.min(MAX_PAN_XZ, controls.target.x));
    controls.target.z = Math.max(-MAX_PAN_XZ, Math.min(MAX_PAN_XZ, controls.target.z));

    // 2. Compute dynamic maxPolarAngle to stop orbit rotation when camera reaches ground level
    const dist = camera.position.distanceTo(controls.target);
    if (dist > 0.001) {
        const ratio = Math.max(-0.999, Math.min(0.999, (MIN_GROUND_Y - controls.target.y) / dist));
        controls.maxPolarAngle = Math.min(Math.PI - 0.05, Math.acos(ratio));
    }

    // 3. Absolute ground collision clamp: camera eye can never penetrate the ground plane
    if (camera.position.y < MIN_GROUND_Y) {
        camera.position.y = MIN_GROUND_Y;
    }
}

controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI / 2;
controls.minDistance = 1.6;
controls.maxDistance = 8.5;
controls.target.copy(targetCenter);
camera.position.copy(cameraHome);
enforceCameraGroundBounds();
controls.update();
controls.saveState();

export let controlsDirty = false;
controls.addEventListener('change', () => {
    controlsDirty = true;
    enforceCameraGroundBounds();
});

export function resetControlsDirty() {
    controlsDirty = false;
}

/**
 * Updates camera viewport offset and aspect ratio according to mobile/desktop layouts.
 */
export function updateCameraViewportOffset() {
    const width = dom.canvasContainer ? dom.canvasContainer.clientWidth : window.innerWidth;
    const height = dom.canvasContainer ? dom.canvasContainer.clientHeight : window.innerHeight;

    const isLandscape = window.innerWidth > window.innerHeight;
    const isMobilePortrait = (mobileViewportMediaQuery.matches || window.innerWidth <= 768) && !isLandscape;

    camera.aspect = width / Math.max(height, 1);
    if (!state.isInAR) {
        if (isMobilePortrait) {
            const xOffset = Math.round(width * 0.10);
            camera.setViewOffset(width, height, xOffset, 0, width, height);
        } else {
            const panelEl = document.getElementById('ui-container');
            const panelWidth = panelEl ? panelEl.offsetWidth : Math.min(340, width - 40);
            camera.setViewOffset(width, height, Math.round(panelWidth / 2.2), 0, width, height);
        }
    } else {
        camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
}

let lastTapTime = 0;
export let isZoomedIn = false;
export let preZoomState = null;
const raycaster = new THREE.Raycaster();
const raycastPointer = new THREE.Vector2();
let activeCameraTween = null;

export function getActiveCameraTween() {
    return activeCameraTween;
}

export function setActiveCameraTween(tween) {
    activeCameraTween = tween;
}

/**
 * Sets the visual active button in the camera controls toolbar.
 * @param {string|null} view - Name of active view (e.g. 'home', 'front').
 */
export function setActiveCameraView(view) {
    dom.cameraButtons.forEach((button) => {
        const matches = view != null && button.dataset.view === view;
        button.classList.toggle('is-active', matches);
    });
}

/**
 * Handles double-tap and double-click to smoothly zoom into clicked 3D flag regions.
 * @param {PointerEvent} event
 */
export function handleDoubleTapZoom(event) {
    if (state.isInAR || !state.ready || state.isExporting) return;
    if (event.target && event.target.closest('#gizmo-floating-bar, #moveable-proxy-target, .moveable-control-box')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!event.isPrimary) return;

    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;

    if (tapLength < 300 && tapLength > 0) {
        event.preventDefault();

        if (isZoomedIn) {
            zoomOutSmoothly();
        } else {
            const canvas = renderer.domElement;
            const rect = canvas.getBoundingClientRect();
            let clientX = event.clientX;
            let clientY = event.clientY;

            raycastPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            raycastPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(raycastPointer, camera);
            const targets = [];
            const root = modelRoot || window.__FLAG_MODEL_ROOT__;
            const charModel = characterModel || window.__CHARACTER_MODEL__;

            if (root) targets.push(root);
            if (charModel && charModel.visible) targets.push(charModel);

            const intersects = raycaster.intersectObjects(targets, true);
            let hitPoint = null;

            if (intersects.length > 0) {
                hitPoint = intersects[0].point;
            } else {
                let closestDist = Infinity;
                targets.forEach(target => {
                    const box = new THREE.Box3().setFromObject(target);
                    if (!box.isEmpty()) {
                        box.expandByScalar(0.2);
                        const intersectTarget = new THREE.Vector3();
                        if (raycaster.ray.intersectBox(box, intersectTarget)) {
                            const dist = raycaster.ray.origin.distanceTo(intersectTarget);
                            if (dist < closestDist) {
                                closestDist = dist;
                                hitPoint = intersectTarget.clone();
                            }
                        }
                    }
                });
            }

            if (hitPoint) {
                zoomInSmoothly(hitPoint);
            }
            eventBus.emit('camera:doubleTap');
        }
        lastTapTime = 0;
    } else {
        lastTapTime = currentTime;
    }
}

export function zoomInSmoothly(hitPoint) {
    isZoomedIn = true;

    if (activeCameraTween) {
        activeCameraTween.stop();
        activeCameraTween = null;
        controls.enabled = true;
    }

    controls.enabled = false;

    preZoomState = {
        cameraPosition: camera.position.clone(),
        controlsTarget: controls.target.clone(),
        activeView: dom.cameraButtons.find(b => b.classList.contains('is-active'))?.dataset.view
    };

    const endTarget = hitPoint.clone();
    endTarget.y = Math.max(MIN_TARGET_Y, Math.min(MAX_TARGET_Y, endTarget.y));
    endTarget.x = Math.max(-MAX_PAN_XZ, Math.min(MAX_PAN_XZ, endTarget.x));
    endTarget.z = Math.max(-MAX_PAN_XZ, Math.min(MAX_PAN_XZ, endTarget.z));

    const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const zoomDistance = 1.6;
    const endCameraPosition = hitPoint.clone().add(direction.multiplyScalar(zoomDistance));
    endCameraPosition.y = Math.max(MIN_GROUND_Y, endCameraPosition.y);

    const startTarget = controls.target.clone();
    const startCameraPosition = camera.position.clone();

    activeCameraTween = new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, 600)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);
            camera.position.lerpVectors(startCameraPosition, endCameraPosition, progress);
            enforceCameraGroundBounds();
        })
        .onComplete(() => {
            activeCameraTween = null;
            controls.enabled = true;
            controls.enableRotate = !sideConfigs.graphic.gizmoActive;
            enforceCameraGroundBounds();
            controls.update();
        })
        .start();

    setActiveCameraView(null);
    stopInitialAutoRotation();
}

export function zoomOutSmoothly() {
    isZoomedIn = false;
    if (!preZoomState) return;

    if (activeCameraTween) {
        activeCameraTween.stop();
        activeCameraTween = null;
        controls.enabled = true;
    }

    controls.enabled = false;

    const endTarget = preZoomState.controlsTarget;
    const endCameraPosition = preZoomState.cameraPosition;
    const startTarget = controls.target.clone();
    const startCameraPosition = camera.position.clone();

    activeCameraTween = new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, 600)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);
            camera.position.lerpVectors(startCameraPosition, endCameraPosition, progress);
            enforceCameraGroundBounds();
        })
        .onComplete(() => {
            setActiveCameraView(preZoomState.activeView);
            activeCameraTween = null;
            controls.enabled = true;
            controls.enableRotate = !sideConfigs.graphic.gizmoActive;
            enforceCameraGroundBounds();
            controls.update();
        })
        .start();
}

/**
 * Initializes camera control listeners and double-tap zoom detection.
 */
export function initCameraControls() {
    if (dom.canvasContainer) {
        dom.canvasContainer.addEventListener('pointerdown', handleDoubleTapZoom);
    }

    const onUserAdjust = () => {
        if (state.isInAR || !state.ready || state.isExporting) return;
        setActiveCameraView(null);
        cancelCameraSequence();
        stopInitialAutoRotation();
    };
    controls.addEventListener('start', onUserAdjust);
    if (dom.canvasContainer) {
        dom.canvasContainer.addEventListener('wheel', onUserAdjust, { passive: true });
        dom.canvasContainer.addEventListener('pointerdown', () => stopInitialAutoRotation(), { passive: true });
    }
}
