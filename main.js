/* ---------------------------------
   Imports & Dependencies
--------------------------------- */

import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { Timer } from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

/* ---------------------------------
   DOM Elements & Caching
--------------------------------- */
const dom = {
    canvasContainer: document.getElementById('canvas-container'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    uiPanel: document.getElementById('ui-panel'),
    pocketColor: document.getElementById('pocket-color'),
    pocketColorTrigger: document.getElementById('pocket-color-trigger'),
    pocketColorValue: document.getElementById('pocket-color-value'),
    pocketColorSwatch: document.getElementById('pocket-color-swatch'),
    playPause: document.getElementById('play-pause'),
    generatePdf: document.getElementById('generate-pdf'),
    cameraWrapper: document.getElementById('camera-wrapper'),
    cameraActions: document.getElementById('camera-actions'),
    turntableToggle: document.getElementById('turntable-toggle'),
    envToggle: document.getElementById('env-toggle'),
    envPanel: document.getElementById('env-panel'),
    envExposure: document.getElementById('env-exposure'),
    envRotate: document.getElementById('env-rotate'),
    envReset: document.getElementById('env-reset'),
    arContainer: document.getElementById('ar-container'),
    toastRegion: document.getElementById('toast-region'),
    arOverlay: document.getElementById('ar-overlay'),
    stopArBtn: document.getElementById('stop-ar-btn'),
    cameraButtons: Array.from(document.querySelectorAll('#camera-controls button'))
};

/* ---------------------------------
   Configuration & Options
--------------------------------- */
const sideConfigs = {
    artwork: {
        label: 'Artwork',
        input: document.getElementById('artwork-upload'),
        dropzone: document.getElementById('artwork-dropzone'),
        titleElement: document.querySelector('#artwork-dropzone .upload-title'),
        subtitleElement: document.querySelector('#artwork-dropzone .upload-subtitle'),
        defaultTitle: 'Drop artwork here',
        actionsWrapper: document.getElementById('artwork-actions-wrapper'),
        actions: document.getElementById('artwork-actions'),
        transformsWrapper: document.getElementById('artwork-transforms-wrapper'),
        transforms: document.getElementById('artwork-transforms'),
        thumbFrame: document.getElementById('artwork-thumb-frame'),
        thumb: document.getElementById('artwork-thumb'),
        resetButton: document.getElementById('reset-artwork-tex'),
        clearButton: document.getElementById('clear-artwork'),
        scaleInput: document.getElementById('artwork-scale'),
        xInput: document.getElementById('artwork-x'),
        yInput: document.getElementById('artwork-y'),
        material: null,
        originalMap: null,
        uploadedTexture: null,
        previewUrl: null,
        fileName: null
    }
};

/* ---------------------------------
   Configurator State & UI Logic
--------------------------------- */
export const configState = {
    size: 'Beach flag Convex L',
    printing: 'Double Sided',
    direction: 'Right',
    poleCoverColor: '#000000',
    pole: 'With Pole',
    base: 'Cross base-grey'
};

let applyConfigCounter = 0;
let pricingData = null;

async function fetchPricingData() {
    if (pricingData) return pricingData;
    try {
        const response = await fetch('assets/prices.json');
        pricingData = await response.json();
    } catch (e) {
        console.error('Failed to load pricing data', e);
    }
    return pricingData;
}

function updateDynamicPrices() {
    if (!pricingData) return;

    const sizeMapping = {
        'Beach flag Convex XS': 'xs',
        'Beach flag Convex S': 'S',
        'Beach flag Convex M': 'M',
        'Beach flag Convex M-Extra Wide': 'M-Wide',
        'Beach flag Convex L': 'l'
    };

    const sizeKey = sizeMapping[configState.size] || configState.size.split(' ').pop();

    const printingMapping = {
        'Single Sided': 'singleSided',
        'Double Sided': 'doubleSided',
        'Air Textile': 'airTextile'
    };
    const printKey = printingMapping[configState.printing] || 'singleSided';

    const baseMapping = {
        'Luxury cross base': 'Luxury cross base',
        'Cross base-grey': 'Cross base, grey',
        'Cross base-black': 'Cross base, black'
    };

    let sizePrice = 0;
    let printingAddon = 0;
    let poleAddon = 0;
    let basePrice = 0;

    const flagOnlyTier = pricingData.pricingTiers.flagOnly.find(item => item.size === sizeKey);
    const hwTier = pricingData.pricingTiers.completeWithHardware.find(item => item.size === sizeKey);

    if (flagOnlyTier) {
        sizePrice = flagOnlyTier.singleSided;
        printingAddon = flagOnlyTier[printKey] - flagOnlyTier.singleSided;
    }

    if (configState.pole === 'With Pole') {
        if (hwTier && flagOnlyTier) {
            poleAddon = hwTier[printKey] - flagOnlyTier[printKey];
        }
    }

    if (configState.base !== 'No base') {
        const mappedBase = baseMapping[configState.base];
        if (mappedBase && pricingData.pricingTiers.bases[mappedBase]) {
            basePrice = pricingData.pricingTiers.bases[mappedBase];
        }
    }

    // Update the DOM cards
    const cards = document.querySelectorAll('.config-card');
    cards.forEach(card => {
        const category = card.dataset.category;
        const value = card.dataset.value;
        let cardPrice = 0;

        if (category === 'size') {
            const cardSizeKey = sizeMapping[value] || value.split(' ').pop();
            const cardTier = pricingData.pricingTiers.flagOnly.find(item => item.size === cardSizeKey);
            if (cardTier) cardPrice = cardTier.singleSided;
        } else if (category === 'printing') {
            const cardPrintKey = printingMapping[value] || 'singleSided';
            if (flagOnlyTier) {
                cardPrice = flagOnlyTier[cardPrintKey] - flagOnlyTier.singleSided;
            }
        } else if (category === 'pole') {
            if (value === 'With Pole' && hwTier && flagOnlyTier) {
                cardPrice = hwTier[printKey] - flagOnlyTier[printKey];
            } else {
                cardPrice = 0;
            }
        } else if (category === 'base') {
            if (value === 'No base') {
                cardPrice = 0;
            } else {
                const cardMappedBase = baseMapping[value];
                if (cardMappedBase && pricingData.pricingTiers.bases[cardMappedBase]) {
                    cardPrice = pricingData.pricingTiers.bases[cardMappedBase];
                }
            }
        }

        // Only add price format if we have a valid category we mapped
        if (['size', 'printing', 'pole', 'base'].includes(category)) {
            const currencySymbol = pricingData.currency || '';
            const formattedPrice = `${currencySymbol} ${cardPrice.toFixed(2)}`.trim();
            card.dataset.price = formattedPrice;

            // If this is the active card, update the section's selection price display
            if (card.classList.contains('is-active')) {
                const section = card.closest('.config-section');
                if (section) {
                    const priceDisplay = section.querySelector('.selection-price');
                    if (priceDisplay) {
                        // For Add-ons like printing, pole, and base, we can show + cost if we want
                        priceDisplay.textContent = (category !== 'size' && cardPrice > 0) ? `+${currencySymbol} ${cardPrice.toFixed(2)}` : formattedPrice;
                    }
                }
            }
        }
    });

    const total = sizePrice + printingAddon + poleAddon + basePrice;
    const totalEl = document.getElementById('total-price-value');
    if (totalEl) {
        const currencySymbol = pricingData.currency || '';
        totalEl.textContent = `${currencySymbol} ${total.toFixed(2)}`.trim();
    }
}

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

export async function applyConfigurationToScene(animateTransition = false, transitionDuration = 800) {
    const currentCounter = ++applyConfigCounter;
    currentCameraSequenceId++; // Cancel any active async camera sequences immediately

    // Stop any running camera transitions immediately
    if (activeCameraTween) {
        activeCameraTween.stop();
        activeCameraTween = null;
        controls.enabled = true;
    }

    // Stop any running size-swap scale tweens immediately and restore clean neutral states
    if (modelRoot) {
        if (modelRoot.userData.scaleTween) {
            modelRoot.userData.scaleTween.stop();
            modelRoot.userData.scaleTween = null;
            controls.enabled = true;
        }
        // Cancel any in-progress pole fade so opacity doesn't get stuck mid-animation
        if (modelRoot.userData.poleFadeTween) {
            modelRoot.userData.poleFadeTween.stop();
            modelRoot.userData.poleFadeTween = null;
        }
        modelRoot.scale.set(1, 1, 1);
        modelRoot.rotation.y = 0;
        modelRoot.updateMatrixWorld(true);
    }

    // Update dynamic prices based on current configState
    updateDynamicPrices();

    // Expand/collapse direction section based on Printing option
    const directionSection = document.getElementById('section-direction');
    if (directionSection) {
        directionSection.classList.toggle('is-visible', configState.printing !== 'Double Sided');
    }

    if (!modelRoot) return;

    // --- NEW LOGIC: Early Exit & Trigger Home View on redundant clicks ---
    const currentConfigStr = JSON.stringify(configState);
    if (modelRoot.userData.lastConfigStr === currentConfigStr) {
        // Configuration hasn't changed. If they clicked the same active size/option, go home.
        if (dom && dom.cameraButtons) {
            const homeBtn = dom.cameraButtons.find(b => b.dataset.view === 'home');
            if (homeBtn && !homeBtn.classList.contains('is-active')) {
                homeBtn.click(); // Safely triggers your UI updates AND moves the camera
            } else if (!homeBtn && typeof focusCameraView === 'function') {
                focusCameraView('home');
            }
        }
        return; // Exit early to prevent re-running the 360 swap animation!
    }
    // Save the new state snapshot for the next click check
    modelRoot.userData.lastConfigStr = currentConfigStr;

    const sizeCode = configState.size.split(' ').pop(); // 'l', 'xs', etc.
    const sizePrefix = sizeCode.toLowerCase();

    // Load VAT data if needed
    let currentVatData = vatCache[sizeCode];
    if (!currentVatData) {
        currentVatData = await loadVATData(sizeCode);
    }

    if (currentCounter !== applyConfigCounter) return; // Stale call

    // Pre-upload textures to the GPU to prevent micro-stutter at the exact moment of the swap
    if (currentVatData && renderer.initTexture) {
        renderer.initTexture(currentVatData.positions);
        renderer.initTexture(currentVatData.normals);
    }

    const performSwap = () => {
        if (currentVatData) {
            // Update global VAT textures
            vatTexture = currentVatData.positions;
            normTexture = currentVatData.normals;

            // Update uniforms for all VAT materials
            vatMaterials.forEach((mat) => {
                if (mat.userData.shader) {
                    if (mat.userData.shader.uniforms.posTexture) {
                        mat.userData.shader.uniforms.posTexture.value = vatTexture;
                    }
                    if (mat.userData.shader.uniforms.normTexture) {
                        mat.userData.shader.uniforms.normTexture.value = normTexture;
                    }
                    if (mat.userData.shader.uniforms.uTotalFrames) {
                        mat.userData.shader.uniforms.uTotalFrames.value = currentVatData.info.frame_count;
                    }
                }
            });
        }

        // First hide everything that belongs to the configurator
        // NOTE: pole meshes are excluded here — their visibility is managed by fadePole() for smooth fading
        modelRoot.traverse((child) => {
            if (!child.isMesh && child.type !== 'Group' && child.type !== 'Object3D') return;
            const lowerName = (child.name || '').toLowerCase();
            if (lowerName.includes('vat') || lowerName.includes('pocket') || lowerName.includes('base') || lowerName.includes('cross')) {
                child.visible = false;
            }
        });

        // Then selectively show and configure based on state
        modelRoot.traverse((child) => {
            const lowerName = (child.name || '').toLowerCase();

            if (lowerName.includes(`${sizePrefix}_vat`) || lowerName.includes(`${sizePrefix}_pocket`)) {
                child.traverse(c => c.visible = true);
            }
            // Pole visibility handled by fadePole() below — skip here
            if (configState.base === 'Luxury cross base' && lowerName.includes('luxury_cross_base')) {
                child.traverse(c => c.visible = true);
            } else if ((configState.base === 'Cross base-grey' || configState.base === 'Cross base-black') && lowerName.includes('cross_base_grey_black')) {
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
        });

        // Apply Dynamic Materials
        const meshes = modelRoot.userData.flagMeshes[sizePrefix];
        const cache = modelRoot.userData.flagMaterialsCache;
        if (meshes && cache && cache[sizePrefix]) {
            const { front, back } = meshes;
            let frontMat, backMat;

            if (configState.printing === 'Double Sided') {
                frontMat = cache[sizePrefix]['ds_right'];
                backMat = cache[sizePrefix]['ds_left'];
            } else if (configState.printing === 'Single Sided') {
                if (configState.direction === 'Right') {
                    frontMat = cache[sizePrefix]['right'];
                    backMat = cache.global['translucent'] || cache.global['air_translucent'];
                } else { // Left
                    frontMat = cache.global['translucent'] || cache.global['air_translucent'];
                    backMat = cache[sizePrefix]['left'];
                }
            } else if (configState.printing === 'Air Textile') {
                if (configState.direction === 'Right') {
                    frontMat = cache[sizePrefix]['right'];
                    backMat = cache.global['air_translucent'] || cache.global['translucent'];
                } else { // Left
                    frontMat = cache.global['air_translucent'] || cache.global['translucent'];
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
                    // For single-sided prints, the opaque material must be DoubleSide to block the background
                    // For double-sided prints, they strictly face outwards to prevent Z-fighting
                    mat.side = isDoubleSided ? side : THREE.DoubleSide;

                    // Add an explicit polygon offset to the back side to prevent grazing-angle Z-fighting 
                    // between the front and back clones of the volumetric mesh
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

                // Inject Air Textile holes logic
                if (isAirTextile && airTexMask) {
                    mat.alphaMap = airTexMask;
                    mat.transparent = true;
                    mat.alphaTest = 0.5;
                } else {
                    mat.alphaMap = null;
                    if (!isTranslucent) {
                        mat.transparent = false;
                    }
                    mat.alphaTest = 0;
                }

                mat.needsUpdate = true;
            };

            applyProps(frontMat, THREE.FrontSide, frontMat && frontMat.name.includes('translucent'));
            applyProps(backMat, THREE.BackSide, backMat && backMat.name.includes('translucent'));

            if (frontMat) front.material = frontMat;
            if (backMat) back.material = backMat;
        }
    };

    if (animateTransition && !state.isInAR) {
        const currentVisualScale = modelRoot.scale.clone();
        const startRotationY = modelRoot.rotation.y || 0;
        const targetRotationY = startRotationY + (Math.PI * 2); 
        
        // --- SCENE ALIGNMENT: Blend turntable rotation back to neutral 0 ---
        const startSceneRotationY = getNormalizedRotationAngle(sceneRoot.rotation.y);
        const endSceneRotationY = 0;
        
        // 2. Measure intrinsic dimension of the currently visible (OLD) model
        modelRoot.scale.set(1, 1, 1);
        modelRoot.updateMatrixWorld(true);
        const intrinsicOldDim = getVisibleMaxDimension();

        // --- CAMERA BLEND: Capture start target and spherical coordinates ---
        const startTarget = controls.target.clone();
        const startSpherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(startTarget));

        // 3. Temporarily apply new visibilities to measure the NEW model's target size
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
            // Pole excluded from bounding box pass — it doesn’t affect flag bounds
            if (configState.base === 'Luxury cross base' && lowerName.includes('luxury_cross_base')) child.traverse(c => c.visible = true);
            else if ((configState.base === 'Cross base-grey' || configState.base === 'Cross base-black') && lowerName.includes('cross_base_grey_black')) child.traverse(c => c.visible = true);
        });

        modelRoot.updateMatrixWorld(true);
        const intrinsicNewDim = getVisibleMaxDimension();

        // --- CAMERA BLEND: Calculate target position for the new model silently ---
        if (typeof updateDynamicCameraTargets === 'function') {
            updateDynamicCameraTargets(false); // Passing false computes math, but doesn't move it
        }
        const activeView = dom.cameraButtons.find(b => b.classList.contains('is-active'))?.dataset.view || 'home';
        const endCameraPos = cameraTargets[activeView] ? cameraTargets[activeView].clone() : cameraTargets.home.clone();
        const endControlsTarget = targetCenter.clone();
        const endSpherical = new THREE.Spherical().setFromVector3(endCameraPos.clone().sub(endControlsTarget));

        while (endSpherical.theta - startSpherical.theta > Math.PI) endSpherical.theta -= Math.PI * 2;
        while (endSpherical.theta - startSpherical.theta < -Math.PI) endSpherical.theta += Math.PI * 2;

        // 4. Restore OLD visibilities and the visual scale for the transition
        modelRoot.traverse(c => {
            if (visibilityMap.has(c.uuid)) c.visible = visibilityMap.get(c.uuid);
        });
        modelRoot.scale.copy(currentVisualScale);
        modelRoot.updateMatrixWorld(true);

        const dimRatio = (intrinsicOldDim > 0 && intrinsicNewDim > 0) ? (intrinsicNewDim / intrinsicOldDim) : 1;

        // 6. The Velocity Handoff + 360 Spin Mask + Camera Blend Transition
        let hasSwapped = false;
        const animState = { progress: 0 };

        controls.enabled = false; // Disable controls during the size-swap showcase transition

        modelRoot.userData.scaleTween = new TWEEN.Tween(animState)
            .to({ progress: 1 }, transitionDuration)
            .easing(TWEEN.Easing.Cubic.InOut) 
            .onUpdate(({ progress }) => {
                const currentScaleAmt = THREE.MathUtils.lerp(1.0, dimRatio, progress);
                modelRoot.rotation.y = THREE.MathUtils.lerp(startRotationY, targetRotationY, progress);
                
                // Smoothly restore base turntable rotation to exactly 0 to match presets
                sceneRoot.rotation.y = THREE.MathUtils.lerp(startSceneRotationY, endSceneRotationY, progress);

                // Seamlessly blend the camera using spherical coordinates to orbit *around* the model
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
                        // Fade pole in or out from the midpoint of the swap
                        fadePole(configState.pole === 'With Pole' ? 1 : 0, 350);
                    }
                    const newModelLocalScale = currentScaleAmt / dimRatio;
                    modelRoot.scale.set(newModelLocalScale, newModelLocalScale, newModelLocalScale);
                }
            })
            .onComplete(() => {
                if (!hasSwapped) performSwap(); 
                
                modelRoot.scale.set(1, 1, 1);
                modelRoot.rotation.y = startRotationY; 
                sceneRoot.rotation.y = 0; // Lock to perfectly forward-facing
                modelRoot.updateMatrixWorld(true);
                modelRoot.userData.scaleTween = null;
                controls.enabled = true;
                controls.update(); // Sync OrbitControls internal state
            })
            .start();

    } else {
        performSwap();
        fadePole(configState.pole === 'With Pole' ? 1 : 0, 350);
        modelRoot.scale.set(1, 1, 1);
        modelRoot.rotation.y = 0;

        if (animateTransition) {
            sceneRoot.rotation.y = 0;
        }

        // If no animation, explicitly jump the camera immediately only if size changed
        if (animateTransition && typeof updateDynamicCameraTargets === 'function') {
            updateDynamicCameraTargets(true);
        }
    }
}


