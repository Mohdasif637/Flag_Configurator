import * as THREE from 'three';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { scene, sceneRoot, renderer, markSceneDirty } from '../core/scene.js';
import { camera, controls, targetCenter, cameraTargets, cameraDistance, updateCameraViewportOffset, getActiveCameraTween, setActiveCameraTween, setCameraDistance } from '../core/camera.js';
import { updateDynamicCameraTargets, focusCameraView, currentCameraSequenceId } from '../core/cameraTransitions.js';
import { stopInitialAutoRotation } from '../core/renderLoop.js';
import { modelLoader } from './loaders.js';
import { loadVATData, vatCache, vatMaterials, updateVatUniforms, setVatTextures } from './vatLoader.js';
import { injectVATShader, injectDepthVATShader } from './flagShader.js';
import { setPocketMaterial, flagMaterialsCache } from './materials.js';
import { dom } from '../ui/domElements.js';
import { configState, state } from '../state/configState.js';
import { sideConfigs, loadGraphicFromCache } from '../graphics/graphicConfig.js';
import { updateDynamicPrices } from '../state/pricing.js';
import { showToast } from '../ui/toast.js';
import { getNormalizedRotationAngle } from '../utils/mathUtils.js';
import { eventBus } from '../state/eventBus.js';

export let modelRoot = null;
export let characterModel = null;
export let showCharacter = false;

let applyConfigCounter = 0;
let baseYOffset = 0.0;
let baseOffsetTween = null;
let characterLoading = false;
let silhouetteMesh = null;
let silhouetteLoadingFinished = false;
let characterTween = null;

/**
 * Stores original Y offset for all mesh components and applies baseYOffset.
 */
export function applyBaseYOffsetToMeshes() {
    if (!modelRoot) return;

    modelRoot.traverse((child) => {
        const lowerName = (child.name || '').toLowerCase();
        const isPole = lowerName.includes('pole');
        const isPocket = lowerName.includes('_pocket');
        const isVat = lowerName.includes('_vat') || child.userData.isBackClone;

        if ((isPole || isPocket || isVat) && typeof child.userData.originalPosY !== 'undefined') {
            child.position.y = child.userData.originalPosY + baseYOffset;
        }
    });
    markSceneDirty();
}

/**
 * Smoothly animates the vertical Y position offset of the flag meshes (e.g. for Luxury cross base elevation).
 * 
 * @param {number} targetOffset
 * @param {number} [duration=800]
 */
export function animateBaseYOffset(targetOffset, duration = 800) {
    if (baseOffsetTween) {
        baseOffsetTween.stop();
        baseOffsetTween = null;
    }

    baseOffsetTween = new TWEEN.Tween({ offset: baseYOffset })
        .to({ offset: targetOffset }, duration)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(({ offset }) => {
            baseYOffset = offset;
            applyBaseYOffsetToMeshes();
        })
        .onComplete(() => {
            baseOffsetTween = null;
        })
        .start();
}

/**
 * Fades the flag pole opacity smoothly in or out.
 * 
 * @param {number} targetOpacity - 0 to hide, 1 to show.
 * @param {number} [duration=350]
 */
