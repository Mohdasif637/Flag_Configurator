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
import { modelRoot, characterModel } from '../models/flagModel.js';

export const camera = new THREE.PerspectiveCamera(45, getViewportAspect(dom.canvasContainer), 0.1, 100);

export const targetCenter = new THREE.Vector3(0, 1.8, 0);
export const cameraHome = new THREE.Vector3(2, 2, 6);
export let cameraDistance = 5.5;

export function setCameraDistance(dist) {
    cameraDistance = dist;
}

export const cameraTargets = {
    home: cameraHome.clone(),
    front: new THREE.Vector3(0, targetCenter.y, cameraDistance),
    back: new THREE.Vector3(0, targetCenter.y, -cameraDistance),
    left: new THREE.Vector3(-cameraDistance, targetCenter.y, 0),
    right: new THREE.Vector3(cameraDistance, targetCenter.y, 0)
};

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN
};
controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI - 0.05;
controls.target.copy(targetCenter);
camera.position.copy(cameraHome);
controls.update();
controls.saveState();

export let controlsDirty = false;
controls.addEventListener('change', () => {
    controlsDirty = true;
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

    const isMobile = mobileViewportMediaQuery.matches || window.innerWidth <= 768;
    const isMidRange = !isMobile && window.innerWidth >= 769 && window.innerWidth <= 1100;
    const shiftX = isMidRange ? 250 : 0;

    camera.aspect = width / Math.max(height, 1);
    if (!state.isInAR) {
        if (isMobile) {
            const xOffset = Math.round(width * 0.10);
            camera.setViewOffset(width, height, xOffset, 0, width, height);
        } else if (shiftX > 0) {
            camera.setViewOffset(width, height, -shiftX / 2.5, 0, width, height);
        } else {
            camera.clearViewOffset();
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
    if (event.target && event.target.closest('#gizmo-floating-bar')) return;
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
    const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const zoomDistance = 1.5;
    const endCameraPosition = hitPoint.clone().add(direction.multiplyScalar(zoomDistance));

    const startTarget = controls.target.clone();
    const startCameraPosition = camera.position.clone();

    activeCameraTween = new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, 600)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);
            camera.position.lerpVectors(startCameraPosition, endCameraPosition, progress);
        })
        .onComplete(() => {
            activeCameraTween = null;
            controls.enabled = true;
            controls.enableRotate = !sideConfigs.graphic.gizmoActive;
            controls.update();
        })
        .start();

    setActiveCameraView(null);
    state.turntableEnabled = false;
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
        })
        .onComplete(() => {
            setActiveCameraView(preZoomState.activeView);
            activeCameraTween = null;
            controls.enabled = true;
            controls.enableRotate = !sideConfigs.graphic.gizmoActive;
            controls.update();
        })
        .start();
}

/**
 * Initializes camera control listeners and double-tap zoom detection.
 */
export function initCameraControls() {
    if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('pointerdown', handleDoubleTapZoom);
    }

    const onUserAdjust = () => {
        if (state.isInAR || !state.ready || state.isExporting) return;
        setActiveCameraView(null);
        cancelCameraSequence();
    };
    controls.addEventListener('start', onUserAdjust);
    if (dom.canvasContainer) {
        dom.canvasContainer.addEventListener('wheel', onUserAdjust, { passive: true });
    }
}