function updateDynamicCameraTargets(moveCamera = true) {
    if (!modelRoot) return;

    // 1. Save current transformations to ensure we calculate neutral, unrotated bounds
    const currentScale = modelRoot.scale.clone();
    const currentRotation = modelRoot.rotation.clone();
    const currentSceneRotation = sceneRoot.rotation.clone();

    // 2. Temporarily lock to neutral 0 degrees to prevent bounding box bloat during spins!
    modelRoot.scale.set(1, 1, 1);
    modelRoot.rotation.set(0, 0, 0);
    sceneRoot.rotation.set(0, 0, 0);
    modelRoot.updateMatrixWorld(true);
    sceneRoot.updateMatrixWorld(true);

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
                current = current.parent;
            }
            if (isVisible && child.geometry) {
                child.geometry.computeBoundingBox();
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

    // 3. Restore transformations instantly
    modelRoot.scale.copy(currentScale);
    modelRoot.rotation.copy(currentRotation);
    sceneRoot.rotation.copy(currentSceneRotation);
    modelRoot.updateMatrixWorld(true);
    sceneRoot.updateMatrixWorld(true);

    if (hasVisibleMesh && !box.isEmpty()) {
        box.getCenter(targetCenter);
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let fitDistance = maxDim / (2 * Math.tan(fov / 2));

        cameraDistance = fitDistance * 1.2;

        cameraTargets.home.set(targetCenter.x + cameraDistance * 0.3, targetCenter.y + size.y * 0.2, targetCenter.z + cameraDistance);
        cameraTargets.front.set(targetCenter.x, targetCenter.y, targetCenter.z + cameraDistance);
        cameraTargets.back.set(targetCenter.x, targetCenter.y, targetCenter.z - cameraDistance);
        cameraTargets.left.set(targetCenter.x - cameraDistance, targetCenter.y, targetCenter.z);
        cameraTargets.right.set(targetCenter.x + cameraDistance, targetCenter.y, targetCenter.z);

        // 4. Only jump the camera if requested (Prevents overriding our smooth spin tween)
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

let currentCameraSequenceId = 0;
let activeCameraTween = null;

async function runPrintingCameraSequence() {
    currentCameraSequenceId++;
    const sequenceId = currentCameraSequenceId;

    const primaryView = (configState.printing === 'Double Sided') ? 'front' : ((configState.direction === 'Left') ? 'back' : 'front');
    const secondaryView = (configState.printing === 'Double Sided') ? 'back' : ((configState.direction === 'Left') ? 'front' : 'back');

    // Step 1: Primary view
    focusCameraView(primaryView, 800, true);
    await new Promise(resolve => setTimeout(resolve, 850));
    if (sequenceId !== currentCameraSequenceId) return;

    // Step 2: Secondary View
    focusCameraView(secondaryView, 800, true);
    await new Promise(resolve => setTimeout(resolve, 850));
    if (sequenceId !== currentCameraSequenceId) return;

    // Step 3: Wait 1 second at secondary view
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (sequenceId !== currentCameraSequenceId) return;

    // Step 4: Primary view again
    focusCameraView(primaryView, 800, true);
}

async function runDirectionCameraSequence(direction) {
    currentCameraSequenceId++;
    if (direction === 'Right') {
        focusCameraView('front', 800, false);
    } else if (direction === 'Left') {
        focusCameraView('back', 800, false);
    }
}

function initConfiguratorUI() {
    const sections = document.querySelectorAll('.config-section');

    sections.forEach(section => {
        const track = section.querySelector('.carousel-track');
        const cards = section.querySelectorAll('.config-card');
        const nameDisplay = section.querySelector('.selection-name');
        const priceDisplay = section.querySelector('.selection-price');
        const leftArrow = section.querySelector('.left-arrow');
        const rightArrow = section.querySelector('.right-arrow');

        if (track && leftArrow && rightArrow) {
            const scrollAmount = 150;
            leftArrow.addEventListener('click', () => track.scrollBy({ left: -scrollAmount, behavior: 'smooth' }));
            rightArrow.addEventListener('click', () => track.scrollBy({ left: scrollAmount, behavior: 'smooth' }));

            const updateArrows = () => {
                const maxScroll = track.scrollWidth - track.clientWidth;
                leftArrow.classList.toggle('is-hidden', track.scrollLeft <= 5);
                rightArrow.classList.toggle('is-hidden', maxScroll <= 1 || track.scrollLeft >= maxScroll - 5);
            };

            track.addEventListener('scroll', updateArrows);
            window.addEventListener('resize', updateArrows);

            // Initial check
            // Use requestAnimationFrame or setTimeout to let layout calculate
            setTimeout(updateArrows, 100);
        }

        // Set initial active state based on configState
        cards.forEach(card => {
            const category = card.dataset.category;
            const value = card.dataset.value;

            if (category && configState[category] === value) {
                cards.forEach(c => c.classList.remove('is-active'));
                card.classList.add('is-active');
                if (nameDisplay) nameDisplay.textContent = value;
                if (priceDisplay && card.dataset.price) priceDisplay.textContent = card.dataset.price;
            }

            card.addEventListener('click', () => {
                cards.forEach(c => c.classList.remove('is-active'));
                card.classList.add('is-active');

                const category = card.dataset.category;
                const value = card.dataset.value;
                const price = card.dataset.price;

                let sizeChanged = false;
                if (category && category !== 'pole-cover') {
                    if (category === 'size' && configState.size !== value) {
                        sizeChanged = true;
                    }
                    configState[category] = value;
                }

                if (nameDisplay) nameDisplay.textContent = value;
                if (priceDisplay && price) priceDisplay.textContent = price;

                if (category === 'size' || category === 'printing') {
                    stopTurntableRotation();
                }

                let swapDuration = 800;
                if (sizeChanged) {
                    if (typeof isZoomedIn !== 'undefined') isZoomedIn = false;
                    preZoomState = null;

                    const primaryView = (configState.printing === 'Double Sided') ? 'front' : ((configState.direction === 'Left') ? 'back' : 'front');
                    const primaryBtn = dom.cameraButtons.find(b => b.dataset.view === primaryView);
                    if (primaryBtn && !primaryBtn.classList.contains('is-active')) {
                        setActiveCameraView(primaryView);
                        swapDuration = 570; // 800 / 1.4 = 571ms (40% faster speed)
                    } else {
                        setActiveCameraView(primaryView);
                    }
                }

                applyConfigurationToScene(sizeChanged, swapDuration);

                if (category === 'printing') {
                    runPrintingCameraSequence();
                } else if (category === 'direction') {
                    runDirectionCameraSequence(value);
                }
            });
        });
    });

    applyConfigurationToScene(false);
}

window.addEventListener('DOMContentLoaded', async () => {
    await fetchPricingData();
    initConfiguratorUI();
});

/* ---------------------------------
   Three.js Core Setup
--------------------------------- */
const scene = new THREE.Scene();
const defaultBackground = new THREE.Color('#e0e0e0');
scene.background = defaultBackground;

const camera = new THREE.PerspectiveCamera(45, getViewportAspect(), 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: false });
renderer.setSize(dom.canvasContainer.clientWidth, dom.canvasContainer.clientHeight);
renderer.setPixelRatio(getClampedPixelRatio());
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
dom.canvasContainer.appendChild(renderer.domElement);

const sceneRoot = new THREE.Group();
scene.add(sceneRoot);

const lightingGroup = new THREE.Group();
scene.add(lightingGroup);

const overheadLight = new THREE.DirectionalLight(0xffffff, 0.6);
overheadLight.position.set(3.5, 6, 5);
overheadLight.castShadow = true;
const isMobileDevice = window.innerWidth < 768 || /Mobi|Android|iPhone/i.test(navigator.userAgent);
const shadowResolution = isMobileDevice ? 1024 : 2048;
overheadLight.shadow.mapSize.width = shadowResolution;
overheadLight.shadow.mapSize.height = shadowResolution;

const d = 3.5;
overheadLight.shadow.camera.left = -d;
overheadLight.shadow.camera.right = d;
overheadLight.shadow.camera.top = d;
overheadLight.shadow.camera.bottom = -d;
overheadLight.shadow.camera.near = 0.5;
overheadLight.shadow.camera.far = 25;
overheadLight.shadow.bias = -0.0001;
overheadLight.shadow.normalBias = 0.05;
overheadLight.shadow.radius = 10;
overheadLight.shadow.blurSamples = 20;

lightingGroup.add(overheadLight);

const shadowGeometry = new THREE.PlaneGeometry(200, 200);
const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.4 });
const shadowCatcher = new THREE.Mesh(shadowGeometry, shadowMaterial);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = 0;
shadowCatcher.receiveShadow = true;