export function fadePole(targetOpacity, duration = 350) {
    if (!modelRoot || !modelRoot.userData.poleMeshes) return;
    const poleMeshes = modelRoot.userData.poleMeshes;
    if (!poleMeshes.length) return;

    if (modelRoot.userData.poleFadeTween) {
        modelRoot.userData.poleFadeTween.stop();
        modelRoot.userData.poleFadeTween = null;
    }

    let currentOpacity = 1.0;
    const firstMat = Array.isArray(poleMeshes[0].material) ? poleMeshes[0].material[0] : poleMeshes[0].material;
    if (firstMat) currentOpacity = firstMat.opacity;

    if (targetOpacity > 0) {
        poleMeshes.forEach(mesh => { mesh.visible = true; });
    }

    modelRoot.userData.poleFadeTween = new TWEEN.Tween({ opacity: currentOpacity })
        .to({ opacity: targetOpacity }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(({ opacity }) => {
            poleMeshes.forEach(mesh => {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach(m => {
                    if (m) m.opacity = opacity;
                });
            });
            markSceneDirty();
        })
        .onComplete(() => {
            if (targetOpacity === 0) {
                poleMeshes.forEach(mesh => { mesh.visible = false; });
            }
            modelRoot.userData.poleFadeTween = null;
            markSceneDirty();
        })
        .start();
}

/**
 * Computes bounding dimensions of currently visible meshes.
 * @returns {number}
 */
function getVisibleMaxDimension() {
    if (!modelRoot) return 1;
    const box = new THREE.Box3();
    let hasVisibleMesh = false;
    modelRoot.traverse((child) => {
        if (child.isMesh) {
            let isVisible = true;
            let current = child;
            while (current) {
                if (!current.visible) {
                    isVisible = false;
                    break;
                }
                if (current === modelRoot) break;
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
    if (hasVisibleMesh && !box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        return Math.max(size.x, size.y, size.z);
    }
    return 1;
}

function getBaseFocusTargets() {
    const baseBox = new THREE.Box3();
    let hasBaseMesh = false;
    if (modelRoot) {
        modelRoot.traverse(child => {
            if (child.isMesh && child.visible) {
                const lowerName = (child.name || '').toLowerCase();
                if (lowerName.includes('luxury_cross_base') || lowerName.includes('cross_base_grey_black') || lowerName.includes('base') || lowerName.includes('cross')) {
                    child.geometry.computeBoundingBox();
                    if (child.geometry.boundingBox) {
                        const childBox = child.geometry.boundingBox.clone();
                        childBox.applyMatrix4(child.matrixWorld);
                        baseBox.expandByPoint(childBox.min);
                        baseBox.expandByPoint(childBox.max);
                        hasBaseMesh = true;
                    }
                }
            }
        });
    }

    const target = new THREE.Vector3();
    const pos = new THREE.Vector3();

    if (hasBaseMesh && !baseBox.isEmpty()) {
        baseBox.getCenter(target);
        const size = baseBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = Math.max(maxDim * 1.5, 1.8);
        pos.set(target.x + distance * 0.45, target.y + distance * 0.35, target.z + distance * 0.88);
    } else {
        target.set(0, 0.25, 0);
        pos.set(0.8, 0.7, 1.6);
    }
    return { target, position: pos };
}

function createFlagMeasurementGroup(bottomY, topY, lineX, text) {
    const group = new THREE.Group();
    group.name = 'flag-measurement';

    const material = new THREE.MeshBasicMaterial({
        color: 0x00633b,
        transparent: true,
        opacity: 0.8
    });

    function createThickLine(p1, p2, radius) {
        const direction = new THREE.Vector3().subVectors(p2, p1);
        const length = direction.length();
        const geom = new THREE.CylinderGeometry(radius, radius, length, 4);
        const mesh = new THREE.Mesh(geom, material);
        mesh.raycast = () => {};
        
        const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        mesh.position.copy(center);
        
        const up = new THREE.Vector3(0, 1, 0);
        direction.normalize();
        mesh.quaternion.setFromUnitVectors(up, direction);
        return mesh;
    }

    const lineRadius = 0.005;
    const height = topY - bottomY;
    const midY = bottomY + height / 2;
    const gapHalf = 0.14;

    const lineSegmentsData = [
        [new THREE.Vector3(lineX, bottomY, 0), new THREE.Vector3(lineX, midY - gapHalf, 0)],
        [new THREE.Vector3(lineX, midY + gapHalf, 0), new THREE.Vector3(lineX, topY, 0)],
        [new THREE.Vector3(lineX, bottomY, 0), new THREE.Vector3(-0.1, bottomY, 0)],
        [new THREE.Vector3(lineX, topY, 0), new THREE.Vector3(-0.1, topY, 0)],
        [new THREE.Vector3(lineX, topY, 0), new THREE.Vector3(lineX - 0.04, topY - 0.08, 0)],
        [new THREE.Vector3(lineX, topY, 0), new THREE.Vector3(lineX + 0.04, topY - 0.08, 0)],
        [new THREE.Vector3(lineX, bottomY, 0), new THREE.Vector3(lineX - 0.04, bottomY + 0.08, 0)],
        [new THREE.Vector3(lineX, bottomY, 0), new THREE.Vector3(lineX + 0.04, bottomY + 0.08, 0)]
    ];

    lineSegmentsData.forEach(([p1, p2]) => {
        group.add(createThickLine(p1, p2, lineRadius));
    });

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 512, 256);
    ctx.font = '120px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    
    const w = textWidth + 32;
    const h = 168;
    const x = 256 - w / 2;
    const y = 128 - h / 2;
    const r = 24;
    
    ctx.fillStyle = 'rgba(16, 24, 30, 0.85)';
    ctx.strokeStyle = '#00633b';
    ctx.lineWidth = 6;
    
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 256, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.48, 0.24, 1.0);
    sprite.position.set(lineX, midY, 0.05);
    sprite.raycast = () => {};
    group.add(sprite);

    return group;
}

export function syncFlagMeasurement() {
    if (!sceneRoot || !modelRoot) return;
    
    const oldGroup = sceneRoot.getObjectByName('flag-measurement');
    if (oldGroup) {
        sceneRoot.remove(oldGroup);
        oldGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => m.dispose());
            }
        });
    }

    const isXS = configState.size === 'Feather Flag Convex XS';
    const isL = configState.size === 'Feather Flag Convex L';
    
    if (showCharacter && (isXS || isL)) {
        const savedSceneRotationY = sceneRoot.rotation.y;
        const savedModelRotationY = modelRoot.rotation.y;
        const savedModelScale = modelRoot.scale.clone();
        
        sceneRoot.rotation.y = 0;
        modelRoot.rotation.y = 0;
        modelRoot.scale.set(1, 1, 1);
        sceneRoot.updateMatrixWorld(true);
        modelRoot.updateMatrixWorld(true);

        const flagBox = new THREE.Box3();
        const sizeCode = configState.size.split(' ').pop().toLowerCase();
        
        modelRoot.traverse((child) => {
            if (child.isMesh) {
                const name = (child.name || '').toLowerCase();
                const isPole = name.includes('pole');
                const isSizeMesh = name.includes(`${sizeCode}_vat`) || name.includes(`${sizeCode}_pocket`);
                
                if (isPole || (isSizeMesh && child.visible)) {
                    const childBox = new THREE.Box3().setFromObject(child);
                    if (!childBox.isEmpty()) {
                        flagBox.union(childBox);
                    }
                }
            }
        });

        sceneRoot.rotation.y = savedSceneRotationY;
        modelRoot.rotation.y = savedModelRotationY;
        modelRoot.scale.copy(savedModelScale);
        sceneRoot.updateMatrixWorld(true);
        modelRoot.updateMatrixWorld(true);

        if (!flagBox.isEmpty()) {
            const bottomY = flagBox.min.y;
            const topY = flagBox.max.y;
            const lineX = flagBox.min.x - 0.35;
            const labelText = isXS ? '250 cm' : '500 cm';
            
            const measurement = createFlagMeasurementGroup(bottomY, topY, lineX, labelText);
            sceneRoot.add(measurement);
        }
    }
    
    markSceneDirty();
}

/**
 * Updates dynamic graphic download link for active size and print style.
 */
