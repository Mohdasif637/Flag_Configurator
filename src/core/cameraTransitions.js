import * as THREE from 'three';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { scene, sceneRoot, shadowCatcher, reticle, markSceneDirty } from './scene.js';
import { camera, controls, targetCenter, cameraTargets, cameraDistance, setCameraDistance, setActiveCameraView, getActiveCameraTween, setActiveCameraTween, enforceCameraGroundBounds } from './camera.js';
import { dom, mobileViewportMediaQuery } from '../ui/domElements.js';
import { configState, state } from '../state/configState.js';
import { sideConfigs } from '../graphics/graphicConfig.js';
import { getNormalizedRotationAngle } from '../utils/mathUtils.js';
import { modelRoot, characterModel, showCharacter } from '../models/flagModel.js';

export let currentCameraSequenceId = 0;

export function cancelCameraSequence() {
    currentCameraSequenceId++;
}

export const turntableSpeed = THREE.MathUtils.degToRad(26);
export let turntableAccumulatedAngle = 0;
export let turntableAutoStopEnabled = true;

export function setTurntableAccumulatedAngle(val) {
    turntableAccumulatedAngle = val;
}

export function setTurntableAutoStop(val) {
    turntableAutoStopEnabled = val;
}


export function syncTurntableButton() {
    if (dom.turntableToggle) {
        dom.turntableToggle.classList.toggle('is-active', state.turntableEnabled);
        dom.turntableToggle.setAttribute('aria-pressed', String(state.turntableEnabled));
        dom.turntableToggle.title = state.turntableEnabled ? 'Stop Turntable' : 'Start Turntable';
    }
}

export function stopTurntableRotation() {
    if (!state.turntableEnabled) return;
    state.turntableEnabled = false;
    turntableAutoStopEnabled = false;
    syncTurntableButton();
}

export function toggleTurntable() {
    if (dom.turntableToggle && dom.turntableToggle.disabled) return;
    state.turntableEnabled = !state.turntableEnabled;
    turntableAutoStopEnabled = false;
    syncTurntableButton();
}

/**
 * Recalculates dynamic framing bounding box around active flag and reference models
 * so camera distances adapt seamlessly between XS, S, M, L flags.
 * 
 * @param {boolean} [moveCamera=true] - Whether to immediately focus active view onto new targets.
 */