sceneRoot.add(shadowCatcher);
const reticle = createReticle();
scene.add(reticle);

const arController = renderer.xr.getController(0);
arController.addEventListener('select', placeModelFromReticle);
scene.add(arController);

/* ---------------------------------
   Camera Controls & Interaction
--------------------------------- */
let targetCenter = new THREE.Vector3(0, 1.8, 0);
let cameraHome = new THREE.Vector3(2, 2, 6);
let cameraDistance = 5.5;
const turntableSpeed = THREE.MathUtils.degToRad(26);
let cameraTargets = {
    home: cameraHome.clone(),
    front: new THREE.Vector3(0, targetCenter.y, cameraDistance),
    back: new THREE.Vector3(0, targetCenter.y, -cameraDistance),
    left: new THREE.Vector3(-cameraDistance, targetCenter.y, 0),
    right: new THREE.Vector3(cameraDistance, targetCenter.y, 0)
};
const exportRenderSize = 2048;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN
};
controls.minPolarAngle = 0.05; // Avoid top vertical singularity jitter
controls.maxPolarAngle = Math.PI - 0.05; // Avoid bottom vertical singularity jitter
controls.target.copy(targetCenter);
camera.position.copy(cameraHome);
controls.update();
controls.saveState();

function bindOrbitPresetClearOnUserAdjust() {
    const canvas = renderer.domElement;
    const onUserAdjust = () => {
        if (state.isInAR || !state.ready || state.isExporting) return;
        setActiveCameraView(null);
        currentCameraSequenceId++;
    };
    controls.addEventListener('start', onUserAdjust);
    canvas.addEventListener('wheel', onUserAdjust, { passive: true });
}
bindOrbitPresetClearOnUserAdjust();

let lastTapTime = 0;
let isZoomedIn = false;
let preZoomState = null;
const raycaster = new THREE.Raycaster();
const raycastPointer = new THREE.Vector2();

function handleDoubleTapZoom(event) {
    if (state.isInAR || !state.ready || state.isExporting || !modelRoot) return;
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
            const intersects = raycaster.intersectObject(modelRoot, true);

            if (intersects.length > 0) {
                zoomInSmoothly(intersects[0].point);
            }
        }
        lastTapTime = 0;
    } else {
        lastTapTime = currentTime;
    }
}

function zoomInSmoothly(hitPoint) {
    isZoomedIn = true;

    if (activeCameraTween) {
        activeCameraTween.stop();
        activeCameraTween = null;
        controls.enabled = true;
    }

    controls.enabled = false; // Disable controls to prevent damping drift/user dragging during transition

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
            controls.enabled = true; // Re-enable controls
            controls.update(); // Synchronize OrbitControls internal state
        })
        .start();

    setActiveCameraView(null);
    if (state.turntableEnabled) {
        stopTurntableRotation();
    }
}