export function updateTemplateDownloadLink() {
    const downloadBtn = dom.templateDownloadBtn || document.getElementById('template-download-btn');
    const filenameDisplay = dom.templateFilename || document.getElementById('template-filename');
    if (!downloadBtn) return;

    const sizeMapping = {
        'Feather Flag Convex XS': 'xs',
        'Feather Flag Convex S': 'S',
        'Feather Flag Convex M': 'M',
        'Feather Flag Convex M-Extra Wide': 'M-Wide',
        'Feather Flag Convex L': 'l'
    };
    const sizeKey = sizeMapping[configState.size] || configState.size.split(' ').pop();
    
    const sizeDimensions = {
        'xs': { file: 'xs-60x180cm', display: 'XS' },
        'S': { file: 's-60x240cm', display: 'S' },
        'M': { file: 'm-70x330cm', display: 'M' },
        'M-Wide': { file: 'm-wide-90x300cm', display: 'M - Extra Wide' },
        'l': { file: 'l-75x380cm', display: 'L' }
    };
    const sizeInfo = sizeDimensions[sizeKey] || { file: 'l-75x380cm', display: sizeKey.toUpperCase() };

    let fileSuffix = '';
    if (configState.printing === 'Double Sided') {
        fileSuffix = '-double-sided';
    } else {
        const dirSuffix = configState.direction.toLowerCase() === 'left' ? '-left' : '-right';
        fileSuffix = `-single-sided${dirSuffix}`;
    }

    const filename = `featherflag-convex-${sizeInfo.file}${fileSuffix}.pdf`;
    const downloadUrl = `./assets/templates/${filename}`;

    let sizeText = configState.size;
    if (window.i18next && window.i18next.isInitialized) {
        sizeText = window.i18next.t(`selections.size.${configState.size}`);
    }
    const sizePart = sizeText.replace(/\s+/g, '-');

    let printingText = configState.printing;
    if (window.i18next && window.i18next.isInitialized) {
        printingText = window.i18next.t(`selections.printing.${configState.printing}`);
    }
    const printingPart = printingText.replace(/\s+/g, '-');

    let directionPart = '';
    if (configState.printing !== 'Double Sided') {
        let directionText = configState.direction;
        if (window.i18next && window.i18next.isInitialized) {
            directionText = window.i18next.t(`selections.direction.${configState.direction}`);
        }
        directionPart = '-' + directionText.replace(/\s+/g, '-');
    }

    let displayName = `${sizePart}-${printingPart}${directionPart}`;
    displayName = displayName.replace(/\s+/g, '-');

    downloadBtn.href = downloadUrl;
    downloadBtn.setAttribute('download', filename);
    downloadBtn.removeAttribute('target');
    downloadBtn.removeAttribute('rel');
    if (filenameDisplay) {
        filenameDisplay.textContent = displayName;
    }
}

/**
 * Applies current configurator options (size, printing, direction, pole, base) to 3D flag mesh and scene.
 * Handles smooth animated transitions, 360-degree rotation masks, and camera framing adjustments.
 * 
 * @param {boolean} [animateTransition=false]
 * @param {number} [transitionDuration=800]
 * @param {boolean} [isBaseSwap=false]
 */
