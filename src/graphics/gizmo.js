import * as THREE from 'three';
import Moveable from 'moveable';
import { dom } from '../ui/domElements.js';
import { camera, controls } from '../core/camera.js';
import { markSceneDirty } from '../core/scene.js';
import { configState, state } from '../state/configState.js';
import { sideConfigs, saveCurrentGraphicToCache } from './graphicConfig.js';
import { updateTextureTransforms } from './textureCompositor.js';
import { showToast } from '../ui/toast.js';
import { eventBus } from '../state/eventBus.js';
import { modelRoot } from '../models/flagModel.js';

let moveableInstance = null;
let isMoveableInteracting = false;
let isScrubberInteracting = false;
let moveableStartSnapshot = null;
let isMultiTouchActive = false;
let gizmoOverlayRaf = null;
let gizmoSessionSnapshot = null;

export function isGizmoInteracting() {
    return isMoveableInteracting || isScrubberInteracting;
}


let currentGizmoState = {
    screenX: 0,
    screenY: 0,
    baseW: 100,
    baseH: 100,
    flagScreenAngle: 0,
    totalAngle: 0
};

export function scheduleGizmoOverlayUpdate() {
    if (gizmoOverlayRaf) return;
    gizmoOverlayRaf = requestAnimationFrame(() => {
        gizmoOverlayRaf = null;
        updateGizmoOverlay();
    });
}

export function updateTransformBadges() {
    const config = sideConfigs.graphic;
    if (dom.badgeScaleVal) {
        dom.badgeScaleVal.textContent = `${Math.round(config.scale * 100)}%`;
    }
    if (dom.badgeRotationVal) {
        let deg = Math.round((config.rotation * 180 / Math.PI) % 360);
        if (deg < 0) deg += 360;
        dom.badgeRotationVal.textContent = `${deg}°`;
    }
    if (dom.badgePanXVal) {
        dom.badgePanXVal.textContent = (config.panX >= 0 ? '+' : '') + config.panX.toFixed(2);
    }
    if (dom.badgePanYVal) {
        dom.badgePanYVal.textContent = (config.panY >= 0 ? '+' : '') + config.panY.toFixed(2);
    }
}

function getActiveFlagMesh() {
    const root = modelRoot || window.__FLAG_MODEL_ROOT__;
    if (!root || !root.userData || !root.userData.flagMeshes) return null;
    const sizeCode = configState.size.split(' ').pop();
    const sizePrefix = sizeCode.toLowerCase();
    const meshes = root.userData.flagMeshes[sizePrefix];
    if (!meshes) return null;
    const isBack = (configState.direction === 'Left');
    const mesh = isBack ? (meshes.back || meshes.front) : meshes.front;
    return (mesh && mesh.visible) ? mesh : null;
}

function getActiveFlagUvSpan() {
    const sizeCode = (configState.size || '').split(' ').pop();
    const sizePrefix = sizeCode ? sizeCode.toLowerCase() : 'l';
    if (sizePrefix === 'xs') {
        return { uSpan: 0.150, vSpan: 0.42 };
    }
    return { uSpan: 0.187, vSpan: 0.95 };
}