function zoomOutSmoothly() {
    isZoomedIn = false;
    if (!preZoomState) return;

    if (activeCameraTween) {
        activeCameraTween.stop();
        activeCameraTween = null;
        controls.enabled = true;
    }

    controls.enabled = false; // Disable controls to prevent damping drift/user dragging during transition

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
            controls.enabled = true; // Re-enable controls
            controls.update(); // Synchronize OrbitControls internal state
        })
        .start();
}

renderer.domElement.addEventListener('pointerdown', handleDoubleTapZoom);

/* ---------------------------------
   Global Variables & State
--------------------------------- */
const defaultPreviewState = {
    activeView: 'home',
    turntableEnabled: true,
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

const timer = new Timer();
const textureLoader = new THREE.TextureLoader();
const modelLoader = new GLTFLoader();
const environmentLoader = new HDRLoader();
const exrLoader = new EXRLoader();
exrLoader.setDataType(THREE.FloatType);

let vatTexture = null;
let normTexture = null;
const vatMaterials = [];
const vatCache = {};
const vatLoadPromises = {};

export async function loadVATData(sizeCode) {
    if (vatCache[sizeCode]) return vatCache[sizeCode];
    if (vatLoadPromises[sizeCode]) return vatLoadPromises[sizeCode];

    vatLoadPromises[sizeCode] = (async () => {
        try {
            const [pTex, nTex, infoRes] = await Promise.all([
                new Promise((resolve, reject) => exrLoader.load(`3d/vat/${sizeCode.toLowerCase()}/positions.exr`, resolve, undefined, reject)),
                new Promise((resolve, reject) => exrLoader.load(`3d/vat/${sizeCode.toLowerCase()}/normals.exr`, resolve, undefined, reject)),
                fetch(`3d/vat/${sizeCode.toLowerCase()}/info.json`)
            ]);

            const info = await infoRes.json();

            pTex.minFilter = THREE.NearestFilter;
            pTex.magFilter = THREE.NearestFilter;
            pTex.wrapS = THREE.RepeatWrapping;
            pTex.wrapT = THREE.RepeatWrapping;
            pTex.generateMipmaps = false;

            nTex.minFilter = THREE.NearestFilter;
            nTex.magFilter = THREE.NearestFilter;
            nTex.wrapS = THREE.RepeatWrapping;
            nTex.wrapT = THREE.RepeatWrapping;
            nTex.generateMipmaps = false;

            vatCache[sizeCode] = { positions: pTex, normals: nTex, info };
            return vatCache[sizeCode];
        } catch (e) {
            console.error(`Failed to load VAT data for ${sizeCode}`, e);
            return null;
        } finally {
            if (state && state.ready) {
                dom.loadingOverlay.classList.toggle('is-visible', false);
            }
            delete vatLoadPromises[sizeCode];
        }
    })();

    return vatLoadPromises[sizeCode];
}


let pocketMaterial = null;
let modelRoot = null;
let environmentTexture = null;
let action = null;
let isPlaying = true;
let accumulatedTime = 0;

let pocketColorPickr = null;
let exportRenderer = null;
let exportCamera = null;
let hitTestSource = null;
let hitTestSourceRequested = false;
let envPanelHideTimer = null;
let envPanelShouldBeOpen = false;
let postArRestoreTimer = null;
let previewStateBeforeAR = null;

const activeToasts = [];

const state = {
    modelLoaded: false,
    modelFailed: false,
    environmentResolved: false,
    environmentLoaded: false,
    ready: false,
    isExporting: false,
    isInAR: false,
    turntableEnabled: true,
    arUnsupported: false,
    arSupportResolved: false,
    arSupported: false,
    arUnsupportedToastShown: false
};

const pdfButtonMarkup = dom.generatePdf.innerHTML;
const pdfLibraryAvailable = typeof window.jspdf !== 'undefined' && typeof window.jspdf.jsPDF === 'function';
const mobileViewportMediaQuery = window.matchMedia('(max-width: 768px)');
const pocketColorPickrLayoutState = { restoreStyleText: null };
const arButtonIconMarkup = `
    <img src="icons/ar.svg" alt="" aria-hidden="true" data-ar-icon="true" class="control-icon">
`;

/* ---------------------------------
   AR Initialization
--------------------------------- */
const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: dom.arOverlay }
});
arButton.hidden = true;
dom.arContainer.hidden = true;
dom.arContainer.appendChild(arButton);
syncARButtonLabel();

dom.stopArBtn.addEventListener('click', () => {
    const session = renderer.xr.getSession();
    if (session) session.end();
});

const arButtonLabelObserver = new MutationObserver(syncARButtonLabel);
arButtonLabelObserver.observe(arButton, { childList: true, characterData: true, subtree: true });

let arDisabledFallback = null;

/* ---------------------------------
   Bootstrapping
--------------------------------- */
bindUploadInputs();
bindTransformInputs();
bindUIEvents();
initializePocketColorPicker();
syncControlAvailability();
setLoadingState(true, 'Loading 3D assets...');
setActiveCameraView('home');
syncPlayPauseButton();

initializeARSupport();
loadEnvironment();
loadModel();
renderer.xr.addEventListener('sessionstart', onARSessionStart);
renderer.xr.addEventListener('sessionend', onARSessionEnd);
renderer.setAnimationLoop(renderFrame);

/* ---------------------------------
   Utility Functions
--------------------------------- */
function getViewportAspect() {
    const width = dom.canvasContainer.clientWidth || window.innerWidth;
    const height = dom.canvasContainer.clientHeight || window.innerHeight;
    return width / Math.max(height, 1);
}

function getClampedPixelRatio() {
    return Math.min(window.devicePixelRatio || 1, 2);
}

function createReticle() {
    const geometry = new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0xdf8d43,
        transparent: true,
        opacity: 0.92
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    return mesh;
}

function setLoadingState(visible, message) {
    dom.loadingText.textContent = message;
    dom.loadingOverlay.classList.toggle('is-visible', visible);
}

function getNormalizedRotationAngle(angle) {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

function fadePole(targetOpacity, duration = 350) {
    if (!modelRoot || !modelRoot.userData.poleMeshes) return;
    const poleMeshes = modelRoot.userData.poleMeshes;
    if (!poleMeshes.length) return;

    // Stop any running pole fade tween
    if (modelRoot.userData.poleFadeTween) {
        modelRoot.userData.poleFadeTween.stop();
        modelRoot.userData.poleFadeTween = null;
    }

    // Get current opacity from first pole material (they all share the same opacity)
    let currentOpacity = 1.0;
    const firstMat = Array.isArray(poleMeshes[0].material) ? poleMeshes[0].material[0] : poleMeshes[0].material;
    if (firstMat) currentOpacity = firstMat.opacity;

    // Make pole visible before fading in
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
        })
        .onComplete(() => {
            // Hide completely after fade out to stop rendering invisible geometry
            if (targetOpacity === 0) {
                poleMeshes.forEach(mesh => { mesh.visible = false; });
            }
            modelRoot.userData.poleFadeTween = null;
        })
        .start();
}