export async function applyConfigurationToScene(animateTransition = false, transitionDuration = 800, isBaseSwap = false) {
    markSceneDirty();
    const currentCounter = ++applyConfigCounter;

    loadGraphicFromCache();

    const targetOffset = (configState.base === 'Luxury cross base') ? 0.0114 : 0.0;
    if (!animateTransition || state.isInAR) {
        if (baseOffsetTween) {
            baseOffsetTween.stop();
            baseOffsetTween = null;
        }
        baseYOffset = targetOffset;
        applyBaseYOffsetToMeshes();
    }

    const activeCamTween = getActiveCameraTween();
    if (activeCamTween) {
        activeCamTween.stop();
        setActiveCameraTween(null);
    }

    if (modelRoot) {
        if (modelRoot.userData.scaleTween) {
            modelRoot.userData.scaleTween.stop();
            modelRoot.userData.scaleTween = null;
            if (controls) controls.enabled = true;
        }
        if (modelRoot.userData.poleFadeTween) {
            modelRoot.userData.poleFadeTween.stop();
            modelRoot.userData.poleFadeTween = null;
        }
        modelRoot.scale.set(1, 1, 1);
        modelRoot.rotation.y = 0;
        modelRoot.children.forEach(child => {
            const lowerName = (child.name || '').toLowerCase();
            if (lowerName.includes('base') || lowerName.includes('cross')) {
                child.rotation.y = 0;
            }
        });
        modelRoot.updateMatrixWorld(true);
    }

    updateDynamicPrices();

    const directionSection = document.getElementById('section-direction');
    if (directionSection) {
        directionSection.classList.toggle('is-visible', configState.printing !== 'Double Sided');
    }

    if (!modelRoot) return;

    // Check redundant click: if config unchanged, focus home camera view
    const currentConfigStr = JSON.stringify(configState);
    if (modelRoot.userData.lastConfigStr === currentConfigStr) {
        if (dom && dom.cameraButtons) {
            const homeBtn = dom.cameraButtons.find(b => b.dataset.view === 'home');
            if (homeBtn && !homeBtn.classList.contains('is-active')) {
                homeBtn.click();
            } else if (!homeBtn) {
                focusCameraView('home');
            }
        }
        return;
    }
    modelRoot.userData.lastConfigStr = currentConfigStr;

    const sizeCode = configState.size.split(' ').pop();
    const sizePrefix = sizeCode.toLowerCase();

    let currentVatData = vatCache[sizeCode.toLowerCase()];
    if (!currentVatData) {
        currentVatData = await loadVATData(sizeCode);
    }

    if (currentCounter !== applyConfigCounter) return;

    if (currentVatData && renderer.initTexture) {
        renderer.initTexture(currentVatData.positions);
        renderer.initTexture(currentVatData.normals);
    }

    const performSwap = () => {
        if (currentVatData) {
            setVatTextures(currentVatData.positions, currentVatData.normals);
            vatMaterials.forEach((mat) => {
                updateVatUniforms(mat, currentVatData.positions, currentVatData.normals, currentVatData.info.frame_count);
            });
        }

        modelRoot.traverse((child) => {
            if (!child.isMesh && child.type !== 'Group' && child.type !== 'Object3D') return;
            const lowerName = (child.name || '').toLowerCase();
            if (lowerName.includes('vat') || lowerName.includes('pocket') || lowerName.includes('base') || lowerName.includes('cross')) {
                child.visible = false;
            }
        });

        modelRoot.traverse((child) => {
            const lowerName = (child.name || '').toLowerCase();
            if (lowerName.includes(`${sizePrefix}_vat`) || lowerName.includes(`${sizePrefix}_pocket`)) {
                child.traverse(c => c.visible = true);
            }
            if (configState.base !== 'No base') {
                const baseKey = configState.base.toLowerCase().replace(/[\s-]/g, '_');
                if (lowerName.includes(baseKey) || (baseKey.startsWith('cross_base') && lowerName.includes('cross_base_grey_black'))) {
                    child.traverse(c => c.visible = true);
                    child.traverse(c => {
                        if (c.isMesh && c.material) {
                            const materials = Array.isArray(c.material) ? c.material : [c.material];
                            materials.forEach(mat => {
                                if (mat.name === 'cross_base_grey_black') {
                                    mat.color.setHex(configState.base === 'Cross base-black' ? 0x222222 : 0x888888);
                                }
                            });
                        }
                    });
                }
            }
        });

        const meshes = modelRoot.userData.flagMeshes[sizePrefix];
        const cache = modelRoot.userData.flagMaterialsCache;
        if (meshes && cache && cache[sizePrefix]) {
            const { front, back } = meshes;
            let frontMat, backMat;

            if (configState.printing === 'Double Sided') {
                frontMat = cache[sizePrefix]['ds_right'];
                backMat = cache[sizePrefix]['ds_left'];
            } else {
                if (configState.direction === 'Right') {
                    frontMat = cache[sizePrefix]['right'];
                    backMat = cache.global['translucent'] || cache.global['air_translucent'];
                } else {
                    frontMat = cache.global['translucent'] || cache.global['air_translucent'];
                    backMat = cache[sizePrefix]['left'];
                }
            }

            const isDoubleSided = configState.printing === 'Double Sided';
            const isAirTextile = configState.printing === 'Air Textile';
            const airTexMask = cache.global['air_translucent'] ? cache.global['air_translucent'].map : null;

            const applyProps = (mat, side, isTranslucent) => {
                if (!mat) return;
                if (isTranslucent) {
                    mat.side = side;
                    mat.polygonOffset = true;
                    mat.polygonOffsetFactor = -1;
                    mat.polygonOffsetUnits = -1;
                } else {
                    mat.side = isDoubleSided ? side : THREE.DoubleSide;
                    if (isDoubleSided && side === THREE.BackSide) {
                        mat.polygonOffset = true;
                        mat.polygonOffsetFactor = 1;
                        mat.polygonOffsetUnits = 1;
                    } else {
                        mat.polygonOffset = false;
                        mat.polygonOffsetFactor = 0;
                        mat.polygonOffsetUnits = 0;
                    }
                }

                if (isAirTextile && airTexMask) {
                    mat.alphaMap = airTexMask;
                    mat.transparent = true;
                    mat.alphaTest = 0.5;
                } else {
                    mat.alphaMap = null;
                    if (!isTranslucent) mat.transparent = false;
                    mat.alphaTest = 0;
                }
                mat.needsUpdate = true;
            };

            applyProps(frontMat, THREE.FrontSide, frontMat && frontMat.name.includes('translucent'));
            applyProps(backMat, THREE.BackSide, backMat && backMat.name.includes('translucent'));

            const uploadedFrontTex = sideConfigs.graphic.uploadedFrontTex;
            const uploadedBackTex = sideConfigs.graphic.uploadedBackTex;

            const applyGraphicOrRestore = (mat) => {
                if (!mat || mat.name.includes('translucent')) return;
                if (!mat.userData.originalMap) mat.userData.originalMap = mat.map;

                if (mat === frontMat && uploadedFrontTex) {
                    if (mat.userData.originalMap) uploadedFrontTex.channel = mat.userData.originalMap.channel;
                    mat.map = uploadedFrontTex;
                } else if (mat === backMat && uploadedBackTex) {
                    if (mat.userData.originalMap) uploadedBackTex.channel = mat.userData.originalMap.channel;
                    mat.map = uploadedBackTex;
                } else {
                    mat.map = mat.userData.originalMap;
                }
                mat.color.setHex(0xffffff);
                mat.needsUpdate = true;
            };

            Object.keys(cache).forEach(key => {
                if (key !== 'global') {
                    Object.values(cache[key]).forEach(applyGraphicOrRestore);
                }
            });

            if (frontMat) front.material = frontMat;
            if (backMat) back.material = backMat;

            const frontIsTranslucent = frontMat && frontMat.name.includes('translucent');
            const backIsTranslucent = backMat && backMat.name.includes('translucent');
            front.renderOrder = frontIsTranslucent ? 2 : 1;
            back.renderOrder = backIsTranslucent ? 2 : 1;

            applyBaseYOffsetToMeshes();
        }
    };

    if (animateTransition && !state.isInAR) {
        const activeCamTween = getActiveCameraTween();
        if (activeCamTween) {
            activeCamTween.stop();
            setActiveCameraTween(null);
        }
        const savedMaxDistance = controls ? controls.maxDistance : 10.5;
        if (controls) controls.enabled = false;

        const oldGroup = sceneRoot.getObjectByName('flag-measurement');
        if (oldGroup) {
            sceneRoot.remove(oldGroup);
            oldGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => m.dispose());
                }
            });
        }

        const currentVisualScale = modelRoot.scale.clone();
        const startRotationY = isBaseSwap ? 0 : (modelRoot.rotation.y || 0);
        const targetRotationY = startRotationY + (isBaseSwap ? Math.PI : Math.PI * 2);

        let oldBaseWasNone = true;
        modelRoot.traverse((child) => {
            if (child.isMesh && child.visible) {
                const lowerName = (child.name || '').toLowerCase();
                if (lowerName.includes('base') || lowerName.includes('cross')) {
                    oldBaseWasNone = false;
                }
            }
        });
        const targetBaseIsNone = (configState.base === 'No base');
        const isToOrFromNone = isBaseSwap && (oldBaseWasNone || targetBaseIsNone);

        const startSceneRotationY = getNormalizedRotationAngle(sceneRoot.rotation.y);
        const endSceneRotationY = 0;

        modelRoot.scale.set(1, 1, 1);
        modelRoot.updateMatrixWorld(true);
        const intrinsicOldDim = getVisibleMaxDimension();

        const startTarget = controls.target.clone();
        const startSpherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(startTarget));

        const visibilityMap = new Map();
        modelRoot.traverse(c => visibilityMap.set(c.uuid, c.visible));

        modelRoot.traverse((child) => {
            if (!child.isMesh && child.type !== 'Group' && child.type !== 'Object3D') return;
            const lowerName = (child.name || '').toLowerCase();
            if (lowerName.includes('vat') || lowerName.includes('pocket') || lowerName.includes('base') || lowerName.includes('cross')) child.visible = false;
        });

        modelRoot.traverse((child) => {
            const lowerName = (child.name || '').toLowerCase();
            if (lowerName.includes(`${sizePrefix}_vat`) || lowerName.includes(`${sizePrefix}_pocket`)) child.traverse(c => c.visible = true);
            if (configState.base !== 'No base') {
                const baseKey = configState.base.toLowerCase().replace(/[\s-]/g, '_');
                if (lowerName.includes(baseKey) || (baseKey.startsWith('cross_base') && lowerName.includes('cross_base_grey_black'))) {
                    child.traverse(c => c.visible = true);
                }
            }
        });

        modelRoot.updateMatrixWorld(true);
        const intrinsicNewDim = getVisibleMaxDimension();

        updateDynamicCameraTargets(false);
        if (controls) {
            controls.maxDistance = Math.max(savedMaxDistance, controls.maxDistance);
        }
        let endCameraPos, endControlsTarget;
        if (isBaseSwap && configState.base !== 'No base') {
            const baseFocus = getBaseFocusTargets();
            endControlsTarget = baseFocus.target;
            endCameraPos = baseFocus.position;
        } else {
            const activeView = dom.cameraButtons.find(b => b.classList.contains('is-active'))?.dataset.view || 'home';
            endCameraPos = cameraTargets[activeView] ? cameraTargets[activeView].clone() : cameraTargets.home.clone();
            endControlsTarget = targetCenter.clone();
        }
        const endSpherical = new THREE.Spherical().setFromVector3(endCameraPos.clone().sub(endControlsTarget));

        while (endSpherical.theta - startSpherical.theta > Math.PI) endSpherical.theta -= Math.PI * 2;
        while (endSpherical.theta - startSpherical.theta < -Math.PI) endSpherical.theta += Math.PI * 2;

        modelRoot.traverse(c => {
            if (visibilityMap.has(c.uuid)) c.visible = visibilityMap.get(c.uuid);
        });
        modelRoot.scale.copy(currentVisualScale);
        modelRoot.updateMatrixWorld(true);

        const dimRatio = (intrinsicOldDim > 0 && intrinsicNewDim > 0) ? (intrinsicNewDim / intrinsicOldDim) : 1;

        let hasSwapped = false;
        controls.enabled = false;

        modelRoot.userData.scaleTween = new TWEEN.Tween({ progress: 0 })
            .to({ progress: 1 }, transitionDuration)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onUpdate(({ progress }) => {
                const currentScaleAmt = THREE.MathUtils.lerp(1.0, dimRatio, progress);
                if (isBaseSwap) {
                    if (isToOrFromNone) {
                        let scaleVal = 1.0;
                        if (targetBaseIsNone) {
                            scaleVal = Math.max(0, 1.0 - progress * 4.0);
                        } else if (oldBaseWasNone) {
                            scaleVal = progress < 0.5 ? 0.0 : Math.min(1.0, (progress - 0.5) * 4.0);
                        }
                        modelRoot.children.forEach(child => {
                            const lowerName = (child.name || '').toLowerCase();
                            if (lowerName.includes('base') || lowerName.includes('cross')) {
                                child.scale.set(scaleVal, scaleVal, scaleVal);
                                child.rotation.y = 0;
                            }
                        });
                    } else {
                        const rotationY = THREE.MathUtils.lerp(startRotationY, targetRotationY, progress);
                        modelRoot.children.forEach(child => {
                            const lowerName = (child.name || '').toLowerCase();
                            if (lowerName.includes('base') || lowerName.includes('cross')) {
                                child.rotation.y = rotationY;
                                child.scale.set(1, 1, 1);
                            }
                        });
                    }
                } else {
                    modelRoot.rotation.y = THREE.MathUtils.lerp(startRotationY, targetRotationY, progress);
                }

                sceneRoot.rotation.y = THREE.MathUtils.lerp(startSceneRotationY, endSceneRotationY, progress);

                const radius = THREE.MathUtils.lerp(startSpherical.radius, endSpherical.radius, progress);
                const phi = THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, progress);
                const theta = THREE.MathUtils.lerp(startSpherical.theta, endSpherical.theta, progress);

                controls.target.lerpVectors(startTarget, endControlsTarget, progress);
                camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(controls.target);

                if (progress < 0.5) {
                    modelRoot.scale.set(currentScaleAmt, currentScaleAmt, currentScaleAmt);
                } else {
                    if (!hasSwapped) {
                        performSwap();
                        hasSwapped = true;
                        fadePole(configState.pole === 'With Pole' ? 1 : 0, 350);
                        const targetOffset = (configState.base === 'Luxury cross base') ? 0.0114 : 0.0;
                        animateBaseYOffset(targetOffset, transitionDuration * 0.5);
                    }
                    const newModelLocalScale = currentScaleAmt / dimRatio;
                    modelRoot.scale.set(newModelLocalScale, newModelLocalScale, newModelLocalScale);
                }
                markSceneDirty();
            })
            .onComplete(() => {
                if (!hasSwapped) performSwap();

                modelRoot.scale.set(1, 1, 1);
                if (isBaseSwap) {
                    modelRoot.children.forEach(child => {
                        const lowerName = (child.name || '').toLowerCase();
                        if (lowerName.includes('base') || lowerName.includes('cross')) {
                            child.scale.set(1, 1, 1);
                            child.rotation.y = 0;
                        }
                    });
                } else {
                    modelRoot.rotation.y = startRotationY;
                }
                sceneRoot.rotation.y = 0;
                modelRoot.updateMatrixWorld(true);
                modelRoot.userData.scaleTween = null;
                if (controls) {
                    setCameraDistance(cameraDistance);
                    controls.enabled = true;
                    controls.update();
                }
                syncFlagMeasurement();
                markSceneDirty();
            })
            .start();

    } else {
        performSwap();
        fadePole(configState.pole === 'With Pole' ? 1 : 0, 350);
        modelRoot.scale.set(1, 1, 1);
        modelRoot.rotation.y = 0;

        if (animateTransition) {
            sceneRoot.rotation.y = 0;
            updateDynamicCameraTargets(true);
        }
    }

    updateTemplateDownloadLink();
    if (!(animateTransition && !state.isInAR)) {
        syncFlagMeasurement();
    }
}