export function updateDynamicCameraTargets(moveCamera = true) {
    const root = modelRoot || window.__FLAG_MODEL_ROOT__;
    if (!root) return;

    const transformsToRestore = [];
    const saveAndNormalize = (obj) => {
        if (!obj) return;
        transformsToRestore.push({
            obj: obj,
            scale: obj.scale.clone(),
            rotation: obj.rotation.clone()
        });
        obj.scale.setScalar(1);
        obj.rotation.set(0, 0, 0);
        obj.updateMatrixWorld(true);
    };

    saveAndNormalize(root);

    const charModel = characterModel || window.__CHARACTER_MODEL__;
    const isCharVisible = (typeof showCharacter === 'boolean') ? showCharacter : Boolean(window.__SHOW_CHARACTER__);
    if (charModel && isCharVisible) {
        saveAndNormalize(charModel);
    }

    const currentSceneRotation = sceneRoot.rotation.clone();
    sceneRoot.rotation.set(0, 0, 0);
    sceneRoot.updateMatrixWorld(true);

    const box = new THREE.Box3();
    let hasVisibleMesh = false;

    scene.traverse((child) => {
        if (child.isMesh) {
            if (child === shadowCatcher || (child.name && child.name.includes('shadowCatcher'))) return;
            if (child === reticle || (child.name && child.name.includes('reticle'))) return;
            if (child.type && child.type.includes('Helper')) return;

            let isVisible = true;
            let current = child;
            while (current) {
                if (current.name && (current.name.includes('flag-measurement') || current.name.includes('height-measurement') || current.name.includes('character-silhouette'))) {
                    isVisible = false;
                    break;
                }
                if (current === characterModel) {
                    if (!showCharacter) {
                        isVisible = false;
                        break;
                    }
                } else if (!current.visible) {
                    isVisible = false;
                    break;
                }
                current = current.parent;
            }

            if (isVisible && child.geometry) {
                if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
                if (child.geometry.boundingBox) {
                    const childBox = child.geometry.boundingBox.clone();
                    childBox.applyMatrix4(child.matrixWorld);
                    box.expandByPoint(childBox.min);
                    box.expandByPoint(childBox.max);
                    hasVisibleMesh = true;
                }
            }
        }
    });

    transformsToRestore.forEach((t) => {
        t.obj.scale.copy(t.scale);
        t.obj.rotation.copy(t.rotation);
        t.obj.updateMatrixWorld(true);
    });

    sceneRoot.rotation.copy(currentSceneRotation);
    sceneRoot.updateMatrixWorld(true);

    if (showCharacter) {
        box.expandByPoint(new THREE.Vector3(-1.68, 0, -0.2));
        box.expandByPoint(new THREE.Vector3(-1.68, 1.95, 0.2));
        box.expandByPoint(new THREE.Vector3(-0.60, 0, -0.2));
        box.expandByPoint(new THREE.Vector3(-0.60, 1.95, 0.2));
        hasVisibleMesh = true;
    }

    if (hasVisibleMesh && !box.isEmpty()) {
        box.expandByPoint(new THREE.Vector3(box.max.x + 0.10, box.max.y + 0.10, box.max.z + 0.10));
        box.expandByPoint(new THREE.Vector3(box.min.x - 0.05, Math.max(0, box.min.y - 0.05), box.min.z - 0.10));

        box.getCenter(targetCenter);
        const size = box.getSize(new THREE.Vector3());

        const fovRad = camera.fov * (Math.PI / 180);
        const aspect = Math.max(camera.aspect, 0.1);
        const tanVFovHalf = Math.tan(fovRad / 2);
        const tanHFovHalf = tanVFovHalf * aspect;

        const dxLeft = Math.max(targetCenter.x - box.min.x, 0.1);
        const dxRight = Math.max(box.max.x - targetCenter.x, 0.1);
        const dyTop = Math.max(box.max.y - targetCenter.y, 0.1);
        const dyBottom = Math.max(targetCenter.y - box.min.y, 0.1);

        const isMobile = mobileViewportMediaQuery.matches;
        const horizFrac = isMobile ? 0.78 : 0.92;
        const maxHalfHoriz = Math.max(dxLeft, dxRight, size.z / 2);

        const dHorizontal = maxHalfHoriz / (tanHFovHalf * horizFrac);
        const dVertical = Math.max(dyTop, dyBottom) / (tanVFovHalf * 0.95);

        let fitDistance = Math.max(dHorizontal, dVertical);
        const marginFactor = 1.18;
        const calculatedDistance = fitDistance * marginFactor;
        setCameraDistance(calculatedDistance);

        cameraTargets.home.set(targetCenter.x + calculatedDistance * 0.3, targetCenter.y + size.y * 0.2, targetCenter.z + calculatedDistance);
        cameraTargets.front.set(targetCenter.x, targetCenter.y, targetCenter.z + calculatedDistance);
        cameraTargets.back.set(targetCenter.x, targetCenter.y, targetCenter.z - calculatedDistance);
        cameraTargets.left.set(targetCenter.x - calculatedDistance, targetCenter.y, targetCenter.z);
        cameraTargets.right.set(targetCenter.x + calculatedDistance, targetCenter.y, targetCenter.z);

        if (moveCamera) {
            controls.target.copy(targetCenter);
            controls.update();

            const activeView = dom.cameraButtons.find(b => b.classList.contains('is-active'))?.dataset.view;
            if (activeView) {
                focusCameraView(activeView);
            }
        }
    }
}

/**
 * Transitions camera position and orbit target using cubic easing.
 * 
 * @param {THREE.Vector3} targetPosition
 * @param {number} [duration=800]
 */
export function transitionCamera(targetPosition, duration = 800) {
    if (state.isInAR) return;
    const activeCameraTween = getActiveCameraTween();
    if (activeCameraTween) {
        activeCameraTween.stop();
        setActiveCameraTween(null);
        controls.enabled = true;
        controls.enableRotate = !sideConfigs.graphic.gizmoActive;
    }

    controls.enabled = false;

    const endPosition = targetPosition.clone();
    const startTarget = controls.target.clone();
    const endTarget = targetCenter.clone();
    const startSpherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(startTarget));
    const endSpherical = new THREE.Spherical().setFromVector3(endPosition.clone().sub(endTarget));
    const startRotationY = getNormalizedRotationAngle(sceneRoot.rotation.y);
    const endRotationY = 0;

    sceneRoot.rotation.y = startRotationY;

    while (endSpherical.theta - startSpherical.theta > Math.PI) endSpherical.theta -= Math.PI * 2;
    while (endSpherical.theta - startSpherical.theta < -Math.PI) endSpherical.theta += Math.PI * 2;

    const tween = new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);
            const radius = THREE.MathUtils.lerp(startSpherical.radius, endSpherical.radius, progress);
            const phi = THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, progress);
            const theta = THREE.MathUtils.lerp(startSpherical.theta, endSpherical.theta, progress);

            sceneRoot.rotation.y = THREE.MathUtils.lerp(startRotationY, endRotationY, progress);
            camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(controls.target);
            enforceCameraGroundBounds();
            markSceneDirty();
        })
        .onComplete(() => {
            setActiveCameraTween(null);
            controls.enabled = true;
            controls.enableRotate = !sideConfigs.graphic.gizmoActive;
            enforceCameraGroundBounds();
            controls.update();
            markSceneDirty();
        })
        .start();

    setActiveCameraTween(tween);
}