function truncateFileName(fileName, containerElement) {
    const extIndex = fileName.lastIndexOf('.');
    const ext = extIndex !== -1 ? fileName.substring(extIndex) : '';
    const name = extIndex !== -1 ? fileName.substring(0, extIndex) : fileName;

    const endChars = 4;
    if (name.length <= endChars + 5) return fileName;
    if (!containerElement) return fileName;

    const canvas = truncateFileName.canvas || (truncateFileName.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    const computedStyle = window.getComputedStyle(containerElement);
    context.font = `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;

    const availableWidth = Math.max(0, containerElement.clientWidth - 24);

    if (context.measureText(fileName).width <= availableWidth) {
        return fileName;
    }

    const endText = `.......${name.substring(name.length - endChars)}${ext}`;
    const endWidth = context.measureText(endText).width;

    let startText = name.substring(0, name.length - endChars);
    while (startText.length > 0 && (context.measureText(startText).width + endWidth > availableWidth)) {
        startText = startText.substring(0, startText.length - 1);
    }

    return `${startText}${endText}`;
}

/* ---------------------------------
   Toast System
--------------------------------- */
function showToast(title, message, tone = 'info', duration = 3200) {
    return new Promise((resolve) => {
        while (activeToasts.length >= 2) dismissToast(activeToasts[0]);

        const priorNodes = Array.from(dom.toastRegion.children);
        const priorRects = priorNodes.map((node) => node.getBoundingClientRect());

        const toast = document.createElement('div');
        toast.className = `toast is-${tone}`;

        const titleNode = document.createElement('span');
        titleNode.className = 'toast-title';
        titleNode.textContent = title;

        const messageNode = document.createElement('span');
        messageNode.className = 'toast-copy';
        messageNode.textContent = message;

        toast.append(titleNode, messageNode);
        toast.resolvePromise = resolve;

        dom.toastRegion.insertBefore(toast, dom.toastRegion.firstChild);
        activeToasts.push(toast);

        priorNodes.forEach((node, index) => {
            const before = priorRects[index];
            const after = node.getBoundingClientRect();
            const deltaY = before.top - after.top;
            if (Math.abs(deltaY) < 0.5) return;

            node.style.transition = 'none';
            node.style.transform = `translateY(${deltaY}px)`;
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    node.style.transition = '';
                    node.style.transform = '';
                });
            });
        });

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (toast.dataset.dismissed !== 'true') toast.classList.add('is-visible');
            });
        });

        toast.hideTimer = window.setTimeout(() => dismissToast(toast), duration);
    });
}

function dismissToast(toast) {
    if (!toast || toast.dataset.dismissed === 'true') return;

    toast.dataset.dismissed = 'true';
    window.clearTimeout(toast.hideTimer);

    const toastIndex = activeToasts.indexOf(toast);
    if (toastIndex !== -1) activeToasts.splice(toastIndex, 1);

    toast.classList.remove('is-visible');
    toast.classList.add('is-hiding');

    window.setTimeout(() => {
        toast.remove();
        if (toast.resolvePromise) toast.resolvePromise();
    }, 400);
}

/* ---------------------------------
   Color Picker
--------------------------------- */
function initializePocketColorPicker() {
    syncPocketColorUi(dom.pocketColor.value);

    if (!window.Pickr) {
        dom.pocketColorTrigger.disabled = true;
        console.error('Pickr failed to load.');
        return;
    }

    pocketColorPickr = window.Pickr.create({
        el: dom.pocketColorTrigger,
        container: 'body',
        theme: 'nano',
        default: dom.pocketColor.value,
        useAsButton: true,
        autoReposition: true,
        position: 'bottom-middle',
        closeOnScroll: true,
        components: {
            preview: true,
            opacity: false,
            hue: true,
            interaction: {
                hex: true,
                input: true,
                save: true
            }
        }
    });

    pocketColorPickr
        .on('show', () => {
            dom.pocketColorTrigger.setAttribute('aria-expanded', 'true');
            if (mobileViewportMediaQuery.matches) {
                queuePocketColorPickerLayout();
            } else {
                restorePocketColorPickerNativeLayout();
            }
        })
        .on('hide', () => {
            dom.pocketColorTrigger.setAttribute('aria-expanded', 'false');
            if (!mobileViewportMediaQuery.matches) restorePocketColorPickerNativeLayout();
        })
        .on('change', (color) => {
            const hex = pickrColorToHex(color);
            if (hex) syncPocketColorUi(hex);
        })
        .on('save', (color, pickr) => {
            const hex = pickrColorToHex(color);
            if (hex) syncPocketColorUi(hex);
            pickr.hide();
        });
}

function queuePocketColorPickerLayout() {
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => syncPocketColorPickerLayout());
    });
}

function syncPocketColorPickerLayout() {
    if (!pocketColorPickr) return;
    const pickrRoot = pocketColorPickr.getRoot();
    const app = pickrRoot?.app;
    if (!app || !pocketColorPickr.isOpen()) return;
    if (!mobileViewportMediaQuery.matches) return;

    if (!app.classList.contains('is-bottom-sheet')) {
        pocketColorPickrLayoutState.restoreStyleText = app.getAttribute('style');
    }

    const panelRect = dom.uiPanel.getBoundingClientRect();
    const viewportPadding = 12;
    const availableWidth = Math.max(Math.min(panelRect.width - 24, window.innerWidth - (viewportPadding * 2)), 1);
    const availableHeight = Math.max(panelRect.height - 24, 1);
    const width = Math.min(320, availableWidth);
    const naturalWidth = Math.max(app.offsetWidth || width, 1);
    const naturalHeight = Math.max(app.offsetHeight || 1, 1);
    const scale = THREE.MathUtils.clamp(
        Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight),
        0.68,
        1
    );
    const centerX = panelRect.left + (panelRect.width / 2);
    const centerY = panelRect.top + (panelRect.height / 2);

    app.classList.add('is-bottom-sheet');
    app.style.left = `${centerX}px`;
    app.style.top = `${centerY}px`;
    app.style.right = 'auto';
    app.style.bottom = 'auto';
    app.style.width = `${width}px`;
    app.style.maxWidth = `${availableWidth}px`;
    app.style.maxHeight = `${Math.max(availableHeight / scale, 180)}px`;
    app.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
}

function restorePocketColorPickerNativeLayout() {
    if (!pocketColorPickr) return;
    const pickrRoot = pocketColorPickr.getRoot();
    const app = pickrRoot?.app;
    if (!app || !app.classList.contains('is-bottom-sheet')) return;

    app.classList.remove('is-bottom-sheet');

    if (pocketColorPickrLayoutState.restoreStyleText) {
        app.setAttribute('style', pocketColorPickrLayoutState.restoreStyleText);
    } else {
        app.removeAttribute('style');
    }
    pocketColorPickrLayoutState.restoreStyleText = null;
}

function pickrColorToHex(color) {
    if (!color) return null;
    const [red, green, blue] = color.toHEXA();
    return normalizeHex(`#${[red, green, blue]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`);
}

function syncPocketColorUi(hex) {
    const normalizedHex = normalizeHex(hex);
    if (!normalizedHex) return;

    dom.pocketColor.value = normalizedHex;
    if (dom.pocketColorValue) dom.pocketColorValue.textContent = normalizedHex;
    if (dom.pocketColorSwatch) dom.pocketColorSwatch.style.background = normalizedHex;

    const poleCoverName = document.querySelector('#section-pole-cover .selection-name');
    if (poleCoverName) {
        poleCoverName.textContent = normalizedHex;
        poleCoverName.style.color = normalizedHex;
    }

    if (typeof configState !== 'undefined') {
        configState.poleCoverColor = normalizedHex;
        if (typeof applyConfigurationToScene === 'function') {
            applyConfigurationToScene();
        }
    }

    if (pocketMaterial) {
        pocketMaterial.color.set(normalizedHex);
    }
}

function normalizeHex(value) {
    const trimmedValue = value.trim();
    const withHash = trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`;
    const shortMatch = /^#([\da-fA-F]{3})$/;
    const fullMatch = /^#([\da-fA-F]{6})$/;

    if (fullMatch.test(withHash)) return withHash.toUpperCase();

    const shortResult = withHash.match(shortMatch);
    if (!shortResult) return null;

    const expanded = shortResult[1]
        .split('')
        .map((character) => `${character}${character}`)
        .join('');

    return `#${expanded}`.toUpperCase();
}

/* ---------------------------------
   State Management & Syncing
--------------------------------- */
async function syncReadyState() {
    if (state.modelFailed || state.ready) {
        syncControlAvailability();
        return;
    }

    if (!state.modelLoaded || !state.environmentResolved) {
        syncControlAvailability();
        return;
    }

    state.ready = true;
    setLoadingState(false, '');
    syncControlAvailability();
    syncARVisibility();

    if (!pdfLibraryAvailable) {
        await showToast('Preview ready', 'Artwork tools are ready, but PDF export is currently unavailable.', 'info', 4000);
    } else {
        await showToast('Preview ready', 'You can now upload artwork, tune the preview, and export a proof.', 'success');
    }

    if (state.arUnsupported && !state.arUnsupportedToastShown) {
        state.arUnsupportedToastShown = true;
        showToast('AR unavailable', 'This device or browser does not support AR preview.', 'info', 3600);
    }
}

function syncControlAvailability() {
    const baseEnabled = state.ready && !state.modelFailed && !state.isExporting && !state.isInAR;

    dom.uiPanel.classList.toggle('is-disabled', !baseEnabled);
    dom.pocketColor.disabled = !baseEnabled;
    dom.pocketColorTrigger.disabled = !baseEnabled;
    const hasAnimation = Boolean(action || vatMaterials.length > 0);
    dom.playPause.disabled = !baseEnabled || !hasAnimation;
    dom.generatePdf.disabled = !baseEnabled || !pdfLibraryAvailable;

    dom.cameraButtons.forEach((button) => {
        button.disabled = !baseEnabled;
    });
    dom.turntableToggle.disabled = !baseEnabled;

    const environmentEnabled = baseEnabled && state.environmentLoaded;
    dom.envToggle.disabled = !environmentEnabled;
    dom.envExposure.disabled = !environmentEnabled;
    dom.envRotate.disabled = !environmentEnabled;
    dom.envReset.disabled = !environmentEnabled;

    if (!environmentEnabled) setEnvPanelOpen(false);

    if (pocketColorPickr) {
        if (baseEnabled) {
            pocketColorPickr.enable();
        } else {
            pocketColorPickr.hide();
            pocketColorPickr.disable();
        }
    }

    syncARVisibility();
    syncTurntableButton();
    syncSideUi('artwork');
}

function syncSideUi(side) {
    const config = sideConfigs[side];
    const canInteract = state.ready && !state.modelFailed && !state.isExporting && !state.isInAR;
    const hasUpload = Boolean(config.uploadedTexture);

    config.input.disabled = !canInteract;
    config.resetButton.disabled = !canInteract || !hasUpload;
    config.clearButton.disabled = !canInteract || !hasUpload;

    if (config.actionsWrapper) config.actionsWrapper.classList.toggle('is-visible', hasUpload);
    if (config.transformsWrapper) config.transformsWrapper.classList.toggle('is-visible', hasUpload);

    config.thumbFrame.hidden = !config.previewUrl;
    config.subtitleElement.hidden = hasUpload;
    config.dropzone.classList.toggle('is-disabled', !canInteract);
    config.dropzone.setAttribute('aria-disabled', String(!canInteract));
    config.dropzone.tabIndex = canInteract ? 0 : -1;
}

function syncARButtonLabel() {
    if (state.arUnsupported || !arButton.isConnected) return;
    if (!arButton.querySelector('[data-ar-icon="true"]')) arButton.innerHTML = arButtonIconMarkup;
    arButton.setAttribute('aria-label', 'Start AR');
    arButton.title = 'Start AR';
}

function ensureArDisabledFallback() {
    if (arDisabledFallback?.isConnected) return;

    arDisabledFallback = document.createElement('button');
    arDisabledFallback.type = 'button';
    arDisabledFallback.id = 'ARButton';
    arDisabledFallback.className = 'is-ar-disabled';
    arDisabledFallback.innerHTML = arButtonIconMarkup;
    arDisabledFallback.setAttribute('aria-label', 'AR preview unavailable on this device');
    arDisabledFallback.title = 'AR preview unavailable';
    arDisabledFallback.addEventListener('click', (event) => {
        event.preventDefault();
        showToast('AR unavailable', 'This device or browser does not support AR preview.', 'info', 3600);
    });
    dom.arContainer.appendChild(arDisabledFallback);
}

function syncARVisibility() {
    const showContainer = state.ready && state.arSupportResolved;
    dom.arContainer.hidden = !showContainer;
    if (!showContainer) return;

    if (state.arUnsupported) {
        if (arButton.isConnected) arButton.remove();
        ensureArDisabledFallback();
        return;
    }

    if (arDisabledFallback?.isConnected) {
        arDisabledFallback.remove();
        arDisabledFallback = null;
    }

    if (!arButton.isConnected) dom.arContainer.appendChild(arButton);

    arButton.hidden = false;
    arButton.disabled = state.modelFailed || state.isExporting || state.isInAR;
    syncARButtonLabel();
}

function syncTurntableButton() {
    dom.turntableToggle.classList.toggle('is-active', state.turntableEnabled);
    dom.turntableToggle.setAttribute('aria-pressed', String(state.turntableEnabled));
    dom.turntableToggle.title = state.turntableEnabled ? 'Stop Turntable' : 'Start Turntable';
}

function stopTurntableRotation() {
    if (!state.turntableEnabled) return;
    state.turntableEnabled = false;
    syncTurntableButton();
}

function capturePreviewState() {
    const activeViewButton = dom.cameraButtons.find((button) => button.classList.contains('is-active'));
    return {
        activeView: activeViewButton?.dataset.view ?? null,
        turntableEnabled: state.turntableEnabled,
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

function restorePreviewState(previewState = null) {
    const snapshot = previewState ?? defaultPreviewState;

    TWEEN.removeAll();
    activeCameraTween = null;
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
    state.turntableEnabled = snapshot.turntableEnabled;
    syncTurntableButton();
    setActiveCameraView(snapshot.activeView);
}

function isEnvPanelOpen() {
    return dom.envPanel.classList.contains('is-open');
}

function setEnvPanelOpen(open) {
    envPanelShouldBeOpen = open;
    window.clearTimeout(envPanelHideTimer);

    if (open) {
        dom.envPanel.hidden = false;
        window.requestAnimationFrame(() => {
            if (envPanelShouldBeOpen) dom.envPanel.classList.add('is-open');
        });
        return;
    }

    dom.envPanel.classList.remove('is-open');
    envPanelHideTimer = window.setTimeout(() => {
        if (!isEnvPanelOpen()) dom.envPanel.hidden = true;
    }, 340);
}

/* ---------------------------------
   Asset Loading
--------------------------------- */
function loadEnvironment() {
    environmentLoader.load(
        'assets/studio.hdr',
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            environmentTexture = texture;
            scene.environment = texture;
            state.environmentLoaded = true;
            state.environmentResolved = true;
            syncReadyState();
        },
        undefined,
        () => {
            state.environmentLoaded = false;
            state.environmentResolved = true;
            scene.environment = null;
            showToast('Environment unavailable', 'Studio lighting could not be loaded. Continuing with the default background.', 'error', 4500);
            syncReadyState();
        }
    );
}

/* ---------------------------------
   Asset Loading (Updated for Flement VAT)
--------------------------------- */

function loadModel() {
    const initialSizeCode = configState.size.split(' ').pop(); // e.g. 'l'

    // 1. Load initial VAT Data based on the starting config
    loadVATData(initialSizeCode).then((vatData) => {
        if (vatData) {
            vatTexture = vatData.positions;
            normTexture = vatData.normals;
        }

        // 2. Load the Static GLB
        modelLoader.load(
            '3d/convex.glb',
            (gltf) => {
                modelRoot = gltf.scene;
                sceneRoot.add(modelRoot);
                sceneRoot.visible = !state.isInAR;

                const flagMaterialsCache = { global: {} };
                modelRoot.traverse((child) => {
                    if (child.isMesh && child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => {
                            if (m.name === 'translucent' || m.name === 'air_translucent') {
                                flagMaterialsCache.global[m.name] = m;
                            } else if (m.name.includes('_')) {
                                const size = m.name.split('_')[0];
                                const type = m.name.substring(size.length + 1);
                                if (['ds_right', 'ds_left', 'right', 'left'].includes(type)) {
                                    if (!flagMaterialsCache[size]) flagMaterialsCache[size] = {};
                                    flagMaterialsCache[size][type] = m;
                                }
                            }
                        });
                    }
                });
                modelRoot.userData.flagMaterialsCache = flagMaterialsCache;
                modelRoot.userData.flagMeshes = {};

                // --- POLE FADE SETUP: collect pole meshes and enable transparency for smooth fading ---
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

                sideConfigs.artwork.materials = [];
                const addArtworkMaterial = (m) => {
                    if (!m) return;
                    if (!m.userData.originalMap) m.userData.originalMap = m.map;
                    if (!sideConfigs.artwork.materials.includes(m)) sideConfigs.artwork.materials.push(m);
                };
                // Exclude global translucent materials from receiving uploaded artwork
                Object.keys(flagMaterialsCache).forEach(key => {
                    if (key !== 'global') {
                        Object.values(flagMaterialsCache[key]).forEach(addArtworkMaterial);
                    }
                });

                modelRoot.traverse((child) => {
                    if (child.userData.isBackClone) return;
                    if (!child.isMesh) return;
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.frustumCulled = !child.name.toLowerCase().includes('vat');

                    // --- 0. FIX THREE.JS GLTFLOADER HARD LIMIT (Max 10) ---
                    for (let i = 4; i <= 10; i++) {
                        const oldKey = `texcoord_${i}`;
                        if (child.geometry.attributes[oldKey]) {
                            child.geometry.setAttribute(`uv${i}`, child.geometry.attributes[oldKey]);
                            child.geometry.deleteAttribute(oldKey);
                        }
                    }

                    // --- 1. SMART AUTO-DETECT VAT UV CHANNEL (Max 10) ---
                    let maxUvIndex = 0;
                    for (let i = 1; i <= 10; i++) {
                        if (child.geometry.attributes[`uv${i}`]) {
                            maxUvIndex = i;
                        }
                    }

                    const vatUv = maxUvIndex > 0 ? `uv${maxUvIndex}` : 'uv';

                    // Dynamically detect any mesh containing "vat"
                    const isVatMesh = child.name.toLowerCase().includes('vat');

                    // Isolate the VAT UV into a dedicated attribute to prevent any clashes
                    if (isVatMesh && child.geometry.attributes[vatUv]) {
                        child.geometry.setAttribute('vatPositionUv', child.geometry.attributes[vatUv]);

                        if (!child.customDepthMaterial && vatTexture) {
                            child.customDepthMaterial = new THREE.MeshDepthMaterial({
                                depthPacking: THREE.RGBADepthPacking,
                                alphaTest: 0.5
                            });
                            child.customDepthMaterial.onBeforeCompile = (shader) => {
                                const currentSizeCode = configState.size.split(' ').pop();
                                const currentVatData = vatCache[currentSizeCode];
                                const frameCount = currentVatData ? currentVatData.info.frame_count : 1.0;

                                shader.uniforms.posTexture = { value: vatTexture };
                                shader.uniforms.uTime = { value: 0 };
                                shader.uniforms.uTotalFrames = { value: frameCount };
                                shader.uniforms.uFps = { value: 30.0 };
                                child.customDepthMaterial.userData.shader = shader;
                                if (!vatMaterials.includes(child.customDepthMaterial)) {
                                    vatMaterials.push(child.customDepthMaterial);
                                }

                                let declarations = `
                                    uniform sampler2D posTexture;
                                    uniform float uTime;
                                    uniform float uTotalFrames;
                                    uniform float uFps;
                                    attribute vec2 vatPositionUv;
                                `;
                                for (let i = 4; i <= 10; i++) {
                                    declarations += `attribute vec2 uv${i};\n`;
                                }
                                shader.vertexShader = shader.vertexShader.replace(
                                    '#include <common>',
                                    declarations + '\n#include <common>'
                                );
                                shader.vertexShader = shader.vertexShader.replace(
                                    '#include <begin_vertex>',
                                    `
                                    float frame = mod(uTime * uFps, uTotalFrames) / uTotalFrames;
                                    vec4 texPos = texture2D(posTexture, vec2(vatPositionUv.x, vatPositionUv.y - frame));
                                    vec3 transformed = position;
                                    if (length(texPos.xyz) > 0.0001) {
                                        transformed = texPos.xzy; 
                                    }
                                    `
                                );
                            };
                        }
                    }

                    const materials = Array.isArray(child.material) ? child.material : [child.material];

                    materials.forEach((material) => {
                        if (material.name.endsWith('_ds_right')) {
                            const size = material.name.split('_')[0]; // e.g., 'l' or 'xs'

                            if (!sideConfigs.artwork.material) {
                                sideConfigs.artwork.material = material;
                            }

                            material.side = THREE.FrontSide;
                            const backMesh = child.clone();
                            backMesh.userData.isBackClone = true;
                            if (child.customDepthMaterial) {
                                backMesh.customDepthMaterial = child.customDepthMaterial;
                            }
                            if (child.customDistanceMaterial) {
                                backMesh.customDistanceMaterial = child.customDistanceMaterial;
                            }

                            let backMaterial;
                            if (flagMaterialsCache[size] && flagMaterialsCache[size]['ds_left']) {
                                backMaterial = flagMaterialsCache[size]['ds_left'];
                            } else {
                                backMaterial = material.clone();
                                backMaterial.name = material.name + '_back';
                                backMaterial.color.setHex(0x000000);
                                if (!backMaterial.userData.originalMap) backMaterial.userData.originalMap = backMaterial.map;
                                sideConfigs.artwork.materials.push(backMaterial);
                            }
                            backMaterial.side = THREE.BackSide;

                            backMesh.material = backMaterial;
                            child.parent.add(backMesh);

                            modelRoot.userData.flagMeshes[size] = { front: child, back: backMesh };
                        }

                        if (material.name === 'pocket') {
                            pocketMaterial = material;
                        }
                    });

                    // Inject VAT into all materials 
                    if (isVatMesh && vatTexture && normTexture) {
                        const allFlagMats = [];
                        Object.values(flagMaterialsCache.global).forEach(m => { if (m) allFlagMats.push(m); });
                        Object.keys(flagMaterialsCache).forEach(key => {
                            if (key !== 'global') {
                                Object.values(flagMaterialsCache[key]).forEach(m => { if (m) allFlagMats.push(m); });
                            }
                        });

                        allFlagMats.forEach(mat => {
                            if (!vatMaterials.includes(mat)) {
                                vatMaterials.push(mat);
                            }

                            if (mat.userData.shaderInjected) return; // Prevent double injection
                            mat.userData.shaderInjected = true;

                            mat.onBeforeCompile = (shader) => {
                                const currentSizeCode = configState.size.split(' ').pop();
                                const currentVatData = vatCache[currentSizeCode];
                                const frameCount = currentVatData ? currentVatData.info.frame_count : 1.0;

                                shader.uniforms.posTexture = { value: vatTexture };
                                shader.uniforms.normTexture = { value: normTexture };
                                shader.uniforms.uTime = { value: 0 };
                                shader.uniforms.uTotalFrames = { value: frameCount };
                                shader.uniforms.uFps = { value: 30.0 };

                                mat.userData.shader = shader;

                                // --- 2. DYNAMIC SHADER DECLARATIONS ---
                                let declarations = `
                                uniform sampler2D posTexture;
                                uniform sampler2D normTexture;
                                uniform float uTime;
                                uniform float uTotalFrames;
                                uniform float uFps;
                                attribute vec2 vatPositionUv; // Isolated VAT UV
                            `;

                                for (let i = 4; i <= 10; i++) {
                                    declarations += `attribute vec2 uv${i};\n`;
                                }

                                shader.vertexShader = shader.vertexShader.replace(
                                    '#include <common>',
                                    declarations + '\n#include <common>'
                                );

                                // NORMAL INJECTION
                                shader.vertexShader = shader.vertexShader.replace(
                                    '#include <beginnormal_vertex>',
                                    `
                                #include <beginnormal_vertex>
                                
                                // Calculate the frame exactly once
                                float frame = mod(uTime * uFps, uTotalFrames) / uTotalFrames;
                                vec2 finalUv = vec2(vatPositionUv.x, vatPositionUv.y - frame);
                                
                                // Sample Normal Texture
                                vec4 texNorm = texture2D(normTexture, finalUv);
                                
                                // If we have actual normal data (not the fallback 0,0,0)
                                if (length(texNorm.xyz) > 0.0001) {
                                    // Unpack normal from (0 to 1) back to (-1 to 1)
                                    vec3 unpackedNormal = texNorm.xyz * 2.0 - 1.0;
                                    // Swizzle to match the position orientation
                                    objectNormal = unpackedNormal.xzy; 
                                }
                                `
                                );

                                // POSITION INJECTION
                                shader.vertexShader = shader.vertexShader.replace(
                                    '#include <begin_vertex>',
                                    `
                                #include <begin_vertex>
                                
                                vec4 texPos = texture2D(posTexture, finalUv);
                                
                                if (length(texPos.xyz) > 0.0001) {
                                    transformed = texPos.xzy; 
                                }
                                `
                                );
                            };
                        });
                    }
                });
                renderer.shadowMap.needsUpdate = true;

                // --- SHADER PRE-COMPILATION TO PREVENT SIZE-SWAP STUTTER ---
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

                syncPocketColorUi(dom.pocketColor.value);
                state.modelLoaded = true;
                if (typeof applyConfigurationToScene === 'function') {
                    applyConfigurationToScene(false);
                }
                if (typeof updateDynamicCameraTargets === 'function') {
                    updateDynamicCameraTargets(true);
                }
                syncReadyState();
            },
            undefined,
            () => { /* Load Error Handling */ }
        );
    }).catch(err => {
        console.error("VAT textures failed to load:", err);
    });
}

/* ---------------------------------
   UI & Event Bindings
--------------------------------- */
function bindUploadInputs() {
    Object.entries(sideConfigs).forEach(([side, config]) => {
        config.input.addEventListener('change', (event) => {
            const [file] = event.target.files;
            if (file) handleArtworkFile(side, file);
        });

        config.dropzone.addEventListener('keydown', (event) => {
            if (config.input.disabled) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                config.input.click();
            }
        });

        ['dragenter', 'dragover'].forEach((eventName) => {
            config.dropzone.addEventListener(eventName, (event) => {
                event.preventDefault();
                if (config.input.disabled) return;
                config.dropzone.classList.add('is-dragover');
            });
        });

        ['dragleave', 'dragend'].forEach((eventName) => {
            config.dropzone.addEventListener(eventName, () => {
                config.dropzone.classList.remove('is-dragover');
            });
        });

        config.dropzone.addEventListener('drop', (event) => {
            event.preventDefault();
            config.dropzone.classList.remove('is-dragover');
            if (config.input.disabled) return;

            const [file] = event.dataTransfer.files;
            if (file) handleArtworkFile(side, file);
        });

        config.resetButton.addEventListener('click', () => resetTransforms(side));
        config.clearButton.addEventListener('click', () => clearArtwork(side, true));
    });
}