/**
 * Warmup all flag sizes.
 * Kept as a no-op for backward compatibility; non-initial sizes are loaded on-demand.
 */
export async function silentWarmupAllSizes() {
    return Promise.resolve();
}

/**
 * Loads the main flag GLTF model (convex.glb), discovers pole meshes, prepares VAT materials,
 * clones back-facing geometry for double-sided flags, and pre-compiles shaders.
 * 
 * @returns {Promise<THREE.Group>}
 */
export async function loadFlagModels() {
    const initialSizeCode = configState.size.split(' ').pop();
    const vatData = await loadVATData(initialSizeCode);
    if (vatData) {
        setVatTextures(vatData.positions, vatData.normals);
    }

    return new Promise((resolve, reject) => {
        modelLoader.load(
            '3d/convex.glb',
            (gltf) => {
                modelRoot = gltf.scene;
                window.__FLAG_MODEL_ROOT__ = modelRoot;
                modelRoot.scale.set(0.01, 0.01, 0.01);
                sceneRoot.add(modelRoot);
                sceneRoot.visible = !state.isInAR;

                const cache = { global: {} };
                modelRoot.traverse((child) => {
                    if (child.isMesh && child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => {
                            if (m.name === 'translucent' || m.name === 'air_translucent') {
                                cache.global[m.name] = m;
                            } else if (m.name.includes('_')) {
                                const size = m.name.split('_')[0];
                                const type = m.name.substring(size.length + 1);
                                if (['ds_right', 'ds_left', 'right', 'left'].includes(type)) {
                                    if (!cache[size]) cache[size] = {};
                                    cache[size][type] = m;
                                }
                            }
                        });
                    }
                });
                modelRoot.userData.flagMaterialsCache = cache;
                modelRoot.userData.flagMeshes = {};

                const poleMeshes = [];
                modelRoot.traverse((child) => {
                    if (!child.isMesh) return;
                    const lowerName = (child.name || '').toLowerCase();
                    if (lowerName.includes('pole')) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => {
                            if (m && !m.userData.poleOriginalTransparent) {
                                m.userData.poleOriginalTransparent = m.transparent;
                                m.userData.poleOriginalOpacity = m.opacity;
                                m.transparent = true;
                                m.opacity = 1.0;
                            }
                        });
                        poleMeshes.push(child);
                    }
                });
                modelRoot.userData.poleMeshes = poleMeshes;
                modelRoot.userData.poleFadeTween = null;

                modelRoot.traverse((child) => {
                    if (child.userData.originalPosY === undefined) {
                        child.userData.originalPosY = child.position.y;
                    }
                });

                Object.keys(cache).forEach(key => {
                    Object.values(cache[key]).forEach(m => {
                        if (m && !m.userData.originalMap) {
                            m.userData.originalMap = m.map;
                        }
                    });
                });

                modelRoot.traverse((child) => {
                    if (child.userData.isBackClone || !child.isMesh) return;
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.frustumCulled = !child.name.toLowerCase().includes('vat');

                    for (let i = 4; i <= 10; i++) {
                        const oldKey = `texcoord_${i}`;
                        if (child.geometry.attributes[oldKey]) {
                            child.geometry.setAttribute(`uv${i}`, child.geometry.attributes[oldKey]);
                            child.geometry.deleteAttribute(oldKey);
                        }
                    }

                    let maxUvIndex = 0;
                    for (let i = 1; i <= 10; i++) {
                        if (child.geometry.attributes[`uv${i}`]) {
                            maxUvIndex = i;
                        }
                    }

                    const vatUv = maxUvIndex > 0 ? `uv${maxUvIndex}` : 'uv';
                    const isVatMesh = child.name.toLowerCase().includes('vat');

                    if (isVatMesh && child.geometry.attributes[vatUv]) {
                        child.geometry.setAttribute('vatPositionUv', child.geometry.attributes[vatUv]);

                        if (!child.customDepthMaterial && vatData) {
                            child.customDepthMaterial = new THREE.MeshDepthMaterial({
                                depthPacking: THREE.RGBADepthPacking,
                                alphaTest: 0.5
                            });
                            injectDepthVATShader(child.customDepthMaterial, {
                                posTexture: vatData.positions,
                                frameCount: vatData.info.frame_count
                            });
                        }
                    }

                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach((material) => {
                        if (material.name.endsWith('_ds_right')) {
                            const size = material.name.split('_')[0];
                            material.side = THREE.FrontSide;

                            const backMesh = child.clone();
                            backMesh.userData.isBackClone = true;
                            backMesh.userData.originalPosY = child.userData.originalPosY;
                            if (child.customDepthMaterial) backMesh.customDepthMaterial = child.customDepthMaterial;

                            let backMaterial;
                            if (cache[size] && cache[size]['ds_left']) {
                                backMaterial = cache[size]['ds_left'];
                            } else {
                                backMaterial = material.clone();
                                backMaterial.name = material.name + '_back';
                                backMaterial.color.setHex(0x000000);
                                if (!backMaterial.userData.originalMap) backMaterial.userData.originalMap = backMaterial.map;
                            }
                            backMaterial.side = THREE.BackSide;
                            backMesh.material = backMaterial;
                            child.parent.add(backMesh);

                            modelRoot.userData.flagMeshes[size] = { front: child, back: backMesh };
                        }

                        if (material.name === 'pocket') {
                            setPocketMaterial(material);
                        }
                    });

                    if (isVatMesh && vatData) {
                        const allFlagMats = [];
                        Object.values(cache.global).forEach(m => { if (m) allFlagMats.push(m); });
                        Object.keys(cache).forEach(key => {
                            if (key !== 'global') {
                                Object.values(cache[key]).forEach(m => { if (m) allFlagMats.push(m); });
                            }
                        });

                        allFlagMats.forEach(mat => {
                            injectVATShader(mat, {
                                posTexture: vatData.positions,
                                normTexture: vatData.normals,
                                frameCount: vatData.info.frame_count
                            });
                        });
                    }
                });

                renderer.shadowMap.needsUpdate = true;

                // Pre-compile shaders for smooth initial interaction
                const compiledVisibilityStates = new Map();
                modelRoot.traverse((child) => {
                    compiledVisibilityStates.set(child.uuid, child.visible);
                    child.visible = true;
                });
                renderer.compile(scene, camera);
                modelRoot.traverse((child) => {
                    if (compiledVisibilityStates.has(child.uuid)) {
                        child.visible = compiledVisibilityStates.get(child.uuid);
                    }
                });

                state.modelLoaded = true;
                applyConfigurationToScene(false);
                updateDynamicCameraTargets(true);

                resolve(modelRoot);
            },
            undefined,
            (err) => reject(err)
        );
    });
}