/**
 * Transitions camera to designated viewpoint (home, front, back, left, right).
 * 
 * @param {string} view
 * @param {number} [duration=800]
 * @param {boolean} [isSequence=false]
 */
export function focusCameraView(view, duration = 800, isSequence = false) {
    updateDynamicCameraTargets(false);

    const targetPosition = cameraTargets[view];
    if (!targetPosition) return;

    if (!isSequence) {
        currentCameraSequenceId++;
    }

    transitionCamera(targetPosition, duration);
    setActiveCameraView(view);
}

export function transitionCameraSpinHalf(targetPosition, duration = 800, isSecondHalf = false) {
    if (state.isInAR) return;
    const activeCameraTween = getActiveCameraTween();
    if (activeCameraTween) {
        activeCameraTween.stop();
        setActiveCameraTween(null);
        controls.enabled = true;
        controls.enableRotate = !sideConfigs.graphic.gizmoActive;
    }

    controls.enabled = false;

    const endPosition = targetPosition.clone();
    const startTarget = controls.target.clone();
    const endTarget = targetCenter.clone();
    const startSpherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(startTarget));
    const endSpherical = new THREE.Spherical().setFromVector3(endPosition.clone().sub(endTarget));
    const startRotationY = getNormalizedRotationAngle(sceneRoot.rotation.y);
    const endRotationY = 0;

    sceneRoot.rotation.y = startRotationY;

    while (endSpherical.theta >= startSpherical.theta) {
        endSpherical.theta -= Math.PI * 2;
    }
    while (startSpherical.theta - endSpherical.theta > Math.PI * 2) {
        endSpherical.theta += Math.PI * 2;
    }

    const easingFunc = isSecondHalf ? TWEEN.Easing.Quadratic.In : TWEEN.Easing.Quadratic.Out;

    const tween = new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, duration)
        .easing(easingFunc)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);
            const radius = THREE.MathUtils.lerp(startSpherical.radius, endSpherical.radius, progress);
            const phi = THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, progress);
            const theta = THREE.MathUtils.lerp(startSpherical.theta, endSpherical.theta, progress);

            sceneRoot.rotation.y = THREE.MathUtils.lerp(startRotationY, endRotationY, progress);
            camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(controls.target);
            markSceneDirty();
        })
        .onComplete(() => {
            setActiveCameraTween(null);
            controls.enabled = true;
            controls.enableRotate = !sideConfigs.graphic.gizmoActive;
            controls.update();
            markSceneDirty();
        })
        .start();

    setActiveCameraTween(tween);
}

export function focusCameraSpinHalf(view, duration = 800, isSecondHalf = false, isSequence = false) {
    updateDynamicCameraTargets(false);
    const targetPosition = cameraTargets[view];
    if (!targetPosition) return;

    if (!isSequence) {
        currentCameraSequenceId++;
    }

    transitionCameraSpinHalf(targetPosition, duration, isSecondHalf);
    setActiveCameraView(view);
}

export async function runPrintingCameraSequence() {
    currentCameraSequenceId++;
    const sequenceId = currentCameraSequenceId;

    const primaryView = (configState.printing === 'Double Sided') ? 'front' : ((configState.direction === 'Left') ? 'back' : 'front');
    const secondaryView = (configState.printing === 'Double Sided') ? 'back' : ((configState.direction === 'Left') ? 'front' : 'back');

    focusCameraSpinHalf(secondaryView, 800, false, true);
    await new Promise(resolve => setTimeout(resolve, 820));
    if (sequenceId !== currentCameraSequenceId) return;

    focusCameraSpinHalf(primaryView, 800, true, true);
}

export async function runDirectionCameraSequence(direction) {
    currentCameraSequenceId++;
    if (direction === 'Right') {
        focusCameraView('front', 800, false);
    } else if (direction === 'Left') {
        focusCameraView('back', 800, false);
    }
}