function bindTransformInputs() {
    Object.entries(sideConfigs).forEach(([side, config]) => {
        [config.scaleInput, config.xInput, config.yInput].forEach((input) => {
            input.addEventListener('input', () => updateTextureTransforms(side));
        });
    });
}

function bindUIEvents() {
    dom.playPause.addEventListener('click', toggleAnimation);
    dom.generatePdf.addEventListener('click', generatePdfProof);
    dom.turntableToggle.addEventListener('click', toggleTurntable);

    window.addEventListener('keydown', (event) => {
        const activeTag = document.activeElement?.tagName;
        const isInteractiveFocus = activeTag === 'INPUT' || activeTag === 'BUTTON' || document.activeElement?.classList.contains('upload-card');

        if (event.code === 'Space' && !isInteractiveFocus) {
            event.preventDefault();
            toggleAnimation();
        }
    });

    dom.envToggle.addEventListener('click', () => {
        if (dom.envToggle.disabled) return;
        setEnvPanelOpen(!isEnvPanelOpen());
    });

    document.addEventListener('click', (event) => {
        if (!dom.cameraWrapper.contains(event.target) && isEnvPanelOpen()) {
            setEnvPanelOpen(false);
        }
    });

    dom.envExposure.addEventListener('input', (event) => {
        renderer.toneMappingExposure = Number.parseFloat(event.target.value);
    });

    dom.envRotate.addEventListener('input', (event) => {
        if (!environmentTexture) return;
        const radians = Number.parseFloat(event.target.value);
        scene.environmentRotation.y = radians;
        lightingGroup.rotation.y = radians;
    });

    dom.envReset.addEventListener('click', () => {
        dom.envExposure.value = '1';
        dom.envRotate.value = '0';
        renderer.toneMappingExposure = 1;
        scene.environmentRotation.y = 0;
        lightingGroup.rotation.y = 0;
    });

    dom.cameraButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const view = button.dataset.view;
            if (view !== 'home') stopTurntableRotation();
            focusCameraView(view);
        });
    });

    window.addEventListener('resize', handleResize);
}