/**
 * Draws the human silhouette contour path onto a 2D canvas context.
 * 
 * @param {CanvasRenderingContext2D} ctx
 */
function drawHumanSilhouettePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(277, 135);
    ctx.arc(256, 90, 45, 1.13, 2.01, true);
    ctx.quadraticCurveTo(180, 160, 140, 190);
    ctx.quadraticCurveTo(115, 330, 105, 470);
    ctx.quadraticCurveTo(100, 500, 120, 500);
    ctx.quadraticCurveTo(135, 380, 170, 320);
    ctx.quadraticCurveTo(180, 420, 175, 500);
    ctx.quadraticCurveTo(165, 600, 160, 700);
    ctx.lineTo(165, 950);
    ctx.quadraticCurveTo(145, 980, 195, 980);
    ctx.lineTo(245, 590);
    ctx.lineTo(256, 570);
    ctx.lineTo(267, 590);
    ctx.lineTo(317, 980);
    ctx.quadraticCurveTo(367, 980, 347, 950);
    ctx.lineTo(352, 700);
    ctx.quadraticCurveTo(347, 600, 337, 500);
    ctx.quadraticCurveTo(332, 420, 342, 320);
    ctx.quadraticCurveTo(377, 380, 392, 500);
    ctx.quadraticCurveTo(412, 500, 407, 470);
    ctx.quadraticCurveTo(397, 330, 372, 190);
    ctx.quadraticCurveTo(332, 160, 277, 135);
    ctx.closePath();
}