export function initMoveable() {
    if (moveableInstance || !dom.moveableTarget || !dom.canvasContainer) return;

    moveableInstance = new Moveable(dom.canvasContainer, {
        target: dom.moveableTarget,
        draggable: true,
        resizable: false,
        scalable: true,
        rotatable: true,
        warpable: false,
        pinchable: false,
        origin: false,
        keepRatio: true,
        throttleDrag: 0,
        throttleScale: 0,
        throttleRotate: 0
    });

    moveableInstance.on('dragStart', (e) => {
        const inputEv = e.inputEvent;
        if (inputEv && inputEv.touches && inputEv.touches.length > 1) {
            e.stop();
            return false;
        }

        isMoveableInteracting = true;
        moveableStartSnapshot = {
            panX: sideConfigs.graphic.panX,
            panY: sideConfigs.graphic.panY,
            scale: sideConfigs.graphic.scale,
            rotation: sideConfigs.graphic.rotation
        };
        e.datas.startPanX = sideConfigs.graphic.panX;
        e.datas.startPanY = sideConfigs.graphic.panY;
        e.datas.baseW = currentGizmoState.baseW || 100;
        e.datas.baseH = currentGizmoState.baseH || 100;
        e.datas.flagAngle = currentGizmoState.flagScreenAngle || 0;
        e.datas.scale = sideConfigs.graphic.scale || 1.0;
    });

    moveableInstance.on('drag', (e) => {
        if (!isMoveableInteracting) return;
        const inputEv = e.inputEvent;
        if (inputEv && inputEv.touches && inputEv.touches.length > 1) {
            isMoveableInteracting = false;
            e.stop();
            return;
        }

        e.target.style.transform = e.transform;

        const [dxScreen, dyScreen] = e.beforeDist;
        const theta = e.datas.flagAngle;

        const dxLocal = dxScreen * Math.cos(-theta) - dyScreen * Math.sin(-theta);
        const dyLocal = dxScreen * Math.sin(-theta) + dyScreen * Math.cos(-theta);

        const uvSpan = getActiveFlagUvSpan();
        const deltaPanX = (dxLocal / e.datas.baseW) * (uvSpan.uSpan / e.datas.scale);
        const deltaPanY = (-dyLocal / e.datas.baseH) * (uvSpan.vSpan / e.datas.scale);

        sideConfigs.graphic.panX = Math.max(-2.5, Math.min(2.5, Number((e.datas.startPanX + deltaPanX).toFixed(3))));
        sideConfigs.graphic.panY = Math.max(-2.5, Math.min(2.5, Number((e.datas.startPanY + deltaPanY).toFixed(3))));

        updateTextureTransforms('graphic');
    });

    moveableInstance.on('dragEnd', () => {
        isMoveableInteracting = false;
        moveableStartSnapshot = null;
        controls.enableRotate = !sideConfigs.graphic.gizmoActive;
        controls.enableZoom = true;
        controls.enablePan = true;
        updateGizmoOverlay();
        saveCurrentGraphicToCache();
        markSceneDirty();
    });

    moveableInstance.on('scaleStart', (e) => {
        const inputEv = e.inputEvent;
        if (inputEv && inputEv.touches && inputEv.touches.length > 1) {
            e.stop();
            return false;
        }
        isMoveableInteracting = true;
        moveableStartSnapshot = {
            panX: sideConfigs.graphic.panX,
            panY: sideConfigs.graphic.panY,
            scale: sideConfigs.graphic.scale,
            rotation: sideConfigs.graphic.rotation
        };
        e.datas.startScale = sideConfigs.graphic.scale;
    });

    moveableInstance.on('scale', (e) => {
        if (!isMoveableInteracting) return;
        const inputEv = e.inputEvent;
        if (inputEv && inputEv.touches && inputEv.touches.length > 1) {
            isMoveableInteracting = false;
            e.stop();
            return;
        }
        e.target.style.transform = e.transform;

        const scaleMultiplier = (e.dist && e.dist[0]) ? e.dist[0] : ((e.scale[0] + e.scale[1]) * 0.5);
        const newScale = Math.max(0.15, Math.min(3.5, Number((e.datas.startScale * scaleMultiplier).toFixed(3))));

        sideConfigs.graphic.scale = newScale;
        updateTextureTransforms('graphic');
    });

    moveableInstance.on('scaleEnd', () => {
        isMoveableInteracting = false;
        moveableStartSnapshot = null;
        controls.enableRotate = !sideConfigs.graphic.gizmoActive;
        controls.enableZoom = true;
        controls.enablePan = true;
        updateGizmoOverlay();
        saveCurrentGraphicToCache();
        markSceneDirty();
    });

    moveableInstance.on('rotateStart', (e) => {
        const inputEv = e.inputEvent;
        if (inputEv && inputEv.touches && inputEv.touches.length > 1) {
            e.stop();
            return false;
        }
        isMoveableInteracting = true;
        moveableStartSnapshot = {
            panX: sideConfigs.graphic.panX,
            panY: sideConfigs.graphic.panY,
            scale: sideConfigs.graphic.scale,
            rotation: sideConfigs.graphic.rotation
        };
        e.datas.startRotation = sideConfigs.graphic.rotation;
    });

    moveableInstance.on('rotate', (e) => {
        if (!isMoveableInteracting) return;
        const inputEv = e.inputEvent;
        if (inputEv && inputEv.touches && inputEv.touches.length > 1) {
            isMoveableInteracting = false;
            e.stop();
            return;
        }
        e.target.style.transform = e.transform;

        const deltaDeg = (e.beforeDist !== undefined) ? e.beforeDist : e.dist;
        const deltaRad = (deltaDeg * Math.PI) / 180;
        let newRot = e.datas.startRotation + deltaRad;

        if (e.inputEvent && e.inputEvent.shiftKey) {
            const step = Math.PI / 12; // 15-degree snap
            newRot = Math.round(newRot / step) * step;
        }

        newRot = Math.atan2(Math.sin(newRot), Math.cos(newRot));
        sideConfigs.graphic.rotation = Number(newRot.toFixed(4));

        updateTextureTransforms('graphic');
    });

    moveableInstance.on('rotateEnd', () => {
        isMoveableInteracting = false;
        moveableStartSnapshot = null;
        controls.enableRotate = !sideConfigs.graphic.gizmoActive;
        controls.enableZoom = true;
        controls.enablePan = true;
        updateGizmoOverlay();
        saveCurrentGraphicToCache();
        markSceneDirty();
    });

    // Multi-finger gesture yielding
    window.addEventListener('touchstart', (e) => {
        if (!sideConfigs.graphic.gizmoActive) return;
        if (e.touches && e.touches.length >= 2) {
            isMultiTouchActive = true;
            if (isMoveableInteracting) {
                isMoveableInteracting = false;
                if (moveableStartSnapshot) {
                    sideConfigs.graphic.panX = moveableStartSnapshot.panX;
                    sideConfigs.graphic.panY = moveableStartSnapshot.panY;
                    sideConfigs.graphic.scale = moveableStartSnapshot.scale;
                    sideConfigs.graphic.rotation = moveableStartSnapshot.rotation;
                    updateTextureTransforms('graphic');
                }
            }
            controls.enabled = true;
            controls.enableRotate = false;
            controls.enableZoom = true;
            controls.enablePan = true;
        }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
        if (!sideConfigs.graphic.gizmoActive) return;
        if (!e.touches || e.touches.length < 2) {
            if (isMultiTouchActive) {
                isMultiTouchActive = false;
            }
        }
    }, { passive: true });

    window.addEventListener('touchcancel', (e) => {
        if (!sideConfigs.graphic.gizmoActive) return;
        if (!e.touches || e.touches.length < 2) {
            isMultiTouchActive = false;
        }
    }, { passive: true });
}