/* ---------------------------------
   Artwork & Transform Handlers
--------------------------------- */
async function handleArtworkFile(side, file) {
    const config = sideConfigs[side];

    if (!state.ready || !config.material) {
        showToast('Preview still loading', 'Please wait for the 3D preview to finish loading before uploading artwork.', 'info', 3600);
        return;
    }

    const wasPlaying = isPlaying;
    if (isPlaying) {
        isPlaying = false;
        if (action) action.paused = true;
        syncPlayPauseButton();
    }

    if (state.turntableEnabled) stopTurntableRotation();

    config.dropzone.classList.add('is-loading');
    config.fileName = file.name;

    const restoreAnimation = () => {
        if (wasPlaying) {
            isPlaying = true;
            if (action) action.paused = false;
            syncPlayPauseButton();
        }
    };

    if (file.type === 'application/pdf') {
        if (typeof pdfjsLib === 'undefined') {
            config.dropzone.classList.remove('is-loading');
            restoreAnimation();
            showToast('PDF unavailable', 'The PDF processing library is not loaded right now.', 'error', 4200);
            return;
        }
        showToast('Processing PDF', 'Converting the first page of the PDF to a high-quality image.', 'info', 3000);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1 });

            const scale = 2048 / Math.max(viewport.width, viewport.height);
            const scaledViewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = scaledViewport.height;
            canvas.width = scaledViewport.width;

            await page.render({ canvasContext: context, viewport: scaledViewport }).promise;

            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            file = new File([blob], file.name.replace(/\.pdf$/i, '.png'), { type: 'image/png' });
        } catch (error) {
            console.error('PDF conversion failed:', error);
            config.dropzone.classList.remove('is-loading');
            restoreAnimation();
            showToast('PDF error', 'Failed to read or convert the PDF file.', 'error', 4200);
            return;
        }
    } else if (!/^image\/(png|jpeg)$/.test(file.type)) {
        config.dropzone.classList.remove('is-loading');
        restoreAnimation();
        showToast('Unsupported file', 'Please upload a PNG, JPG, or PDF file.', 'error', 3800);
        return;
    }

    const textureUrl = URL.createObjectURL(file);

    textureLoader.load(
        textureUrl,
        (texture) => {
            URL.revokeObjectURL(textureUrl);

            const previousTexture = config.uploadedTexture;
            const previousPreviewUrl = config.previewUrl;

            texture.flipY = false;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.generateMipmaps = true;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.center.set(0.5, 0.5);

            config.uploadedTexture = texture;
            config.previewUrl = URL.createObjectURL(file);
            config.thumb.src = config.previewUrl;

            if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl);
            if (previousTexture) previousTexture.dispose();

            resetTransformInputs(side);
            updateTextureTransforms(side);
            applySideMaterialMap(side);
            config.dropzone.classList.remove('is-loading');
            syncSideUi(side);
            config.titleElement.textContent = truncateFileName(config.fileName, config.titleElement);
            config.input.value = '';

            restoreAnimation();
            focusCameraView('front');

            showToast('Artwork applied', `${config.label} artwork has been updated successfully.`, 'success');
        },
        undefined,
        () => {
            URL.revokeObjectURL(textureUrl);
            config.input.value = '';
            config.dropzone.classList.remove('is-loading');
            restoreAnimation();
            showToast('Upload failed', `The ${config.label.toLowerCase()} artwork could not be processed.`, 'error', 4200);
        }
    );
}

function applySideMaterialMap(side) {
    const config = sideConfigs[side];
    if (!config.materials || config.materials.length === 0) return;
    config.materials.forEach((material) => {
        material.map = config.uploadedTexture || material.userData.originalMap;
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
    });
}

function clearArtwork(side, announce = false) {
    const config = sideConfigs[side];

    if (config.uploadedTexture) {
        config.uploadedTexture.dispose();
        config.uploadedTexture = null;
    }

    if (config.previewUrl) {
        URL.revokeObjectURL(config.previewUrl);
        config.previewUrl = null;
    }

    config.thumb.removeAttribute('src');
    config.input.value = '';
    config.titleElement.textContent = config.defaultTitle;
    resetTransformInputs(side);
    applySideMaterialMap(side);
    syncSideUi(side);

    if (announce) {
        showToast('Artwork removed', `${config.label} artwork has been cleared from the preview.`, 'info');
    }
}