/**
 * Updates the 2D silhouette canvas texture with brand outline and vertical progress fill.
 * 
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {THREE.CanvasTexture} texture
 * @param {number} progress - Progress value from 0.0 to 1.0
 */
function updateSilhouetteTexture(canvas, ctx, texture, progress) {
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Unfilled state (translucent dark grey)
    ctx.fillStyle = 'rgba(55, 65, 81, 0.4)';
    drawHumanSilhouettePath(ctx);
    ctx.fill();

    // 2. Filled progress state (brand secondary #00633b) using clipping
    ctx.save();
    drawHumanSilhouettePath(ctx);
    ctx.clip();

    ctx.fillStyle = '#00633b';
    const fillHeight = progress * height;
    ctx.fillRect(0, height - fillHeight, width, fillHeight);
    ctx.restore();

    // 3. Thin outline on top (brand secondary #00633b)
    ctx.strokeStyle = '#00633b';
    ctx.lineWidth = 6;
    drawHumanSilhouettePath(ctx);
    ctx.stroke();

    texture.needsUpdate = true;
}

/**
 * Creates the 3D measurement dimension lines and "186 cm" text label badge for the character.
 * 
 * @returns {THREE.Group}
 */
function createCharacterMeasurement() {
    const group = new THREE.Group();
    group.name = 'height-measurement';

    const material = new THREE.MeshBasicMaterial({
        color: 0x00633b,
        transparent: true,
        opacity: 0.8
    });

    function createThickLine(p1, p2, radius) {
        const direction = new THREE.Vector3().subVectors(p2, p1);
        const length = direction.length();
        const geom = new THREE.CylinderGeometry(radius, radius, length, 4);
        const mesh = new THREE.Mesh(geom, material);
        mesh.raycast = () => {};

        const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        mesh.position.copy(center);

        const up = new THREE.Vector3(0, 1, 0);
        direction.normalize();
        mesh.quaternion.setFromUnitVectors(up, direction);
        return mesh;
    }

    const lineRadius = 0.005;

    const lineSegmentsData = [
        [new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(-0.45, 0.79, 0)],
        [new THREE.Vector3(-0.45, 1.07, 0), new THREE.Vector3(-0.45, 1.86, 0)],
        [new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(-0.1, 0, 0)],
        [new THREE.Vector3(-0.45, 1.86, 0), new THREE.Vector3(-0.1, 1.86, 0)],
        [new THREE.Vector3(-0.45, 1.86, 0), new THREE.Vector3(-0.49, 1.78, 0)],
        [new THREE.Vector3(-0.45, 1.86, 0), new THREE.Vector3(-0.41, 1.78, 0)],
        [new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(-0.49, 0.08, 0)],
        [new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(-0.41, 0.08, 0)]
    ];

    lineSegmentsData.forEach(([p1, p2]) => {
        group.add(createThickLine(p1, p2, lineRadius));
    });

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 256);
    ctx.font = '120px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textMetrics = ctx.measureText('186 cm');
    const textWidth = textMetrics.width;

    const w = textWidth + 32;
    const h = 168;
    const x = 256 - w / 2;
    const y = 128 - h / 2;
    const r = 24;

    ctx.fillStyle = 'rgba(16, 24, 30, 0.85)';
    ctx.strokeStyle = '#00633b';
    ctx.lineWidth = 6;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText('186 cm', 256, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.48, 0.24, 1.0);
    sprite.position.set(-0.45, 0.93, 0.05);
    sprite.raycast = () => {};
    group.add(sprite);

    return group;
}

/**
 * Loads the 3D character height reference model (186cm height reference)
 * featuring progressive 2D silhouette preview and smooth scaling/rotation entrance.
 */