export function setGizmoActive(active) {
    const config = sideConfigs.graphic;
    if (active && !config.uploadedTexture) return;

    config.gizmoActive = active;

    if (dom.btnToggleGizmo) {
        dom.btnToggleGizmo.classList.toggle('is-active', active);
        dom.btnToggleGizmo.setAttribute('aria-pressed', String(active));
        if (dom.gizmoToggleText) {
            const activeText = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('upload.adjust_active') : 'Editing Active';
            const inactiveText = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('upload.adjust') : 'Adjust on Flag';
            dom.gizmoToggleText.textContent = active ? activeText : inactiveText;
        }
    }

    if (!active) {
        controls.enabled = true;
        controls.enableRotate = true;
        controls.enableZoom = true;
        controls.enablePan = true;
        if (dom.moveableTarget) {
            dom.moveableTarget.style.display = 'none';
            dom.moveableTarget.style.pointerEvents = 'auto';
        }
        if (dom.gizmoFloatingBar) {
            dom.gizmoFloatingBar.hidden = true;
        }
        if (moveableInstance) {
            moveableInstance.target = null;
        }
        markSceneDirty();
    } else {
        controls.enabled = true;
        controls.enableRotate = false;
        controls.enableZoom = true;
        controls.enablePan = true;

        gizmoSessionSnapshot = {
            scale: config.scale,
            rotation: config.rotation,
            panX: config.panX,
            panY: config.panY
        };

        if (dom.moveableTarget) {
            dom.moveableTarget.style.display = 'block';
            dom.moveableTarget.style.pointerEvents = 'auto';
        }
        if (dom.gizmoFloatingBar) {
            dom.gizmoFloatingBar.hidden = false;
        }

        if (!moveableInstance) {
            initMoveable();
        } else {
            moveableInstance.target = dom.moveableTarget;
        }

        eventBus.emit('gizmo:activated');
        markSceneDirty();
        updateTransformBadges();
        updateGizmoOverlay();
    }
}