function resetTransformInputs(side) {
    const config = sideConfigs[side];
    config.scaleInput.value = '1';
    config.xInput.value = '0';
    config.yInput.value = '0';
}

function resetTransforms(side) {
    resetTransformInputs(side);
    updateTextureTransforms(side);
}

function updateTextureTransforms(side) {
    const config = sideConfigs[side];
    if (!config.uploadedTexture) return;

    const scale = Number.parseFloat(config.scaleInput.value);
    const panX = Number.parseFloat(config.xInput.value);
    const panY = Number.parseFloat(config.yInput.value);

    config.uploadedTexture.repeat.set(1 / scale, 1 / scale);
    config.uploadedTexture.offset.set(-panX, panY);
    config.uploadedTexture.needsUpdate = true;
}

/* ---------------------------------
   Actions & Exports
--------------------------------- */
function toggleAnimation() {
    if (dom.playPause.disabled) return;

    isPlaying = !isPlaying;
    if (action) action.paused = !isPlaying;

    if (!isPlaying && state.turntableEnabled) {
        state.turntableEnabled = false;
        syncTurntableButton();
    }
    syncPlayPauseButton();
}

function toggleTurntable() {
    if (dom.turntableToggle.disabled) return;
    state.turntableEnabled = !state.turntableEnabled;
    syncTurntableButton();
}

function syncPlayPauseButton() {
    dom.playPause.classList.toggle('is-paused', !isPlaying);
    dom.playPause.title = isPlaying ? 'Pause Animation' : 'Play Animation';
    dom.playPause.setAttribute('aria-label', isPlaying ? 'Pause Animation' : 'Play Animation');
}

async function generatePdfProof() {
    if (!state.ready || state.isExporting) return;
    if (!pdfLibraryAvailable) {
        showToast('PDF unavailable', 'The PDF export library is not loaded right now.', 'error', 4200);
        return;
    }

    state.isExporting = true;
    syncControlAvailability();
    dom.generatePdf.textContent = 'Generating...';

    const slowGenerationTimer = setTimeout(() => {
        showToast('Generating proof', 'Capturing clean front and back views for the PDF.', 'info', 3000);
    }, 3000);

    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        const savedRotation = sceneRoot.rotation.clone();
        sceneRoot.rotation.set(0, 0, 0);

        scene.updateMatrixWorld(true);

        const frontImage = captureProofView(new THREE.Vector3(0, targetCenter.y, cameraDistance));
        const backImage = captureProofView(new THREE.Vector3(0, targetCenter.y, -cameraDistance));

        sceneRoot.rotation.copy(savedRotation);
        doc.setFontSize(22);
        doc.setTextColor(50, 50, 50);
        doc.text('Probo Configurator - Client Proof', 20, 20);
        doc.setFontSize(12);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 28);
        doc.text(`Pocket color: ${normalizeHex(dom.pocketColor.value) || dom.pocketColor.value}`, 20, 36);

        doc.setFontSize(14);
        doc.text('Front Layout', 20, 45);
        doc.addImage(frontImage, 'JPEG', 20, 50, 110, 110);

        doc.text('Back Layout', 150, 45);
        doc.addImage(backImage, 'JPEG', 150, 50, 110, 110);

        doc.save('Probo_Flag_Proof.pdf');
        showToast('PDF ready', 'The client proof has been downloaded successfully.', 'success');
    } catch (error) {
        console.error(error);
        showToast('PDF export failed', 'Unable to generate the proof. Please try again.', 'error', 4200);
    } finally {
        clearTimeout(slowGenerationTimer);
        dom.generatePdf.innerHTML = pdfButtonMarkup;
        state.isExporting = false;
        syncControlAvailability();
    }
}

function getExportRenderer() {
    if (!exportRenderer) {
        exportRenderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
            logarithmicDepthBuffer: false
        });
        exportRenderer.setSize(exportRenderSize, exportRenderSize, false);
        exportRenderer.setPixelRatio(1);
        exportRenderer.outputColorSpace = THREE.SRGBColorSpace;
        exportRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        exportRenderer.shadowMap.enabled = true;
        exportRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

        exportCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    }

    exportRenderer.toneMappingExposure = renderer.toneMappingExposure;
    return { renderer: exportRenderer, camera: exportCamera };
}

function captureProofView(position) {
    const exportContext = getExportRenderer();
    exportContext.camera.position.copy(position);
    exportContext.camera.lookAt(targetCenter);
    exportContext.renderer.render(scene, exportContext.camera);
    return exportContext.renderer.domElement.toDataURL('image/jpeg', 1.0);
}

/* ---------------------------------
   Camera Transitions
--------------------------------- */
function transitionCamera(targetPosition, duration = 800) {
    if (state.isInAR) return;
    if (activeCameraTween) {
        activeCameraTween.stop();
        activeCameraTween = null;
        controls.enabled = true;
    }

    controls.enabled = false; // Disable controls to prevent damping drift/user dragging during transition

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

    activeCameraTween = new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);
            const radius = THREE.MathUtils.lerp(startSpherical.radius, endSpherical.radius, progress);
            const phi = THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, progress);
            const theta = THREE.MathUtils.lerp(startSpherical.theta, endSpherical.theta, progress);

            sceneRoot.rotation.y = THREE.MathUtils.lerp(startRotationY, endRotationY, progress);
            camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(controls.target);
        })
        .onComplete(() => {
            activeCameraTween = null;
            controls.enabled = true; // Re-enable controls
            controls.update(); // Sync OrbitControls internal state
        })
        .start();
}

function focusCameraView(view, duration = 800, isSequence = false) {
    // Freshly calculate targets with unrotated neutral bounds
    updateDynamicCameraTargets(false);

    const targetPosition = cameraTargets[view];
    if (!targetPosition) return;
    if (typeof isZoomedIn !== 'undefined') isZoomedIn = false;
    preZoomState = null;

    if (!isSequence) {
        currentCameraSequenceId++;
    }

    transitionCamera(targetPosition, duration);
    setActiveCameraView(view);
}

function setActiveCameraView(view) {
    dom.cameraButtons.forEach((button) => {
        const matches = view != null && button.dataset.view === view;
        button.classList.toggle('is-active', matches);
    });
}

function resetDesktopPreviewState() {
    restorePreviewState();
}

/* ---------------------------------
   AR Mode Implementation
--------------------------------- */
function initializeARSupport() {
    if (!navigator.xr) {
        markARUnsupported();
        return;
    }

    navigator.xr.isSessionSupported('immersive-ar')
        .then((supported) => {
            state.arSupportResolved = true;
            if (supported) {
                state.arSupported = true;
                syncARVisibility();
            } else {
                markARUnsupported();
            }
        })
        .catch(() => markARUnsupported());
}

function markARUnsupported() {
    if (state.arUnsupported) return;

    state.arUnsupported = true;
    state.arSupportResolved = true;
    state.arSupported = false;
    arButtonLabelObserver.disconnect();

    if (arButton.isConnected) arButton.remove();
    ensureArDisabledFallback();

    if (state.ready && !state.arUnsupportedToastShown) {
        state.arUnsupportedToastShown = true;
        showToast('AR unavailable', 'This device or browser does not support AR preview.', 'info', 3600);
    }
    syncARVisibility();
}

function onARSessionStart() {
    state.isInAR = true;
    document.body.classList.add('is-in-ar');
    controls.enabled = false;
    reticle.visible = false;
    window.clearTimeout(postArRestoreTimer);
    previewStateBeforeAR = capturePreviewState();

    if (modelRoot) sceneRoot.visible = false;
    syncControlAvailability();
    showToast('AR mode active', 'Move your device to find a surface, then tap to place. Drag to rotate.', 'info', 10000);
}

function onARSessionEnd() {
    state.isInAR = false;
    document.body.classList.remove('is-in-ar');
    controls.enabled = true;
    reticle.visible = false;
    resetHitTestState();

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

function updateARHitTesting(frame) {
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

    if (hitTestResults.length === 0) {
        reticle.visible = false;
        return;
    }

    const pose = hitTestResults[0].getPose(referenceSpace);
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
}

let arTouchStartX = 0;
let arTouchStartRotationY = 0;
let arIsDragging = false;
let arHasDragged = false;

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

function placeModelFromReticle() {
    if (!state.isInAR || !reticle.visible || !modelRoot || arHasDragged) return;

    const placementPosition = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
    sceneRoot.position.copy(placementPosition);
    sceneRoot.visible = true;

    const xrCamera = renderer.xr.getCamera(camera);
    const cameraPosition = new THREE.Vector3();
    xrCamera.getWorldPosition(cameraPosition);

    const lookDirection = new THREE.Vector3().subVectors(cameraPosition, placementPosition);
    sceneRoot.rotation.set(0, Math.atan2(lookDirection.x, lookDirection.z), 0);

    showToast('Object placed', 'Tap again on another surface if you want to reposition the flag.', 'success', 3200);
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

/* ---------------------------------
   Render Loop
--------------------------------- */
function handleResize() {
    const width = dom.canvasContainer.clientWidth;
    const height = dom.canvasContainer.clientHeight;

    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(getClampedPixelRatio());
    renderer.setSize(width, height);

    if (pocketColorPickr?.isOpen()) {
        queuePocketColorPickerLayout();
    } else if (!mobileViewportMediaQuery.matches) {
        restorePocketColorPickerNativeLayout();
    }

    Object.values(sideConfigs).forEach(config => {
        if (config.fileName && config.titleElement) {
            config.titleElement.textContent = truncateFileName(config.fileName, config.titleElement);
        }
    });
}

/* ---------------------------------
   Render Loop (Updated for VAT)
--------------------------------- */
function renderFrame(_, frame) {
    TWEEN.update();

    if (state.isInAR) updateARHitTesting(frame);

    timer.update();
    const delta = timer.getDelta(); // This is the crucial fix for pausing!

    if (state.turntableEnabled && !state.isInAR) {
        sceneRoot.rotation.y += turntableSpeed * delta;
    }

    // --- UPDATE VAT ANIMATION TIME ---
    if (isPlaying) {
        accumulatedTime += delta; // Accumulate delta instead of elapsed
    }
    vatMaterials.forEach((mat) => {
        if (mat.userData.shader) {
            mat.userData.shader.uniforms.uTime.value = accumulatedTime;
        }
    });

    controls.update();
    renderer.render(scene, camera);
}