export function loadCharacterModel() {
    if (characterModel || characterLoading) return;
    characterLoading = true;

    // 1. Create 2D silhouette plane in the WebGL scene
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    // Width = 0.93m (1.86 / 2), Height = 1.86m
    const geometry = new THREE.PlaneGeometry(0.93, 1.86);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    silhouetteMesh = new THREE.Mesh(geometry, material);
    silhouetteMesh.name = 'character-silhouette';
    silhouetteMesh.position.set(-0.9, 0.93, 0.01);
    silhouetteMesh.raycast = () => {};

    scene.add(silhouetteMesh);
    markSceneDirty();

    updateSilhouetteTexture(canvas, ctx, texture, 0.0);

    let targetProgress = 0.0;
    let currentProgress = 0.0;
    silhouetteLoadingFinished = false;
    let isLengthComputable = false;

    function animateProgress() {
        if (silhouetteLoadingFinished) return;

        if (!isLengthComputable && targetProgress < 0.8) {
            targetProgress = Math.min(0.8, targetProgress + 0.003);
        }

        if (targetProgress >= 0.8 && targetProgress < 0.95) {
            targetProgress += (0.95 - targetProgress) * 0.002;
        }

        currentProgress += (targetProgress - currentProgress) * 0.08;

        if (canvas && ctx && texture && silhouetteMesh) {
            updateSilhouetteTexture(canvas, ctx, texture, currentProgress);
            markSceneDirty();
        }

        requestAnimationFrame(animateProgress);
    }

    requestAnimationFrame(animateProgress);

    modelLoader.load(
        '3d/character.glb',
        (gltf) => {
            silhouetteLoadingFinished = true;

            characterModel = gltf.scene;
            window.__CHARACTER_MODEL__ = characterModel;

            characterModel.position.set(-0.9, 0, 0);

            characterModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            characterModel.scale.setScalar(0);
            characterModel.rotation.y = Math.PI * 2;
            characterModel.visible = showCharacter;

            const measurement = createCharacterMeasurement();
            characterModel.add(measurement);

            scene.add(characterModel);
            characterLoading = false;
            markSceneDirty();

            syncFlagMeasurement();

            const startProgress = currentProgress;

            if (showCharacter) {
                updateCameraViewportOffset();
                focusCameraView('front');

                characterTween = new TWEEN.Tween({ scale: 0, rotationY: Math.PI * 2 })
                    .to({ scale: 1, rotationY: 0 }, 800)
                    .easing(TWEEN.Easing.Cubic.Out)
                    .onUpdate(({ scale, rotationY }) => {
                        if (characterModel) {
                            characterModel.scale.setScalar(scale);
                            characterModel.rotation.y = rotationY;
                            markSceneDirty();
                        }

                        if (silhouetteMesh) {
                            const currentFill = startProgress + (1.0 - startProgress) * scale;
                            if (canvas && ctx && texture) {
                                updateSilhouetteTexture(canvas, ctx, texture, currentFill);
                            }
                            if (silhouetteMesh.material) {
                                silhouetteMesh.material.opacity = 1.0 - scale;
                            }
                        }
                    })
                    .onComplete(() => {
                        characterTween = null;

                        if (silhouetteMesh) {
                            scene.remove(silhouetteMesh);
                            if (silhouetteMesh.geometry) silhouetteMesh.geometry.dispose();
                            if (silhouetteMesh.material) silhouetteMesh.material.dispose();
                            silhouetteMesh = null;
                        }
                        canvas.width = 1;
                        canvas.height = 1;
                        texture.dispose();
                    })
                    .start();
            } else {
                if (silhouetteMesh) {
                    scene.remove(silhouetteMesh);
                    if (silhouetteMesh.geometry) silhouetteMesh.geometry.dispose();
                    if (silhouetteMesh.material) silhouetteMesh.material.dispose();
                    silhouetteMesh = null;
                }
                canvas.width = 1;
                canvas.height = 1;
                texture.dispose();
            }
        },
        (xhr) => {
            if (xhr.lengthComputable && xhr.total > 0) {
                isLengthComputable = true;
                targetProgress = Math.min(0.8, xhr.loaded / xhr.total);
            }
        },
        (error) => {
            console.error('Failed to load character model:', error);
            characterLoading = false;
            silhouetteLoadingFinished = true;

            if (silhouetteMesh) {
                scene.remove(silhouetteMesh);
                if (silhouetteMesh.geometry) silhouetteMesh.geometry.dispose();
                if (silhouetteMesh.material) {
                    if (silhouetteMesh.material.map) silhouetteMesh.material.map.dispose();
                    silhouetteMesh.material.dispose();
                }
                silhouetteMesh = null;
            }

            showToast('Loading failed', 'Could not load the 3D character model.', 'error', 3000);
        }
    );
}

/**
 * Toggles visibility of the 186cm human reference model in the 3D viewport.
 * Smoothly frames the camera and animates the character entering/exiting.
 */
export function toggleCharacterReference() {
    showCharacter = !showCharacter;
    window.__SHOW_CHARACTER__ = showCharacter;
    updateCameraViewportOffset();

    // Sync flag measurement before camera targets are recalculated
    syncFlagMeasurement();

    if (characterTween) {
        characterTween.stop();
        characterTween = null;
    }

    if (!showCharacter && silhouetteMesh) {
        scene.remove(silhouetteMesh);
        if (silhouetteMesh.geometry) silhouetteMesh.geometry.dispose();
        if (silhouetteMesh.material) {
            if (silhouetteMesh.material.map) silhouetteMesh.material.map.dispose();
            silhouetteMesh.material.dispose();
        }
        silhouetteMesh = null;
        silhouetteLoadingFinished = true;
        characterLoading = false;
    }

    stopInitialAutoRotation();
    focusCameraView('front');

    if (!characterModel) {
        loadCharacterModel();
    } else {
        if (showCharacter) {
            characterModel.visible = true;
            characterTween = new TWEEN.Tween({ scale: 0, rotationY: Math.PI * 2 })
                .to({ scale: 1, rotationY: 0 }, 800)
                .easing(TWEEN.Easing.Cubic.Out)
                .onUpdate(({ scale, rotationY }) => {
                    if (characterModel) {
                        characterModel.scale.setScalar(scale);
                        characterModel.rotation.y = rotationY;
                        markSceneDirty();
                    }
                })
                .onComplete(() => {
                    characterTween = null;
                })
                .start();
        } else {
            characterTween = new TWEEN.Tween({ scale: 1, rotationY: 0 })
                .to({ scale: 0, rotationY: Math.PI * 2 }, 800)
                .easing(TWEEN.Easing.Cubic.InOut)
                .onUpdate(({ scale, rotationY }) => {
                    if (characterModel) {
                        characterModel.scale.setScalar(scale);
                        characterModel.rotation.y = rotationY;
                        markSceneDirty();
                    }
                })
                .onComplete(() => {
                    if (characterModel) characterModel.visible = false;
                    characterTween = null;
                })
                .start();
        }
    }

    if (dom.charToggle) {
        dom.charToggle.classList.toggle('is-active', showCharacter);
        dom.charToggle.setAttribute('aria-pressed', String(showCharacter));
        dom.charToggle.title = showCharacter ? 'Hide Height Reference' : 'Show Height Reference';
    }
}