export function discardGizmoChanges(silent = false) {
    if (!sideConfigs.graphic.gizmoActive) return;
    if (gizmoSessionSnapshot) {
        const config = sideConfigs.graphic;
        config.scale = gizmoSessionSnapshot.scale;
        config.rotation = gizmoSessionSnapshot.rotation;
        config.panX = gizmoSessionSnapshot.panX;
        config.panY = gizmoSessionSnapshot.panY;
        updateTextureTransforms('graphic');
    }
    setGizmoActive(false);
    gizmoSessionSnapshot = null;
    if (!silent) {
        showToast('Changes Discarded', 'Reverted back to previous position.', 'info', 1500);
    }
}

export function updateGizmoOverlay() {
    const config = sideConfigs.graphic;
    if (!config.gizmoActive || !config.uploadedTexture || !dom.moveableTarget) return;

    const mesh = getActiveFlagMesh();
    if (!mesh) {
        if (moveableInstance) moveableInstance.target = null;
        dom.moveableTarget.style.display = 'none';
        return;
    }

    if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
    }
    const localBox = mesh.geometry.boundingBox;
    if (!localBox) return;

    mesh.updateWorldMatrix(true, false);

    const center3D = new THREE.Vector3(
        (localBox.min.x + localBox.max.x) * 0.5,
        (localBox.min.y + localBox.max.y) * 0.5,
        (localBox.min.z + localBox.max.z) * 0.5
    ).applyMatrix4(mesh.matrixWorld);

    const top3D = new THREE.Vector3(
        (localBox.min.x + localBox.max.x) * 0.5,
        localBox.max.y,
        (localBox.min.z + localBox.max.z) * 0.5
    ).applyMatrix4(mesh.matrixWorld);

    const bottom3D = new THREE.Vector3(
        (localBox.min.x + localBox.max.x) * 0.5,
        localBox.min.y,
        (localBox.min.z + localBox.max.z) * 0.5
    ).applyMatrix4(mesh.matrixWorld);

    const left3D = new THREE.Vector3(
        localBox.min.x,
        (localBox.min.y + localBox.max.y) * 0.5,
        (localBox.min.z + localBox.max.z) * 0.5
    ).applyMatrix4(mesh.matrixWorld);

    const right3D = new THREE.Vector3(
        localBox.max.x,
        (localBox.min.y + localBox.max.y) * 0.5,
        (localBox.min.z + localBox.max.z) * 0.5
    ).applyMatrix4(mesh.matrixWorld);

    const rect = dom.canvasContainer.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W <= 0 || H <= 0) return;

    const toScreen = (pt) => {
        const projected = pt.clone().project(camera);
        return {
            x: (projected.x * 0.5 + 0.5) * W,
            y: (-projected.y * 0.5 + 0.5) * H,
            z: projected.z
        };
    };

    const centerScreen = toScreen(center3D);
    if (centerScreen.z > 1.0) {
        if (moveableInstance) moveableInstance.target = null;
        dom.moveableTarget.style.display = 'none';
        return;
    }

    const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
    const camDir = camera.position.clone().sub(center3D).normalize();
    const dot = Math.abs(normal.dot(camDir));

    if (dot < 0.18) {
        if (moveableInstance) moveableInstance.target = null;
        dom.moveableTarget.style.display = 'none';
        return;
    } else {
        dom.moveableTarget.style.display = 'block';
        if (moveableInstance && moveableInstance.target !== dom.moveableTarget) {
            moveableInstance.target = dom.moveableTarget;
        }
    }

    const topScreen = toScreen(top3D);
    const bottomScreen = toScreen(bottom3D);
    const leftScreen = toScreen(left3D);
    const rightScreen = toScreen(right3D);

    const baseH = Math.max(40, Math.hypot(topScreen.x - bottomScreen.x, topScreen.y - bottomScreen.y));
    const baseW = Math.max(30, Math.hypot(rightScreen.x - leftScreen.x, rightScreen.y - leftScreen.y));

    const dxPole = topScreen.x - bottomScreen.x;
    const dyPole = topScreen.y - bottomScreen.y;
    const flagScreenAngle = Math.atan2(dxPole, -dyPole);

    const uvSpan = getActiveFlagUvSpan();
    const dxLocal = (config.panX * config.scale / uvSpan.uSpan) * baseW;
    const dyLocal = (-config.panY * config.scale / uvSpan.vSpan) * baseH;
    const rotatedDx = dxLocal * Math.cos(flagScreenAngle) - dyLocal * Math.sin(flagScreenAngle);
    const rotatedDy = dxLocal * Math.sin(flagScreenAngle) + dyLocal * Math.cos(flagScreenAngle);

    const finalScreenX = centerScreen.x + rotatedDx;
    const finalScreenY = centerScreen.y + rotatedDy;
    const totalAngle = flagScreenAngle + config.rotation;
    const totalAngleDeg = (totalAngle * 180 / Math.PI);

    currentGizmoState = {
        screenX: finalScreenX,
        screenY: finalScreenY,
        baseW: baseW,
        baseH: baseH,
        flagScreenAngle: flagScreenAngle,
        totalAngle: totalAngle
    };

    const left = centerScreen.x - baseW / 2;
    const top = centerScreen.y - baseH / 2;

    dom.moveableTarget.style.left = `${left.toFixed(2)}px`;
    dom.moveableTarget.style.top = `${top.toFixed(2)}px`;
    dom.moveableTarget.style.width = `${baseW.toFixed(2)}px`;
    dom.moveableTarget.style.height = `${baseH.toFixed(2)}px`;
    dom.moveableTarget.style.transform = `translate(${rotatedDx.toFixed(2)}px, ${rotatedDy.toFixed(2)}px) rotate(${totalAngleDeg.toFixed(2)}deg) scale(${config.scale.toFixed(3)})`;

    if (moveableInstance && !isMoveableInteracting) {
        moveableInstance.updateRect();
    }
}

function initFloatingToolbar() {
    const badges = document.querySelectorAll('.floating-badge');
    badges.forEach(badge => {
        const prop = badge.getAttribute('data-prop');
        const displayEl = badge.querySelector('.badge-val-display');
        const inputEl = badge.querySelector('.badge-val-input');
        if (!prop || !displayEl || !inputEl) return;

        let startX = 0;
        let startVal = 0;
        let isDragging = false;
        let hasMoved = false;

        const onPointerDown = (e) => {
            if (!inputEl.hidden) return;
            if (e.button !== 0) return;

            startX = e.clientX;
            const config = sideConfigs.graphic;
            if (prop === 'rotation') {
                startVal = config.rotation;
            } else if (prop === 'scale') {
                startVal = config.scale;
            } else {
                startVal = config[prop];
            }

            isDragging = true;
            isScrubberInteracting = true;
            hasMoved = false;
            badge.setPointerCapture(e.pointerId);
            e.preventDefault();
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            if (Math.abs(dx) > 2) {
                hasMoved = true;
            }
            if (!hasMoved) return;

            badge.classList.add('is-scrubbing');
            document.body.style.cursor = 'ew-resize';

            const config = sideConfigs.graphic;
            const isFine = e.shiftKey;

            if (prop === 'scale') {
                const step = isFine ? 0.002 : 0.008;
                config.scale = Math.max(0.15, Math.min(3.5, Number((startVal + dx * step).toFixed(3))));
            } else if (prop === 'rotation') {
                const step = isFine ? 0.003 : 0.012;
                let newRot = (startVal + dx * step) % (Math.PI * 2);
                if (newRot < 0) newRot += Math.PI * 2;
                config.rotation = Number(newRot.toFixed(4));
            } else if (prop === 'panX') {
                const step = isFine ? 0.0002 : 0.001;
                config.panX = Math.max(-2.5, Math.min(2.5, Number((startVal + dx * step).toFixed(4))));
            } else if (prop === 'panY') {
                const step = isFine ? 0.0002 : 0.001;
                config.panY = Math.max(-2.5, Math.min(2.5, Number((startVal + dx * step).toFixed(4))));
            }

            updateTextureTransforms('graphic');
            scheduleGizmoOverlayUpdate();
        };

        const onPointerUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            isScrubberInteracting = false;
            badge.classList.remove('is-scrubbing');
            document.body.style.cursor = '';
            try { badge.releasePointerCapture(e.pointerId); } catch (_) {}

            if (gizmoOverlayRaf) {
                cancelAnimationFrame(gizmoOverlayRaf);
                gizmoOverlayRaf = null;
            }
            updateGizmoOverlay();

            if (!hasMoved) {
                switchToInputMode();
            } else {
                saveCurrentGraphicToCache();
            }
        };

        function switchToInputMode() {
            displayEl.hidden = true;
            inputEl.hidden = false;
            const config = sideConfigs.graphic;

            if (prop === 'scale') {
                inputEl.value = Math.round(config.scale * 100);
            } else if (prop === 'rotation') {
                let deg = Math.round((config.rotation * 180 / Math.PI) % 360);
                if (deg < 0) deg += 360;
                inputEl.value = deg;
            } else {
                inputEl.value = config[prop].toFixed(2);
            }

            inputEl.focus();
            inputEl.select();
        }

        function commitInput() {
            if (inputEl.hidden) return;
            const valStr = inputEl.value.trim().replace('%', '').replace('°', '');
            const num = parseFloat(valStr);
            const config = sideConfigs.graphic;

            if (!isNaN(num)) {
                if (prop === 'scale') {
                    const clamped = Math.max(15, Math.min(350, num));
                    config.scale = Number((clamped / 100).toFixed(3));
                } else if (prop === 'rotation') {
                    let deg = num % 360;
                    if (deg < 0) deg += 360;
                    config.rotation = Number((deg * Math.PI / 180).toFixed(4));
                } else if (prop === 'panX') {
                    config.panX = Math.max(-2.5, Math.min(2.5, Number(num.toFixed(3))));
                } else if (prop === 'panY') {
                    config.panY = Math.max(-2.5, Math.min(2.5, Number(num.toFixed(3))));
                }
                updateTextureTransforms('graphic');
                updateGizmoOverlay();
                saveCurrentGraphicToCache();
            }

            inputEl.hidden = true;
            displayEl.hidden = false;
        }

        function cancelInput() {
            inputEl.hidden = true;
            displayEl.hidden = false;
        }

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                commitInput();
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                cancelInput();
            }
        });

        inputEl.addEventListener('blur', () => {
            commitInput();
        });

        badge.addEventListener('pointerdown', onPointerDown);
        badge.addEventListener('pointermove', onPointerMove);
        badge.addEventListener('pointerup', onPointerUp);
        badge.addEventListener('pointercancel', onPointerUp);
    });
}

export function bindGizmoControls() {
    if (dom.gizmoFloatingBar) {
        ['pointerdown', 'touchstart', 'touchmove', 'touchend', 'wheel', 'contextmenu'].forEach(evt => {
            dom.gizmoFloatingBar.addEventListener(evt, (e) => e.stopPropagation());
        });
    }

    if (dom.btnToggleGizmo) {
        dom.btnToggleGizmo.addEventListener('click', () => {
            if (sideConfigs.graphic.gizmoActive) {
                discardGizmoChanges(false);
            } else {
                setGizmoActive(true);
            }
        });
    }

    if (dom.btnTransformCenter) {
        dom.btnTransformCenter.addEventListener('click', () => {
            const config = sideConfigs.graphic;
            config.panX = 0.0;
            config.panY = 0.0;
            updateTextureTransforms('graphic');
            updateGizmoOverlay();
            showToast('Position Centered', 'Graphic centered on the flag.', 'info', 1500);
        });
    }

    if (dom.gizmoBtnAccept) {
        dom.gizmoBtnAccept.addEventListener('click', () => {
            saveCurrentGraphicToCache();
            gizmoSessionSnapshot = null;
            setGizmoActive(false);
            showToast('Changes Saved', 'Graphic transform changes applied.', 'success', 1500);
        });
    }

    if (dom.gizmoBtnReject) {
        dom.gizmoBtnReject.addEventListener('click', () => {
            discardGizmoChanges(false);
        });
    }

    window.addEventListener('keydown', (e) => {
        if (!sideConfigs.graphic.gizmoActive) return;
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

        if (e.key === 'Enter') {
            e.preventDefault();
            if (dom.gizmoBtnAccept) dom.gizmoBtnAccept.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (dom.gizmoBtnReject) dom.gizmoBtnReject.click();
        }
    });

    initFloatingToolbar();
}
