/* ---------------------------------
   Imports & Dependencies
--------------------------------- */

import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { Timer } from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { DotLottie } from 'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web/+esm';

/* ---------------------------------
   DOM Elements & Caching
--------------------------------- */
const dom = {
    canvasContainer: document.getElementById('canvas-container'),
    prefBtn: document.getElementById('pref-btn'),
    prefBtnText: document.getElementById('pref-btn-text'),
    prefDropdown: document.getElementById('pref-dropdown'),
    prefLangList: document.getElementById('pref-lang-list'),
    prefCurrencyList: document.getElementById('pref-currency-list'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    uiPanel: document.getElementById('ui-panel'),
    pocketColor: document.getElementById('pocket-color'),
    pocketColorTrigger: document.getElementById('pocket-color-trigger'),
    pocketColorValue: document.getElementById('pocket-color-value'),
    pocketColorSwatch: document.getElementById('pocket-color-swatch'),
    playPause: document.getElementById('play-pause'),
    generatePdf: document.getElementById('generate-pdf'),
    addToCart: document.getElementById('add-to-cart'),
    cameraWrapper: document.getElementById('camera-wrapper'),
    cameraActions: document.getElementById('camera-actions'),
    turntableToggle: document.getElementById('turntable-toggle'),
    charToggle: document.getElementById('char-toggle'),
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

const mobileViewportMediaQuery = window.matchMedia('(max-width: 768px)');
let sceneDirty = true; // Initial frame needs drawing

/* ---------------------------------
   Configuration & Options
--------------------------------- */


const sideConfigs = {
    graphic: {
        label: 'Graphic',
        input: document.getElementById('graphic-upload'),
        dropzone: document.getElementById('graphic-dropzone'),
        titleElement: document.querySelector('#graphic-dropzone .upload-title'),
        subtitleElement: document.querySelector('#graphic-dropzone .upload-subtitle'),
        defaultTitle: 'Drop graphic here',
        actionsWrapper: document.getElementById('graphic-actions-wrapper'),
        actions: document.getElementById('graphic-actions'),
        transformsWrapper: document.getElementById('graphic-transforms-wrapper'),
        transforms: document.getElementById('graphic-transforms'),
        thumbFrame: document.getElementById('graphic-thumb-frame'),
        thumb: document.getElementById('graphic-thumb'),
        resetButton: document.getElementById('reset-graphic-tex'),
        clearButton: document.getElementById('clear-graphic'),
        scaleInput: document.getElementById('graphic-scale'),
        xInput: document.getElementById('graphic-x'),
        yInput: document.getElementById('graphic-y'),
        uploadedTexture: null,
        uploadedFrontTex: null,
        uploadedBackTex: null,
        previewUrl: null,
        fileName: null
    }
};

const uploadedGraphicsCache = {};

function getCurrentConfigKey() {
    const sizeCode = configState.size.split(' ').pop().toLowerCase();
    let printing = configState.printing;
    // Single Sided and Air Textile share the same graphic template and layout.
    // Map Air Textile to Single Sided to share the exact same cached texture and transform state.
    if (printing === 'Air Textile') {
        printing = 'Single Sided';
    }
    return `${sizeCode}_${printing.toLowerCase()}_${configState.direction.toLowerCase()}`;
}

function saveCurrentGraphicToCache() {
    const key = getCurrentConfigKey();
    const config = sideConfigs.graphic;

    if (config.uploadedTexture) {
        uploadedGraphicsCache[key] = {
            uploadedTexture: config.uploadedTexture,
            uploadedFrontTex: config.uploadedFrontTex,
            uploadedBackTex: config.uploadedBackTex,
            previewUrl: config.previewUrl,
            fileName: config.fileName,
            scale: config.scaleInput.value,
            panX: config.xInput.value,
            panY: config.yInput.value
        };
    } else {
        delete uploadedGraphicsCache[key];
    }
}

function loadGraphicFromCache() {
    const key = getCurrentConfigKey();
    const config = sideConfigs.graphic;
    const cached = uploadedGraphicsCache[key];

    if (cached) {
        config.uploadedTexture = cached.uploadedTexture;
        config.uploadedFrontTex = cached.uploadedFrontTex;
        config.uploadedBackTex = cached.uploadedBackTex;
        config.previewUrl = cached.previewUrl;
        config.fileName = cached.fileName;

        config.scaleInput.value = cached.scale;
        config.xInput.value = cached.panX;
        config.yInput.value = cached.panY;
        config.thumb.src = cached.previewUrl;
        config.thumbFrame.style.display = 'block';
        config.titleElement.textContent = truncateFileName(cached.fileName, config.titleElement);
        config.actionsWrapper.style.display = 'flex';
        config.transformsWrapper.style.display = 'block';
    } else {
        config.uploadedTexture = null;
        config.uploadedFrontTex = null;
        config.uploadedBackTex = null;
        config.previewUrl = null;
        config.fileName = null;

        config.scaleInput.value = '1';
        config.xInput.value = '0';
        config.yInput.value = '0';
        config.thumb.removeAttribute('src');
        config.thumbFrame.style.display = 'none';
        config.titleElement.textContent = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('upload.title') : config.defaultTitle;
        config.titleElement.removeAttribute('title');
        config.actionsWrapper.style.display = 'none';
        config.transformsWrapper.style.display = 'none';
    }
    syncSideUi('graphic');
}

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
let currentLanguage = localStorage.getItem('pref-language') || 'en';
let currentCurrency = localStorage.getItem('pref-currency') || 'USD';

function getCurrencySymbol() {
    return currentCurrency === 'EUR' ? '€' : '$';
}

function syncPreferenceMenuUi() {
    if (dom.prefBtnText) {
        const displayLang = currentLanguage.toUpperCase();
        const displaySymbol = getCurrencySymbol();
        dom.prefBtnText.textContent = `${displayLang} | ${displaySymbol}`;
    }

    if (dom.prefLangList) {
        const items = dom.prefLangList.querySelectorAll('.pref-menu-item');
        items.forEach(item => {
            const isActive = item.dataset.value === currentLanguage;
            item.classList.toggle('is-active', isActive);
        });
    }

    if (dom.prefCurrencyList) {
        const items = dom.prefCurrencyList.querySelectorAll('.pref-menu-item');
        items.forEach(item => {
            const isActive = item.dataset.value === currentCurrency;
            item.classList.toggle('is-active', isActive);
        });
    }
}

function setPreferenceDropdownOpen(open) {
    if (!dom.prefDropdown || !dom.prefBtn) return;
    dom.prefDropdown.classList.toggle('is-open', open);
    dom.prefBtn.setAttribute('aria-expanded', String(open));
}

function translateToastText(text) {
    if (!window.i18next || !window.i18next.isInitialized) return text;
    
    const map = {
        'AR Supported': 'toasts.ar_support_resolved_title',
        'Ready for AR! Tap the green AR button on the right to place the flag in the real world.': 'toasts.ar_support_resolved_msg',
        'AR unavailable': 'toasts.ar_unsupported_title',
        'This device or browser does not support AR preview.': 'toasts.ar_unsupported_msg',
        'AR mode active': 'toasts.ar_active_title',
        'Move your device to find a surface, then tap to place. Drag to rotate.': 'toasts.ar_active_msg',
        'Curious how it looks in real life?': 'toasts.ar_suggestion_title',
        'View it in AR.': 'toasts.ar_suggestion_msg',
        'Object placed': 'toasts.ar_placed_title',
        'Tap again on another surface if you want to reposition the flag.': 'toasts.ar_placed_msg',
        'Loading Saving System': 'toasts.loading_pdf_title',
        'Preparing the PDF saving modules...': 'toasts.loading_pdf_msg',
        'Load Failed': 'toasts.load_failed_title',
        'Could not load the PDF saving libraries. Please check your internet connection.': 'toasts.load_failed_msg',
        'Preview still loading': 'toasts.preview_loading_title',
        'Please wait for the 3D preview to finish loading before uploading graphic.': 'toasts.preview_loading_msg',
        'Environment unavailable': 'toasts.env_unavailable_title',
        'Studio lighting could not be loaded. Continuing with the default background.': 'toasts.env_unavailable_msg',
        'Loading reference': 'toasts.ref_loading_title',
        'Loading 3D character model height reference...': 'toasts.ref_loading_msg',
        'Reference loaded': 'toasts.ref_loaded_title',
        '3D character model height reference added.': 'toasts.ref_loaded_msg',
        'Loading failed': 'toasts.ref_failed_title',
        'Could not load the 3D character model.': 'toasts.ref_failed_msg',
        'Preview ready': 'toasts.preview_ready_title',
        'Graphic tools are ready, but design saving is currently unavailable.': 'toasts.preview_ready_no_save',
        'Pick a size and layout, upload your design, tweak the preview, and save.': 'toasts.preview_ready_msg',
        'Graphic applied': 'toasts.graphic_applied_title',
        'Graphic removed': 'toasts.graphic_removed_title',
        'Saving design': 'toasts.saving_design_title',
        'Capturing front and back layouts for your design.': 'toasts.saving_design_msg',
        'Design saved': 'toasts.design_saved_title',
        'Your custom flag design has been saved successfully.': 'toasts.design_saved_msg',
        'Save failed': 'toasts.save_failed_title',
        'Unable to save your design. Please try again.': 'toasts.save_failed_msg',
        'AR placement unavailable': 'toasts.ar_placement_unavailable_title',
        'Hit testing could not be started for this session.': 'toasts.ar_placement_unavailable_msg',
        'PDF error': 'toasts.pdf_error_title',
        'Failed to read or convert the PDF file.': 'toasts.pdf_error_msg',
        'Processing PDF': 'toasts.processing_pdf_title',
        'Converting the first page of the PDF to a high-quality WebP image.': 'toasts.processing_pdf_msg',
        'Processing Image': 'toasts.processing_image_title',
        'Formatting the image to a high-fidelity WebP texture.': 'toasts.processing_image_msg',
        'Image error': 'toasts.image_error_title',
        'Failed to process the uploaded image.': 'toasts.image_error_msg',
        'Unsupported file': 'toasts.unsupported_file_title',
        'Please upload a PNG, JPG, JPEG, WEBP, or PDF file.': 'toasts.unsupported_file_msg',
        'Coming Soon.....': 'toasts.coming_soon'
    };

    const key = map[text];
    if (key && window.i18next.exists(key)) {
        return window.i18next.t(key);
    }

    if (text && text.includes('graphic has been updated successfully.')) {
        return window.i18next.t('toasts.graphic_applied_msg', { label: window.i18next.t('sections.graphic') });
    }
    if (text && text.includes('graphic could not be processed.')) {
        return window.i18next.t('toasts.graphic_applied_failed', { label: window.i18next.t('sections.graphic').toLowerCase() });
    }
    if (text && text.includes('graphic has been cleared from the preview.')) {
        return window.i18next.t('toasts.graphic_removed_msg', { label: window.i18next.t('sections.graphic') });
    }

    return text;
}

function updateUploadZoneLabels() {
    const config = sideConfigs.graphic;
    if (!config) return;
    if (!config.uploadedTexture) {
        if (window.i18next && window.i18next.isInitialized) {
            config.titleElement.textContent = window.i18next.t('upload.title');
        } else {
            config.titleElement.textContent = config.defaultTitle;
        }
    }
}

async function initI18n() {
    try {
        const [enRes, nlRes] = await Promise.all([
            fetch('assets/locales/en.json'),
            fetch('assets/locales/nl.json')
        ]);
        const enTranslations = await enRes.json();
        const nlTranslations = await nlRes.json();

        await window.i18next.init({
            lng: currentLanguage,
            fallbackLng: 'en',
            resources: {
                en: { translation: enTranslations },
                nl: { translation: nlTranslations }
            }
        });

        syncPreferenceMenuUi();

        updateContentWithTranslations();
    } catch (error) {
        console.error('Failed to initialize i18next:', error);
    }
}

function updateContentWithTranslations() {
    if (!window.i18next || !window.i18next.isInitialized) return;

    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const attrVal = el.getAttribute('data-i18n');
        if (!attrVal) return;

        const parts = attrVal.split(';');
        parts.forEach(part => {
            const match = part.trim().match(/^(?:\[([^\]]+)\])?(.*)$/);
            if (!match) return;

            const attrName = match[1];
            const key = match[2];
            const translation = window.i18next.t(key);

            if (attrName) {
                el.setAttribute(attrName, translation);
            } else {
                el.textContent = translation;
            }
        });
    });

    const sections = document.querySelectorAll('.config-section');
    sections.forEach(section => {
        const activeCard = section.querySelector('.config-card.is-active');
        const nameDisplay = section.querySelector('.selection-name');
        if (activeCard && nameDisplay) {
            const category = activeCard.dataset.category;
            const value = activeCard.dataset.value;
            if (category && value) {
                nameDisplay.textContent = formatSelectionName(category, value);
            }
        }
    });

    updateUploadZoneLabels();
}

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
        const mappedBase = baseMapping[configState.base] || configState.base;
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
                const cardMappedBase = baseMapping[value] || value;
                if (cardMappedBase && pricingData.pricingTiers.bases[cardMappedBase]) {
                    cardPrice = pricingData.pricingTiers.bases[cardMappedBase];
                }
            }
        }

        // Only add price format if we have a valid category we mapped
        if (['size', 'printing', 'pole', 'base'].includes(category)) {
            const currencySymbol = getCurrencySymbol();
            const formattedPrice = `${currencySymbol} ${cardPrice.toFixed(2)}`.trim();
            card.dataset.price = formattedPrice;

            // If this is the active card, update the section's selection price display
            if (card.classList.contains('is-active')) {
                const section = card.closest('.config-section');
                if (section) {
                    const priceDisplay = section.querySelector('.selection-price');
                    if (priceDisplay) {
                        // For Add-ons like printing, pole, and base, we can show + cost if we want
                        priceDisplay.textContent = (category !== 'size' && cardPrice > 0) ? `+ ${currencySymbol} ${cardPrice.toFixed(2)}` : formattedPrice;
                    }
                }
            }
        }
    });

    const total = sizePrice + printingAddon + poleAddon + basePrice;
    const totalEl = document.getElementById('total-price-value');
    if (totalEl) {
        const currencySymbol = getCurrencySymbol();
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

function updateVatUniforms(mat, posTex, normTex, frameCount) {
    if (mat.userData.shader && mat.userData.shader.uniforms) {
        if (mat.userData.shader.uniforms.posTexture) {
            mat.userData.shader.uniforms.posTexture.value = posTex;
        }
        if (mat.userData.shader.uniforms.normTexture) {
            mat.userData.shader.uniforms.normTexture.value = normTex;
        }
        if (mat.userData.shader.uniforms.uTotalFrames) {
            mat.userData.shader.uniforms.uTotalFrames.value = frameCount;
        }
    }
    if (mat.userData.compiledShaders) {
        mat.userData.compiledShaders.forEach(shader => {
            if (shader && shader.uniforms) {
                if (shader.uniforms.posTexture) {
                    shader.uniforms.posTexture.value = posTex;
                }
                if (shader.uniforms.normTexture) {
                    shader.uniforms.normTexture.value = normTex;
                }
                if (shader.uniforms.uTotalFrames) {
                    shader.uniforms.uTotalFrames.value = frameCount;
                }
            }
        });
    }
}

function createFlagMeasurementGroup(bottomY, topY, lineX, text) {
    const group = new THREE.Group();
    group.name = 'flag-measurement';

    const material = new THREE.MeshBasicMaterial({
        color: 0x10B981,
        transparent: true,
        opacity: 0.8
    });

    // Helper to create a thicker line using a thin cylinder (diamond cross-section)
    function createThickLine(p1, p2, radius) {
        const direction = new THREE.Vector3().subVectors(p2, p1);
        const length = direction.length();
        
        // 4 segments is highly efficient and creates a clean 3D line
        const geom = new THREE.CylinderGeometry(radius, radius, length, 4);
        const mesh = new THREE.Mesh(geom, material);
        mesh.raycast = () => {}; // Ignore in raycasting
        
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

    // The vertical line is broken around the text box (from bottomY to midY - gapHalf and midY + gapHalf to topY).
    const lineSegmentsData = [
        [new THREE.Vector3(lineX, bottomY, 0), new THREE.Vector3(lineX, midY - gapHalf, 0)],     // Vertical line (bottom half)
        [new THREE.Vector3(lineX, midY + gapHalf, 0), new THREE.Vector3(lineX, topY, 0)],         // Vertical line (top half)
        [new THREE.Vector3(lineX, bottomY, 0), new THREE.Vector3(-0.1, bottomY, 0)],             // Bottom extension
        [new THREE.Vector3(lineX, topY, 0), new THREE.Vector3(-0.1, topY, 0)],                   // Top extension
        
        // Top arrowhead pointing up
        [new THREE.Vector3(lineX, topY, 0), new THREE.Vector3(lineX - 0.04, topY - 0.08, 0)],
        [new THREE.Vector3(lineX, topY, 0), new THREE.Vector3(lineX + 0.04, topY - 0.08, 0)],
        
        // Bottom arrowhead pointing down
        [new THREE.Vector3(lineX, bottomY, 0), new THREE.Vector3(lineX - 0.04, bottomY + 0.08, 0)],
        [new THREE.Vector3(lineX, bottomY, 0), new THREE.Vector3(lineX + 0.04, bottomY + 0.08, 0)]
    ];

    lineSegmentsData.forEach(([p1, p2]) => {
        group.add(createThickLine(p1, p2, lineRadius));
    });

    // 2. High-resolution Sprite for text label
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
    ctx.strokeStyle = '#10B981';
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

function syncFlagMeasurement() {
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

    const isXS = configState.size === 'Beach flag Convex XS';
    const isL = configState.size === 'Beach flag Convex L';
    
    if (showCharacter && (isXS || isL)) {
        // Temporarily reset sceneRoot and modelRoot rotations and scales to neutral to calculate correct dimensions
        const savedSceneRotationY = sceneRoot.rotation.y;
        const savedModelRotationY = modelRoot.rotation.y;
        const savedModelScale = modelRoot.scale.clone();
        
        sceneRoot.rotation.y = 0;
        modelRoot.rotation.y = 0;
        modelRoot.scale.set(1, 1, 1);
        sceneRoot.updateMatrixWorld(true);
        modelRoot.updateMatrixWorld(true);

        // Calculate the bounding box of active flag meshes + pole in world coordinates
        const flagBox = new THREE.Box3();
        const sizeCode = configState.size.split(' ').pop().toLowerCase();
        
        modelRoot.traverse((child) => {
            if (child.isMesh) {
                const name = (child.name || '').toLowerCase();
                const isPole = name.includes('pole');
                const isSizeMesh = name.includes(`${sizeCode}_vat`) || name.includes(`${sizeCode}_pocket`);
                
                // Include pole mesh (always, even if invisible) and size-specific flag meshes (only if visible)
                if (isPole || (isSizeMesh && child.visible)) {
                    const childBox = new THREE.Box3().setFromObject(child);
                    if (!childBox.isEmpty()) {
                        flagBox.union(childBox);
                    }
                }
            }
        });

        // Restore original rotations and scales
        sceneRoot.rotation.y = savedSceneRotationY;
        modelRoot.rotation.y = savedModelRotationY;
        modelRoot.scale.copy(savedModelScale);
        sceneRoot.updateMatrixWorld(true);
        modelRoot.updateMatrixWorld(true);

        if (!flagBox.isEmpty()) {
            const bottomY = flagBox.min.y;
            const topY = flagBox.max.y;
            // Place measurement line 0.35m to the left of the leftmost edge of the flag system
            const lineX = flagBox.min.x - 0.35;
            const labelText = isXS ? '250 cm' : '500 cm';
            
            const measurement = createFlagMeasurementGroup(bottomY, topY, lineX, labelText);
            sceneRoot.add(measurement);
        }
    }
    
    sceneDirty = true;
}

export async function applyConfigurationToScene(animateTransition = false, transitionDuration = 800, isBaseSwap = false) {
    sceneDirty = true;
    const currentCounter = ++applyConfigCounter;
    currentCameraSequenceId++; // Cancel any active async camera sequences immediately

    // Load the custom graphic associated with this specific config from the cache
    loadGraphicFromCache();

    // Lift/lower model parts based on Luxury cross base selection (lift by 1.14 cm = 0.0114 units)
    const targetOffset = (configState.base === 'Luxury cross base') ? 0.0114 : 0.0;
    if (!animateTransition || state.isInAR) {
        if (baseOffsetTween) {
            baseOffsetTween.stop();
            baseOffsetTween = null;
        }
        baseYOffset = targetOffset;
        applyBaseYOffsetToMeshes();
    }

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
        modelRoot.children.forEach(child => {
            const lowerName = (child.name || '').toLowerCase();
            if (lowerName.includes('base') || lowerName.includes('cross')) {
                child.rotation.y = 0;
            }
        });
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
                updateVatUniforms(mat, vatTexture, normTexture, currentVatData.info.frame_count);
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
            if (configState.base !== 'No base') {
                const baseKey = configState.base.toLowerCase().replace(/[\s-]/g, '_');
                if (lowerName.includes(baseKey) || (baseKey.startsWith('cross_base') && lowerName.includes('cross_base_grey_black'))) {
                    child.traverse(c => c.visible = true);
                    
                    // Handle dynamic color overlay specifically for grey/black shared meshes
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
                    backMat = cache.global['translucent'] || cache.global['air_translucent'];
                } else { // Left
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

            // Dynamically assign custom uploaded graphic or restore the original map
            const uploadedFrontTex = sideConfigs.graphic.uploadedFrontTex;
            const uploadedBackTex = sideConfigs.graphic.uploadedBackTex;

            const applyGraphicOrRestore = (mat) => {
                if (!mat) return;
                const isTranslucent = mat.name.includes('translucent');
                if (isTranslucent) {
                    return; // Translucent overlays never receive the graphic directly
                }

                if (!mat.userData.originalMap) {
                    mat.userData.originalMap = mat.map;
                }

                if (mat === frontMat && uploadedFrontTex) {
                    if (mat.userData.originalMap) {
                        uploadedFrontTex.channel = mat.userData.originalMap.channel;
                    }
                    mat.map = uploadedFrontTex;
                } else if (mat === backMat && uploadedBackTex) {
                    if (mat.userData.originalMap) {
                        uploadedBackTex.channel = mat.userData.originalMap.channel;
                    }
                    mat.map = uploadedBackTex;
                } else {
                    mat.map = mat.userData.originalMap;
                }
                mat.color.setHex(0xffffff);
                mat.needsUpdate = true;
            };

            // Run map restoration on all cached size-materials to prevent stale overrides
            Object.keys(cache).forEach(key => {
                if (key !== 'global') {
                    Object.values(cache[key]).forEach(applyGraphicOrRestore);
                }
            });

            if (frontMat) front.material = frontMat;
            if (backMat) back.material = backMat;

            // Set renderOrder to ensure the translucent overlay always renders ON TOP of the graphic mesh
            const frontIsTranslucent = frontMat && frontMat.name.includes('translucent');
            const backIsTranslucent = backMat && backMat.name.includes('translucent');

            if (frontIsTranslucent) {
                front.renderOrder = 2;
                back.renderOrder = 1;
            } else if (backIsTranslucent) {
                front.renderOrder = 1;
                back.renderOrder = 2;
            } else {
                front.renderOrder = 1;
                back.renderOrder = 1;
            }

            // Sync all lifted meshes to the current baseYOffset immediately
            applyBaseYOffsetToMeshes();
        }
    };

    if (animateTransition && !state.isInAR) {
        // Remove existing flag measurement overlay during transition to avoid wrong display
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
            if (configState.base !== 'No base') {
                const baseKey = configState.base.toLowerCase().replace(/[\s-]/g, '_');
                if (lowerName.includes(baseKey) || (baseKey.startsWith('cross_base') && lowerName.includes('cross_base_grey_black'))) {
                    child.traverse(c => c.visible = true);
                }
            }
        });

        modelRoot.updateMatrixWorld(true);
        const intrinsicNewDim = getVisibleMaxDimension();

        // --- CAMERA BLEND: Calculate target position for the new model silently ---
        if (typeof updateDynamicCameraTargets === 'function') {
            updateDynamicCameraTargets(false); // Passing false computes math, but doesn't move it
        }
        let endCameraPos;
        let endControlsTarget;
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
                if (isBaseSwap) {
                    if (isToOrFromNone) {
                        let scaleVal = 1.0;
                        if (targetBaseIsNone) {
                            scaleVal = Math.max(0, 1.0 - progress * 4.0); // Complete shrink twice as fast (within first 25% of progress)
                        } else if (oldBaseWasNone) {
                            scaleVal = progress < 0.5 ? 0.0 : Math.min(1.0, (progress - 0.5) * 4.0); // Complete grow twice as fast (within first 25% of the second half)
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

                        // Start the Luxury base Y offset animation at the midpoint over the remaining duration!
                        const targetOffset = (configState.base === 'Luxury cross base') ? 0.0114 : 0.0;
                        animateBaseYOffset(targetOffset, transitionDuration * 0.5);
                    }
                    const newModelLocalScale = currentScaleAmt / dimRatio;
                    modelRoot.scale.set(newModelLocalScale, newModelLocalScale, newModelLocalScale);
                }
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
                sceneRoot.rotation.y = 0; // Lock to perfectly forward-facing
                modelRoot.updateMatrixWorld(true);
                modelRoot.userData.scaleTween = null;
                controls.enabled = true;
                controls.update(); // Sync OrbitControls internal state
                syncFlagMeasurement(); // Recalculate dimensions once the scale is stable
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

    // Update the dynamic graphic template download link and subtitle text based on current configuration
    updateTemplateDownloadLink();
    if (!(animateTransition && !state.isInAR)) {
        syncFlagMeasurement();
    }
}

function updateTemplateDownloadLink() {
    const downloadBtn = document.getElementById('template-download-btn');
    const filenameDisplay = document.getElementById('template-filename');
    if (!downloadBtn) return;

    // 1. Get size key and map it to filename dimensions
    const sizeMapping = {
        'Beach flag Convex XS': 'xs',
        'Beach flag Convex S': 'S',
        'Beach flag Convex M': 'M',
        'Beach flag Convex M-Extra Wide': 'M-Wide',
        'Beach flag Convex L': 'l'
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

    // 2. Map printing and direction to suffix
    let fileSuffix = '';

    if (configState.printing === 'Double Sided') {
        fileSuffix = '-double-sided';
    } else {
        const dirSuffix = configState.direction.toLowerCase() === 'left' ? '-left' : '-right';
        fileSuffix = `-single-sided${dirSuffix}`;
    }

    // 3. Build URL and Display Name
    const filename = `beachflag-convex-${sizeInfo.file}${fileSuffix}.pdf`;
    const downloadUrl = `https://files.proflags.com/beachflag-convex/${filename}`;
    
    let sizeText = configState.size;
    if (window.i18next && window.i18next.isInitialized) {
        sizeText = window.i18next.t(`selections.size.${configState.size}`);
    }
    let sizePart = sizeText.replace(/\s+/g, '-');

    let printingText = configState.printing;
    if (window.i18next && window.i18next.isInitialized) {
        printingText = window.i18next.t(`selections.printing.${configState.printing}`);
    }
    let printingPart = printingText.replace(/\s+/g, '-');

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

    // 4. Update the DOM
    downloadBtn.href = downloadUrl;
    downloadBtn.setAttribute('download', filename);
    if (filenameDisplay) {
        filenameDisplay.textContent = displayName;
    }
}


function updateDynamicCameraTargets(moveCamera = true) {
    if (!modelRoot) return;

    // 1. Save current transformations to ensure we calculate neutral, unrotated bounds
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

    saveAndNormalize(modelRoot);
    
    // For character model, if it is active/visible or in transition to be visible
    if (characterModel && showCharacter) {
        saveAndNormalize(characterModel);
    }

    const currentSceneRotation = sceneRoot.rotation.clone();
    sceneRoot.rotation.set(0, 0, 0);
    sceneRoot.updateMatrixWorld(true);

    const box = new THREE.Box3();
    let hasVisibleMesh = false;

    // 2. Traverse the entire scene to find all visible meshes (except helpers/ground)
    scene.traverse((child) => {
        if (child.isMesh) {
            // Exclude helper meshes and ground shadow catcher
            if (child === shadowCatcher || (child.name && child.name.includes('shadowCatcher'))) return;
            if (child === reticle || (child.name && child.name.includes('reticle'))) return;
            if (child.type && child.type.includes('Helper')) return;

            // Check hierarchical visibility
            let isVisible = true;
            let current = child;
            while (current) {
                // Exclude any meshes belonging to measurement groups from the camera focus bounding box
                if (current.name && (current.name.includes('flag-measurement') || current.name.includes('height-measurement'))) {
                    isVisible = false;
                    break;
                }
                // If it belongs to characterModel, visible state is determined by showCharacter
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

    // 3. Restore all transformations instantly
    transformsToRestore.forEach((t) => {
        t.obj.scale.copy(t.scale);
        t.obj.rotation.copy(t.rotation);
        t.obj.updateMatrixWorld(true);
    });

    sceneRoot.rotation.copy(currentSceneRotation);
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

let baseYOffset = 0.0;
let baseOffsetTween = null;

function applyBaseYOffsetToMeshes() {
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
}

function animateBaseYOffset(targetOffset, duration = 800) {
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


async function runPrintingCameraSequence() {
    currentCameraSequenceId++;
    const sequenceId = currentCameraSequenceId;

    const primaryView = (configState.printing === 'Double Sided') ? 'front' : ((configState.direction === 'Left') ? 'back' : 'front');
    const secondaryView = (configState.printing === 'Double Sided') ? 'back' : ((configState.direction === 'Left') ? 'front' : 'back');

    // Step 1: Smoothly rotate 180 degrees to the secondary/back view, slowing down gently near the end
    focusCameraSpinHalf(secondaryView, 800, false, true);
    await new Promise(resolve => setTimeout(resolve, 820));
    if (sequenceId !== currentCameraSequenceId) return;

    // Step 2: Smoothly rotate the remaining 180 degrees back to primary view, starting gently and accelerating
    focusCameraSpinHalf(primaryView, 800, true, true);
}

async function runDirectionCameraSequence(direction) {
    currentCameraSequenceId++;
    if (direction === 'Right') {
        focusCameraView('front', 800, false);
    } else if (direction === 'Left') {
        focusCameraView('back', 800, false);
    }
}

function formatSelectionName(category, value) {
    let displayName = value;
    if (window.i18next && window.i18next.isInitialized) {
        const key = `selections.${category}.${value}`;
        if (window.i18next.exists(key)) {
            displayName = window.i18next.t(key);
        }
    }
    if (category === 'size') {
        const sizeDimensions = {
            'Beach flag Convex XS': '60x180cm',
            'Beach flag Convex S': '60x240cm',
            'Beach flag Convex M': '70x330cm',
            'Beach flag Convex M-Extra Wide': '90x300cm',
            'Beach flag Convex L': '75x380cm'
        };
        const dim = sizeDimensions[value];
        if (dim) {
            return `${displayName} - ${dim}`;
        }
    }
    return displayName;
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
                if (nameDisplay) nameDisplay.textContent = formatSelectionName(category, value);
                if (priceDisplay && card.dataset.price) priceDisplay.textContent = card.dataset.price;
            }

            card.addEventListener('click', () => {
                cards.forEach(c => c.classList.remove('is-active'));
                card.classList.add('is-active');

                const category = card.dataset.category;
                const value = card.dataset.value;
                const price = card.dataset.price;

                let sizeChanged = false;
                let baseChanged = false;
                if (category && category !== 'pole-cover') {
                    if (category === 'size' && configState.size !== value) {
                        sizeChanged = true;
                    }
                    if (category === 'base' && configState.base !== value) {
                        baseChanged = true;
                    }
                    configState[category] = value;
                }

                if (nameDisplay) nameDisplay.textContent = formatSelectionName(category, value);
                if (priceDisplay && price) priceDisplay.textContent = price;

                if (category === 'size' || category === 'printing' || category === 'base') {
                    stopTurntableRotation();
                }

                let swapDuration = 800;
                let isBaseSwap = false;
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
                } else if (baseChanged) {
                    if (typeof isZoomedIn !== 'undefined') isZoomedIn = false;
                    preZoomState = null;
                    if (value === 'No base') {
                        setActiveCameraView('home');
                    } else {
                        setActiveCameraView(null); // Set to null (inactive) since the camera is focusing down on the physical base
                    }
                    isBaseSwap = true;
                }

                applyConfigurationToScene(sizeChanged || baseChanged, swapDuration, isBaseSwap);

                // Introduce a tiny 50ms frame-settling delay to allow WebGL state changes and
                // texture uploads (like the Air Textile alphaMap) to bind synchronously first.
                // This prevents first-frame frame rate spikes, ensuring a buttery smooth transition!
                if (category === 'printing') {
                    window.setTimeout(() => {
                        runPrintingCameraSequence();
                    }, 50);
                } else if (category === 'direction') {
                    window.setTimeout(() => {
                        runDirectionCameraSequence(value);
                    }, 50);
                }
            });
        });
    });

    applyConfigurationToScene(false);
}

window.addEventListener('DOMContentLoaded', async () => {
    await fetchPricingData();
    await initI18n();
    initConfiguratorUI();
    handleResize();
});

/* ---------------------------------
   Three.js Core Setup
--------------------------------- */
const scene = new THREE.Scene();
const defaultBackground = new THREE.Color('#e3e3e3');
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
renderer.render(scene, camera); // Initial render to paint the defaultBackground (#e3e3e3)

const sceneRoot = new THREE.Group();
scene.add(sceneRoot);

const lightingGroup = new THREE.Group();
scene.add(lightingGroup);

const overheadLight = new THREE.DirectionalLight(0xffffff, 0.6);
overheadLight.position.set(3.5, 6, 5);
overheadLight.castShadow = true;
const shadowResolution = 2048;
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
let turntableAccumulatedAngle = 0;
let turntableAutoStopEnabled = true;
let cameraTargets = {
    home: cameraHome.clone(),
    front: new THREE.Vector3(0, targetCenter.y, cameraDistance),
    back: new THREE.Vector3(0, targetCenter.y, -cameraDistance),
    left: new THREE.Vector3(-cameraDistance, targetCenter.y, 0),
    right: new THREE.Vector3(cameraDistance, targetCenter.y, 0)
};
const exportRenderSize = 2048;

const navGuideState = {
    active: false,
    currentStep: 0,
    startTarget: new THREE.Vector3(),
    startCameraDistance: 0,
    startAzimuth: 0,
    startPolar: 0,
    hasCompletedCurrentStep: false,
    userInteracting: false,
    gestureStarted: false
};

let preloadedLottieBuffer = null;
let isLottiePreloading = false;

const svgRotate = `<svg viewBox="0 0 100 100" class="gesture-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M 16 22 Q 41 14, 66 22" class="gesture-trail" />
    <g class="gesture-finger rotate-animation">
        <g transform="scale(1.95)">
            <circle cx="0" cy="0" r="4.5" class="gesture-touch-point" />
            <path d="M -2 18 L -2 2 C -2 0.9, -1.1 0, 0 0 C 1.1 0, 2 0.9, 2 2 L 2 9 C 2.5 8.2, 3.5 7.5, 4.5 7.5 C 5.5 7.5, 6.5 8.2, 6.5 9.5 L 6.5 11 C 7 10.2, 8 9.5, 9 9.5 C 10 9.5, 11 10.2, 11 11.5 L 11 13 C 11.5 12.2, 12.5 11.5, 13.5 11.5 C 14.5 11.5, 15.5 12.2, 15.5 13.5 L 15.5 21 C 15.5 26, 11.5 30, 6.5 30 C 3 30, 0.5 28.5, -0.5 26.5 L -5.5 22.5 C -6.5 21.5, -6.5 20, -5.5 19 C -4.5 18, -3 18, -2 19 L -2 18 Z" class="gesture-hand" />
        </g>
    </g>
</svg>`;

const svgPan = `<svg viewBox="0 0 100 100" class="gesture-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <g class="gesture-finger pan-animation">
        <g transform="scale(1.82)">
            <circle cx="0" cy="0" r="4.5" class="gesture-touch-point" />
            <circle cx="4.25" cy="0" r="4.5" class="gesture-touch-point" />
            <path d="M -2 18 L -2 2 C -2 0.9, -1.1 0, 0 0 C 1.1 0, 2 0.9, 2 2 L 2 9 L 2 2 C 2 0.9, 3.1 0, 4.25 0 C 5.4 0, 6.5 0.9, 6.5 2 L 6.5 11 C 7 10.2, 8 9.5, 9 9.5 C 10 9.5, 11 10.2, 11 11.5 L 11 13 C 11.5 12.2, 12.5 11.5, 13.5 11.5 C 14.5 11.5, 15.5 12.2, 15.5 13.5 L 15.5 21 C 15.5 26, 11.5 30, 6.5 30 C 3 30, 0.5 28.5, -0.5 26.5 L -5.5 22.5 C -6.5 21.5, -6.5 20, -5.5 19 C -4.5 18, -3 18, -2 19 L -2 18 Z" class="gesture-hand" />
        </g>
    </g>
</svg>`;

const svgZoom = `<canvas id="dotlottie-canvas" style="width: 80px; height: 80px; display: block;"></canvas>`;

const svgDoubleTap = `<svg viewBox="0 0 100 100" class="gesture-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="30" r="12" class="gesture-ripple ripple-1" />
    <circle cx="40" cy="30" r="12" class="gesture-ripple ripple-2" />
    <g class="gesture-finger double-tap-animation">
        <g transform="scale(1.95)">
            <circle cx="0" cy="0" r="4.5" class="gesture-touch-point" />
            <path d="M -2 18 L -2 2 C -2 0.9, -1.1 0, 0 0 C 1.1 0, 2 0.9, 2 2 L 2 9 C 2.5 8.2, 3.5 7.5, 4.5 7.5 C 5.5 7.5, 6.5 8.2, 6.5 9.5 L 6.5 11 C 7 10.2, 8 9.5, 9 9.5 C 10 9.5, 11 10.2, 11 11.5 L 11 13 C 11.5 12.2, 12.5 11.5, 13.5 11.5 C 14.5 11.5, 15.5 12.2, 15.5 13.5 L 15.5 21 C 15.5 26, 11.5 30, 6.5 30 C 3 30, 0.5 28.5, -0.5 26.5 L -5.5 22.5 C -6.5 21.5, -6.5 20, -5.5 19 C -4.5 18, -3 18, -2 19 L -2 18 Z" class="gesture-hand" />
        </g>
    </g>
</svg>`;


const controls = new OrbitControls(camera, renderer.domElement);
let controlsDirty = false;
controls.addEventListener('change', () => {
    controlsDirty = true;
    if (navGuideState.active && !navGuideState.hasCompletedCurrentStep) {
        checkNavGuideGesture();
    }
});
controls.addEventListener('start', () => {
    if (navGuideState.active) {
        navGuideState.userInteracting = true;
        if (!navGuideState.gestureStarted) {
            navGuideState.gestureStarted = true;
            navGuideState.startTarget.copy(controls.target);
            navGuideState.startCameraDistance = camera.position.distanceTo(controls.target);
            navGuideState.startAzimuth = controls.getAzimuthalAngle();
            navGuideState.startPolar = controls.getPolarAngle();
        }
    }
});
controls.addEventListener('end', () => {
    if (navGuideState.active) {
        navGuideState.userInteracting = false;
    }
});
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
            const targets = [];
            if (modelRoot) targets.push(modelRoot);
            if (characterModel && characterModel.visible) {
                targets.push(characterModel);
            }
            const intersects = raycaster.intersectObjects(targets, true);

            let hitPoint = null;
            if (intersects.length > 0) {
                hitPoint = intersects[0].point;
            } else {
                // Check expanded bounding boxes to handle near-miss clicks
                let closestDist = Infinity;
                targets.forEach(target => {
                    const box = new THREE.Box3().setFromObject(target);
                    if (!box.isEmpty()) {
                        box.expandByScalar(0.2); // Expand hit area by 0.2 meters in world space
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
                
                // Enforce double-tap step success only if they clicked at the right place (hitPoint found)
                if (navGuideState.active && navGuideState.currentStep === 4 && !navGuideState.hasCompletedCurrentStep) {
                    completeNavGuideStep();
                }
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
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/libs/draco/');
const modelLoader = new GLTFLoader();
modelLoader.setDRACOLoader(dracoLoader);
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
                const uiContainer = document.getElementById('ui-container');
                if (uiContainer && !navGuideState.active) {
                    const overlay = document.getElementById('nav-coaching-overlay');
                    const isOverlayVisible = overlay && !overlay.hasAttribute('hidden');
                    const welcomeScreen = document.getElementById('nav-coaching-step-welcome');
                    const isWelcomeVisible = isOverlayVisible && welcomeScreen && !welcomeScreen.hasAttribute('hidden');
                    if (!isWelcomeVisible) {
                        uiContainer.classList.remove('is-blurred');
                    }
                }
            }
            delete vatLoadPromises[sizeCode];
        }
    })();

    return vatLoadPromises[sizeCode];
}


let pocketMaterial = null;
let modelRoot = null;
let characterModel = null;
let showCharacter = false;
let characterLoading = false;
let characterTween = null;
let environmentTexture = null;
let action = null;
let isPlaying = true;
let accumulatedTime = 0;
let arSuggestionShown = false;

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
    arUnsupportedToastShown: false,
    arSupportedToastShown: false
};

const pdfButtonMarkup = dom.generatePdf.innerHTML;
let pdfLibraryAvailable = true; // Set to true to keep button enabled on start; lazy-loaded on demand
let pdfLibrariesLoading = false;
let pdfLibrariesPromise = null;

function loadPdfLibraries() {
    if (window.jspdf && window.pdfjsLib) {
        return Promise.resolve(true);
    }
    
    if (pdfLibrariesLoading) {
        return pdfLibrariesPromise;
    }
    
    pdfLibrariesLoading = true;
    showToast('Loading Saving System', 'Preparing the PDF saving modules...', 'info', 3000);
    
    pdfLibrariesPromise = Promise.all([
        loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
        loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js")
    ]).then(() => {
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        pdfLibrariesLoading = false;
        return true;
    }).catch(err => {
        console.error("Failed to load PDF libraries", err);
        showToast('Load Failed', 'Could not load the PDF saving libraries. Please check your internet connection.', 'error', 4000);
        pdfLibrariesLoading = false;
        pdfLibrariesPromise = null;
        return false;
    });
    
    return pdfLibrariesPromise;
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

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
    const isMobile = mobileViewportMediaQuery.matches;
    const maxDPR = isMobile ? 1.5 : 2.0;
    return Math.min(window.devicePixelRatio || 1, maxDPR);
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
    
    const uiContainer = document.getElementById('ui-container');
    if (uiContainer) {
        if (visible) {
            uiContainer.classList.add('is-blurred');
        } else {
            if (!navGuideState.active) {
                const overlay = document.getElementById('nav-coaching-overlay');
                const isOverlayVisible = overlay && !overlay.hasAttribute('hidden');
                const welcomeScreen = document.getElementById('nav-coaching-step-welcome');
                const isWelcomeVisible = isOverlayVisible && welcomeScreen && !welcomeScreen.hasAttribute('hidden');
                if (!isWelcomeVisible) {
                    uiContainer.classList.remove('is-blurred');
                }
            }
        }
    }
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

function getBaseFocusTargets() {
    const baseBox = new THREE.Box3();
    let hasBaseMesh = false;
    if (modelRoot) {
        modelRoot.traverse(child => {
            if (child.isMesh && child.visible) {
                const lowerName = (child.name || '').toLowerCase();
                // Check if the mesh is one of the base parts
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
        // Distance should be close to focus on the base
        const distance = Math.max(maxDim * 1.5, 1.8);
        // Calculate the camera position: low angle, home side (slightly to the right and above target)
        pos.set(target.x + distance * 0.45, target.y + distance * 0.35, target.z + distance * 0.88);
    } else {
        // Safe defaults if meshes aren't found or bounds are empty
        target.set(0, 0.25, 0);
        pos.set(0.8, 0.7, 1.6);
    }
    return { target, position: pos };
}

async function silentWarmupAllSizes() {
    if (!modelRoot || !vatMaterials.length) return;

    // Collect all active size codes from the HTML cards
    const sizeCards = Array.from(document.querySelectorAll('.config-card[data-category="size"]'));
    const allSizeCodes = sizeCards
        .map(card => card.dataset.value.split(' ').pop())
        .filter(Boolean);

    const originalSizeCode = configState.size.split(' ').pop();

    // Step 1: Load ALL VAT data in parallel first (network fetch phase)
    await Promise.all(allSizeCodes.map(code => loadVATData(code)));

    // Step 2: For each size, swap textures + fire a 1×1 pixel scissor render to fully warm GPU shaders
    for (const sizeCode of allSizeCodes) {
        const vatData = vatCache[sizeCode];
        if (!vatData) continue;

        // Swap VAT uniforms to this size
        vatMaterials.forEach(mat => {
            updateVatUniforms(mat, vatData.positions, vatData.normals, vatData.info.frame_count);
        });

        // Make the VAT meshes for this size visible, hide all others
        const sizePrefix = sizeCode.toLowerCase();
        modelRoot.traverse(child => {
            const lowerName = (child.name || '').toLowerCase();
            if (lowerName.includes('_vat') || lowerName.includes('_pocket')) {
                child.visible = lowerName.includes(`${sizePrefix}_vat`) || lowerName.includes(`${sizePrefix}_pocket`);
            }
        });
        modelRoot.updateMatrixWorld(true);

        // Fire a 1×1 pixel render — forces GPU shader compilation for this size's program
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, 1, 1);
        renderer.render(scene, camera);
        renderer.setScissorTest(false);

        // Yield to keep the browser responsive (one microtask per size)
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Step 3: Restore original size textures and visibility
    const originalVatData = vatCache[originalSizeCode];
    if (originalVatData) {
        vatTexture = originalVatData.positions;
        normTexture = originalVatData.normals;
        vatMaterials.forEach(mat => {
            updateVatUniforms(mat, vatTexture, normTexture, originalVatData.info.frame_count);
        });
    }

    // Re-apply the active configuration to restore correct visibility/materials
    if (typeof applyConfigurationToScene === 'function') {
        applyConfigurationToScene(false);
    }
}




function truncateFileName(fileName, containerElement) {
    if (containerElement) {
        containerElement.title = fileName;
    }
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
        titleNode.textContent = translateToastText(title);

        toast.append(titleNode);

        if (message) {
            const messageNode = document.createElement('span');
            messageNode.className = 'toast-copy';
            messageNode.textContent = translateToastText(message);
            toast.append(messageNode);
        }

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
        closeOnScroll: false,
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
    
    // Initialize mobile 3D navigation coaching guide
    initNavCoachingGuide();
    syncARVisibility();

    if (!pdfLibraryAvailable) {
        await showToast('Preview ready', 'Graphic tools are ready, but design saving is currently unavailable.', 'info', 4000);
    } else {
        await showToast('Preview ready', 'Pick a size and layout, upload your design, tweak the preview, and save.', 'success');
    }

    const guideOverlay = document.getElementById('nav-coaching-overlay');
    const isGuideActiveOrPending = guideOverlay && !guideOverlay.hasAttribute('hidden');
    if (!isGuideActiveOrPending) {
        startPostGuideTimers();
        showArSupportedToastIfSupported();
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
    dom.charToggle.disabled = !baseEnabled;

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
    syncCharButton();
    syncSideUi('graphic');
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
    const label = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('ar.start') : 'Start AR';
    arButton.setAttribute('aria-label', label);
    arButton.title = label;
}

function ensureArDisabledFallback() {
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

function syncCharButton() {
    if (dom.charToggle) {
        dom.charToggle.classList.toggle('is-active', showCharacter);
        dom.charToggle.setAttribute('aria-pressed', String(showCharacter));
        dom.charToggle.title = showCharacter ? 'Hide Height Reference' : 'Show Height Reference';
    }
}

function createCharacterMeasurement() {
    const group = new THREE.Group();
    group.name = 'height-measurement';

    const material = new THREE.MeshBasicMaterial({
        color: 0x10B981,
        transparent: true,
        opacity: 0.8
    });

    // Helper to create a thicker line using a thin cylinder (diamond cross-section)
    function createThickLine(p1, p2, radius) {
        const direction = new THREE.Vector3().subVectors(p2, p1);
        const length = direction.length();
        
        // 4 segments is highly efficient and creates a clean 3D line
        const geom = new THREE.CylinderGeometry(radius, radius, length, 4);
        const mesh = new THREE.Mesh(geom, material);
        mesh.raycast = () => {}; // Ignore in raycasting
        
        const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        mesh.position.copy(center);
        
        const up = new THREE.Vector3(0, 1, 0);
        direction.normalize();
        mesh.quaternion.setFromUnitVectors(up, direction);
        
        return mesh;
    }

    // Thickness (radius): 0.005 meters (diameter = 1 cm, which is visually double the thickness of standard 1px lines)
    const lineRadius = 0.005;

    // Define all point pairs for the dimension lines.
    // The vertical line is broken around the text box (from y=0 to y=0.79 and y=1.07 to y=1.86).
    const lineSegmentsData = [
        [new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(-0.45, 0.79, 0)],     // Vertical line (bottom half)
        [new THREE.Vector3(-0.45, 1.07, 0), new THREE.Vector3(-0.45, 1.86, 0)],   // Vertical line (top half)
        [new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(-0.1, 0, 0)],       // Bottom extension
        [new THREE.Vector3(-0.45, 1.86, 0), new THREE.Vector3(-0.1, 1.86, 0)], // Top extension
        
        // Top arrowhead pointing up
        [new THREE.Vector3(-0.45, 1.86, 0), new THREE.Vector3(-0.49, 1.78, 0)],
        [new THREE.Vector3(-0.45, 1.86, 0), new THREE.Vector3(-0.41, 1.78, 0)],
        
        // Bottom arrowhead pointing down
        [new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(-0.49, 0.08, 0)],
        [new THREE.Vector3(-0.45, 0, 0), new THREE.Vector3(-0.41, 0.08, 0)]
    ];

    lineSegmentsData.forEach(([p1, p2]) => {
        group.add(createThickLine(p1, p2, lineRadius));
    });

    // 2. High-resolution Sprite for text label "186 cm"
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Clear
    ctx.clearRect(0, 0, 512, 256);
    
    // Configure text font (large font size to avoid pixelation, normal weight)
    ctx.font = '120px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Measure width to draw a tight, compact bounding rectangle with no extra side space
    const textMetrics = ctx.measureText('186 cm');
    const textWidth = textMetrics.width;
    
    // Compact bounding box
    const w = textWidth + 32; // Minimal padding on sides
    const h = 168;
    const x = 256 - w / 2;
    const y = 128 - h / 2;
    const r = 24;
    
    ctx.fillStyle = 'rgba(16, 24, 30, 0.85)';
    ctx.strokeStyle = '#10B981';
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
    
    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.fillText('186 cm', 256, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false // Render on top of character mesh
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.48, 0.24, 1.0);
    sprite.position.set(-0.45, 0.93, 0.05); // Centered vertically
    sprite.raycast = () => {}; // Ignore in double-tap raycasting
    group.add(sprite);

    return group;
}

function loadCharacterModel() {
    if (characterModel || characterLoading) return;
    characterLoading = true;
    
    modelLoader.load(
        '3d/character.glb',
        (gltf) => {
            characterModel = gltf.scene;
            
            // Place at negative X axis (next to the left side of the flag)
            characterModel.position.set(-0.9, 0, 0);
            
            characterModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            // Setup initial scale and rotation for the show animation
            characterModel.scale.setScalar(0);
            characterModel.rotation.y = Math.PI * 2;
            characterModel.visible = showCharacter;
            
            // Add height measurement lines and text label
            const measurement = createCharacterMeasurement();
            characterModel.add(measurement);
            
            scene.add(characterModel);
            characterLoading = false;
            sceneDirty = true;
            
            showToast('Reference loaded', '3D character model height reference added.', 'success', 2500);
            syncFlagMeasurement();
            
            if (showCharacter) {
                // Focus camera on the combined scene bounds immediately
                focusCameraView('front');

                characterTween = new TWEEN.Tween({ scale: 0, rotationY: Math.PI * 2 })
                    .to({ scale: 1, rotationY: 0 }, 800)
                    .easing(TWEEN.Easing.Cubic.Out)
                    .onUpdate(({ scale, rotationY }) => {
                        if (characterModel) {
                            characterModel.scale.setScalar(scale);
                            characterModel.rotation.y = rotationY;
                            sceneDirty = true;
                        }
                    })
                    .onComplete(() => {
                        characterTween = null;
                    })
                    .start();
            }
        },
        undefined,
        (error) => {
            console.error("Failed to load character model:", error);
            characterLoading = false;
            showToast('Loading failed', 'Could not load the 3D character model.', 'error', 3000);
        }
    );
}

function toggleCharacterVisibility() {
    showCharacter = !showCharacter;
    
    // Sync the flag measurement first so that it is added/removed before camera targets are recalculated!
    syncFlagMeasurement();
    
    if (characterTween) {
        characterTween.stop();
        characterTween = null;
    }
    
    // Trigger front view and stop turntable
    stopTurntableRotation();
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
                        sceneDirty = true;
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
                        sceneDirty = true;
                    }
                })
                .onComplete(() => {
                    if (characterModel) characterModel.visible = false;
                    characterTween = null;
                })
                .start();
        }
    }
    syncCharButton();
}

function stopTurntableRotation() {
    if (!state.turntableEnabled) return;
    state.turntableEnabled = false;
    turntableAutoStopEnabled = false;
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
    dom.envToggle.classList.toggle('is-active', open);
    dom.envToggle.setAttribute('aria-expanded', open ? 'true' : 'false');

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

                // Store original Y position of all meshes/groups in the model
                modelRoot.traverse((child) => {
                    if (child.userData.originalPosY === undefined) {
                        child.userData.originalPosY = child.position.y;
                    }
                });

                // Pre-save original maps of all flag materials
                Object.keys(flagMaterialsCache).forEach(key => {
                    Object.values(flagMaterialsCache[key]).forEach(m => {
                        if (m && !m.userData.originalMap) {
                            m.userData.originalMap = m.map;
                        }
                    });
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
                                if (!child.customDepthMaterial.userData.compiledShaders) {
                                    child.customDepthMaterial.userData.compiledShaders = [];
                                }
                                if (!child.customDepthMaterial.userData.compiledShaders.includes(shader)) {
                                    child.customDepthMaterial.userData.compiledShaders.push(shader);
                                }
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

                            material.side = THREE.FrontSide;
                            const backMesh = child.clone();
                            backMesh.userData.isBackClone = true;
                            backMesh.userData.originalPosY = child.userData.originalPosY;
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
                                if (!mat.userData.compiledShaders) {
                                    mat.userData.compiledShaders = [];
                                }
                                if (!mat.userData.compiledShaders.includes(shader)) {
                                    mat.userData.compiledShaders.push(shader);
                                }

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

                // Keep loading overlay open — silently warm up every size via 1px renders, then reveal
                silentWarmupAllSizes().then(() => {
                    syncReadyState();
                });
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
            if (file) handleGraphicFile(side, file);
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
            if (file) handleGraphicFile(side, file);
        });

        config.resetButton.addEventListener('click', () => resetTransforms(side));
        config.clearButton.addEventListener('click', () => clearGraphic(side, true));
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
    if (dom.addToCart) {
        dom.addToCart.addEventListener('click', () => {
            showToast('Coming Soon.....', '', 'info', 2500);
        });
    }
    dom.turntableToggle.addEventListener('click', toggleTurntable);

    // Toggle preferences dropdown menu
    if (dom.prefBtn) {
        dom.prefBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = dom.prefDropdown.classList.contains('is-open');
            setPreferenceDropdownOpen(!isOpen);
        });
    }

    // Click outside to close preferences dropdown menu
    document.addEventListener('click', (event) => {
        if (dom.prefDropdown && dom.prefDropdown.classList.contains('is-open')) {
            if (!dom.prefDropdown.contains(event.target) && !dom.prefBtn.contains(event.target)) {
                setPreferenceDropdownOpen(false);
            }
        }
    });

    // Language list items click handlers
    if (dom.prefLangList) {
        const langItems = dom.prefLangList.querySelectorAll('.pref-menu-item');
        langItems.forEach(item => {
            item.addEventListener('click', async () => {
                currentLanguage = item.dataset.value;
                localStorage.setItem('pref-language', currentLanguage);
                syncPreferenceMenuUi();
                if (window.i18next && window.i18next.isInitialized) {
                    await window.i18next.changeLanguage(currentLanguage);
                    updateContentWithTranslations();
                    updateDynamicPrices();
                    updateTemplateDownloadLink();
                }
            });
        });
    }

    // Currency list items click handlers
    if (dom.prefCurrencyList) {
        const currencyItems = dom.prefCurrencyList.querySelectorAll('.pref-menu-item');
        currencyItems.forEach(item => {
            item.addEventListener('click', () => {
                currentCurrency = item.dataset.value;
                localStorage.setItem('pref-currency', currentCurrency);
                syncPreferenceMenuUi();
                updateDynamicPrices();
            });
        });
    }

    window.addEventListener('keydown', (event) => {
        const activeTag = document.activeElement?.tagName;
        const isInteractiveFocus = activeTag === 'INPUT' || activeTag === 'BUTTON' || document.activeElement?.classList.contains('upload-card');

        if (event.code === 'Space' && !isInteractiveFocus) {
            event.preventDefault();
            toggleAnimation();
        }
    });

    dom.charToggle.addEventListener('click', () => {
        if (dom.charToggle.disabled) return;
        toggleCharacterVisibility();
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
        sceneDirty = true;
    });

    dom.envRotate.addEventListener('input', (event) => {
        if (!environmentTexture) return;
        const radians = Number.parseFloat(event.target.value);
        scene.environmentRotation.y = radians;
        lightingGroup.rotation.y = radians;
        sceneDirty = true;
    });

    dom.envReset.addEventListener('click', () => {
        dom.envExposure.value = '1';
        dom.envRotate.value = '0';
        renderer.toneMappingExposure = 1;
        scene.environmentRotation.y = 0;
        lightingGroup.rotation.y = 0;
        sceneDirty = true;
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
   Graphic & Transform Handlers
--------------------------------- */
async function handleGraphicFile(side, file) {
    const config = sideConfigs[side];

    if (!state.ready || !modelRoot) {
        showToast('Preview still loading', 'Please wait for the 3D preview to finish loading before uploading graphic.', 'info', 3600);
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

    // Helper to check if crop areas contain actual graphics (non-white, non-transparent pixels)
    const hasGraphicInCropAreas = (context, width, height) => {
        if (width === 2048 && height === 2048) return false;

        const sourceX = Math.round((width - 2048) / 2);
        const sourceY = Math.round((height - 2048) / 2);

        const checkPixel = (r, g, b, a) => {
            if (a < 5) return false; // Transparent/near-transparent
            if (r > 250 && g > 250 && b > 250) return false; // White/near-white
            return true; // Actual graphic content detected!
        };

        if (height > 2048) {
            // Check top crop area
            if (sourceY > 0) {
                const topData = context.getImageData(0, 0, width, sourceY).data;
                for (let i = 0; i < topData.length; i += 4) { // Check every single pixel for absolute graphic detection
                    if (checkPixel(topData[i], topData[i + 1], topData[i + 2], topData[i + 3])) return true;
                }
            }
            // Check bottom crop area
            const bottomStartY = sourceY + 2048;
            const bottomHeight = height - bottomStartY;
            if (bottomHeight > 0) {
                const bottomData = context.getImageData(0, bottomStartY, width, bottomHeight).data;
                for (let i = 0; i < bottomData.length; i += 4) {
                    if (checkPixel(bottomData[i], bottomData[i + 1], bottomData[i + 2], bottomData[i + 3])) return true;
                }
            }
        } else if (width > 2048) {
            // Check left crop area
            if (sourceX > 0) {
                const leftData = context.getImageData(0, 0, sourceX, height).data;
                for (let i = 0; i < leftData.length; i += 4) {
                    if (checkPixel(leftData[i], leftData[i + 1], leftData[i + 2], leftData[i + 3])) return true;
                }
            }
            // Check right crop area
            const rightStartX = sourceX + 2048;
            const rightWidth = width - rightStartX;
            if (rightWidth > 0) {
                const rightData = context.getImageData(rightStartX, 0, rightWidth, height).data;
                for (let i = 0; i < rightData.length; i += 4) {
                    if (checkPixel(rightData[i], rightData[i + 1], rightData[i + 2], rightData[i + 3])) return true;
                }
            }
        }

        return false;
    };

    // Helper to crop and convert a scaled canvas to high-fidelity WebP (maximum quality 1.0)
    const cropAndConvertCanvasToWebP = async (renderCanvas, isCroppedCentered, fileName) => {
        const cropCanvas = document.createElement('canvas');
        const cropContext = cropCanvas.getContext('2d');
        cropCanvas.width = 2048;
        cropCanvas.height = 2048;

        if (isCroppedCentered) {
            // Shorter side was scaled to 2048. Extract 2048x2048 center square
            const sourceX = Math.round((renderCanvas.width - 2048) / 2);
            const sourceY = Math.round((renderCanvas.height - 2048) / 2);
            cropContext.drawImage(renderCanvas, sourceX, sourceY, 2048, 2048, 0, 0, 2048, 2048);
        } else {
            // Larger side was scaled to 2048. Draw centered with white padding on shorter side
            cropContext.fillStyle = '#ffffff';
            cropContext.fillRect(0, 0, 2048, 2048);

            const destX = Math.round((2048 - renderCanvas.width) / 2);
            const destY = Math.round((2048 - renderCanvas.height) / 2);
            cropContext.drawImage(renderCanvas, destX, destY);
        }

        // Convert to WebP at a visually lossless quality factor (0.90) to ensure compact file size and perfect details
        const blob = await new Promise((resolve) => cropCanvas.toBlob(resolve, 'image/webp', 0.90));
        return new File([blob], fileName.replace(/\.[^/.]+$/, '') + '.webp', { type: 'image/webp' });
    };

    const fileType = file.type;
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const isPdf = fileType === 'application/pdf' || fileExtension === 'pdf';
    const isImage = /^image\/(png|jpeg|webp)$/.test(fileType) || ['png', 'jpg', 'jpeg', 'webp'].includes(fileExtension);

    if (isPdf) {
        if (typeof pdfjsLib === 'undefined') {
            showToast('Loading PDF System', 'Preparing the PDF processing modules...', 'info', 3000);
            const success = await loadPdfLibraries();
            if (!success) {
                config.dropzone.classList.remove('is-loading');
                restoreAnimation();
                return;
            }
        }
        showToast('Processing PDF', 'Converting the first page of the PDF to a high-quality WebP image.', 'info', 3000);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1 });

            // 1. Try scaling shorter side to 2048 first
            let scale = 2048 / Math.min(viewport.width, viewport.height);
            let scaledViewport = page.getViewport({ scale });

            let renderCanvas = document.createElement('canvas');
            let renderContext = renderCanvas.getContext('2d');
            renderCanvas.width = scaledViewport.width;
            renderCanvas.height = scaledViewport.height;

            await page.render({ canvasContext: renderContext, viewport: scaledViewport }).promise;

            // 2. Check if the cut-off areas contain any actual graphics
            let isCroppedCentered = true;
            if (hasGraphicInCropAreas(renderContext, renderCanvas.width, renderCanvas.height)) {
                // Graphic detected in crop area! Fallback to scaling the larger side to prevent graphic cutting
                isCroppedCentered = false;
                scale = 2048 / Math.max(viewport.width, viewport.height);
                scaledViewport = page.getViewport({ scale });

                renderCanvas.width = scaledViewport.width;
                renderCanvas.height = scaledViewport.height;

                await page.render({ canvasContext: renderContext, viewport: scaledViewport }).promise;
            }

            file = await cropAndConvertCanvasToWebP(renderCanvas, isCroppedCentered, file.name);
        } catch (error) {
            console.error('PDF conversion failed:', error);
            config.dropzone.classList.remove('is-loading');
            restoreAnimation();
            showToast('PDF error', 'Failed to read or convert the PDF file.', 'error', 4200);
            return;
        }
    } else if (isImage) {
        // High-fidelity image processing: scale by shorter side first, analyze, and fallback if graphics are in margins
        showToast('Processing Image', 'Formatting the image to a high-fidelity WebP texture.', 'info', 1800);
        try {
            const loadImageElement = (src) => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = (err) => reject(err);
                    img.src = src;
                });
            };

            const imgUrl = URL.createObjectURL(file);
            const img = await loadImageElement(imgUrl);
            URL.revokeObjectURL(imgUrl);

            // 1. Try scaling shorter side to 2048 first
            let scale = 2048 / Math.min(img.naturalWidth, img.naturalHeight);
            let scaledWidth = img.naturalWidth * scale;
            let scaledHeight = img.naturalHeight * scale;

            let renderCanvas = document.createElement('canvas');
            let renderContext = renderCanvas.getContext('2d');
            renderCanvas.width = scaledWidth;
            renderCanvas.height = scaledHeight;

            renderContext.drawImage(img, 0, 0, scaledWidth, scaledHeight);

            // 2. Check if the cut-off areas contain any actual graphics
            let isCroppedCentered = true;
            if (hasGraphicInCropAreas(renderContext, renderCanvas.width, renderCanvas.height)) {
                // Graphic detected in crop area! Fallback to scaling the larger side to prevent graphic cutting
                isCroppedCentered = false;
                scale = 2048 / Math.max(img.naturalWidth, img.naturalHeight);
                scaledWidth = img.naturalWidth * scale;
                scaledHeight = img.naturalHeight * scale;

                renderCanvas.width = scaledWidth;
                renderCanvas.height = scaledHeight;

                renderContext.drawImage(img, 0, 0, scaledWidth, scaledHeight);
            }

            file = await cropAndConvertCanvasToWebP(renderCanvas, isCroppedCentered, file.name);
        } catch (error) {
            console.error('Image processing failed:', error);
            config.dropzone.classList.remove('is-loading');
            restoreAnimation();
            showToast('Image error', 'Failed to process the uploaded image.', 'error', 4200);
            return;
        }
    } else {
        config.dropzone.classList.remove('is-loading');
        restoreAnimation();
        showToast('Unsupported file', 'Please upload a PNG, JPG, JPEG, WEBP, or PDF file.', 'error', 3800);
        return;
    }

    const textureUrl = URL.createObjectURL(file);

    textureLoader.load(
        textureUrl,
        (texture) => {
            URL.revokeObjectURL(textureUrl);

            const previousTexture = config.uploadedTexture;
            const previousFrontTex = config.uploadedFrontTex;
            const previousBackTex = config.uploadedBackTex;
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
            config.uploadedFrontTex = texture.clone();
            config.uploadedBackTex = texture.clone();
            config.previewUrl = URL.createObjectURL(file);
            config.thumb.src = config.previewUrl;

            if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl);
            if (previousTexture) previousTexture.dispose();
            if (previousFrontTex) previousFrontTex.dispose();
            if (previousBackTex) previousBackTex.dispose();

            resetTransformInputs(side);
            updateTextureTransforms(side);
            saveCurrentGraphicToCache();
            if (modelRoot) modelRoot.userData.lastConfigStr = null;
            applyConfigurationToScene(false);
            config.dropzone.classList.remove('is-loading');
            syncSideUi(side);
            config.titleElement.textContent = truncateFileName(config.fileName, config.titleElement);
            config.input.value = '';

            restoreAnimation();
            const targetView = (configState.direction === 'Left') ? 'back' : 'front';
            focusCameraView(targetView, 800, false);

            showToast('Graphic applied', `${config.label} graphic has been updated successfully.`, 'success');

            // Trigger AR suggestion toast and glow animation (once per session on AR-supported devices)
            if (state.arSupported && !arSuggestionShown) {
                arSuggestionShown = true;
                window.setTimeout(() => {
                    if (!state.isInAR) {
                        showToast('Curious how it looks in real life?', 'View it in AR.', 'info', 6000);
                        const btn = document.getElementById('ARButton');
                        if (btn) {
                            btn.classList.add('ar-breath-glow');
                            window.setTimeout(() => {
                                btn.classList.remove('ar-breath-glow');
                            }, 20000);
                        }
                    }
                }, 10000);
            }
        },
        undefined,
        () => {
            URL.revokeObjectURL(textureUrl);
            config.input.value = '';
            config.dropzone.classList.remove('is-loading');
            restoreAnimation();
            showToast('Upload failed', `The ${config.label.toLowerCase()} graphic could not be processed.`, 'error', 4200);
        }
    );
}

function clearGraphic(side, announce = false) {
    const config = sideConfigs[side];

    if (config.uploadedTexture) {
        config.uploadedTexture.dispose();
        config.uploadedTexture = null;
    }
    if (config.uploadedFrontTex) {
        config.uploadedFrontTex.dispose();
        config.uploadedFrontTex = null;
    }
    if (config.uploadedBackTex) {
        config.uploadedBackTex.dispose();
        config.uploadedBackTex = null;
    }

    if (config.previewUrl) {
        URL.revokeObjectURL(config.previewUrl);
        config.previewUrl = null;
    }

    config.thumb.removeAttribute('src');
    config.input.value = '';
    config.titleElement.textContent = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('upload.title') : config.defaultTitle;
    config.titleElement.removeAttribute('title');
    resetTransformInputs(side);
    saveCurrentGraphicToCache();
    if (modelRoot) modelRoot.userData.lastConfigStr = null;
    applyConfigurationToScene(false);
    syncSideUi(side);

    if (announce) {
        showToast('Graphic removed', `${config.label} graphic has been cleared from the preview.`, 'info');
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
    sceneDirty = true;
    const config = sideConfigs[side];
    if (!config.uploadedTexture) return;

    const scale = Number.parseFloat(config.scaleInput.value);
    const panX = Number.parseFloat(config.xInput.value);
    const panY = Number.parseFloat(config.yInput.value);

    [config.uploadedTexture, config.uploadedFrontTex, config.uploadedBackTex].forEach(tex => {
        if (tex) {
            tex.repeat.set(1 / scale, 1 / scale);
            tex.offset.set(-panX, panY);
            tex.needsUpdate = true;
        }
    });

    saveCurrentGraphicToCache();
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
    turntableAutoStopEnabled = false;
    syncTurntableButton();
}

function syncPlayPauseButton() {
    dom.playPause.classList.toggle('is-paused', !isPlaying);
    dom.playPause.classList.toggle('is-active', isPlaying);
    dom.playPause.title = isPlaying ? 'Pause Animation' : 'Play Animation';
    dom.playPause.setAttribute('aria-label', isPlaying ? 'Pause Animation' : 'Play Animation');
}

async function generatePdfProof() {
    if (!state.ready || state.isExporting) return;
    
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function') {
        const success = await loadPdfLibraries();
        if (!success) return;
    }

    state.isExporting = true;
    syncControlAvailability();
    dom.generatePdf.textContent = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('actions.saving') : 'Saving...';

    const slowGenerationTimer = setTimeout(() => {
        showToast('Saving design', 'Capturing front and back layouts for your design.', 'info', 3000);
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
        const pdfTitle = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('pdf.title') : 'Flag Configurator - Saved Design';
        const pdfSavedOn = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('pdf.saved_on') : 'Saved on: ';
        const pdfFrontLayout = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('pdf.front_layout') : 'Front Layout';
        const pdfBackLayout = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('pdf.back_layout') : 'Back Layout';
        const pdfFilename = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('pdf.filename') : 'Flag_Design';

        function hexToRgb(hex) {
            const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
            const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 0, g: 0, b: 0 };
        }

        const getTrans = (key, fallback) => {
            return (window.i18next && window.i18next.isInitialized) ? window.i18next.t(key) : fallback;
        };

        const lblSize = getTrans('sections.size', 'Size');
        const valSize = getTrans(`selections.size.${configState.size}`, configState.size);

        const lblPrinting = getTrans('sections.printing', 'Printing');
        const valPrinting = getTrans(`selections.printing.${configState.printing}`, configState.printing);

        const lblDirection = getTrans('sections.direction', 'Direction');
        const valDirection = configState.printing === 'Double Sided' ? '-' : getTrans(`selections.direction.${configState.direction}`, configState.direction);

        const lblPole = getTrans('sections.pole', 'Pole');
        const valPole = getTrans(`selections.pole.${configState.pole}`, configState.pole);

        const lblBase = getTrans('sections.base', 'Base');
        const valBase = getTrans(`selections.base.${configState.base}`, configState.base);

        const lblPocketColor = getTrans('sections.pole_cover', 'Pocket Color');
        const valPocketColor = normalizeHex(dom.pocketColor.value) || dom.pocketColor.value;

        // Calculate dynamic prices
        let sizePrice = 0;
        let printingAddon = 0;
        let poleAddon = 0;
        let basePrice = 0;
        const currencySymbol = getCurrencySymbol();

        if (pricingData) {
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
                const mappedBase = baseMapping[configState.base] || configState.base;
                if (mappedBase && pricingData.pricingTiers.bases[mappedBase]) {
                    basePrice = pricingData.pricingTiers.bases[mappedBase];
                }
            }
        }

        const totalPrice = sizePrice + printingAddon + poleAddon + basePrice;

        // Print header and date
        doc.setFontSize(20);
        doc.setTextColor(50, 50, 50);
        doc.setFont('helvetica', 'bold');
        doc.text(pdfTitle, 20, 18);
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.setFont('helvetica', 'normal');
        doc.text(`${pdfSavedOn}${new Date().toLocaleDateString()}`, 20, 26);

        // Print total price in top right
        const pdfTotalPriceLabel = getTrans('pdf.total_price', 'Total Price') + ':';
        const pdfTotalPriceVal = `${currencySymbol} ${totalPrice.toFixed(2)}`;
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'bold');
        doc.text(pdfTotalPriceLabel, 277, 18, { align: 'right' });
        doc.setFontSize(20);
        doc.setTextColor(5, 150, 105); // Match --primary-strong brand color
        doc.text(pdfTotalPriceVal, 277, 26, { align: 'right' });

        // Print layout labels and front/back views
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text(pdfFrontLayout, 20, 36);
        doc.addImage(frontImage, 'JPEG', 20, 40, 105, 105);

        doc.text(pdfBackLayout, 150, 36);
        doc.addImage(backImage, 'JPEG', 150, 40, 105, 105);

        // Draw horizontal divider line
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.5);
        doc.line(20, 153, 277, 153);

        // Print configuration options headers
        doc.setFontSize(9);
        doc.setTextColor(130, 130, 130);
        doc.setFont('helvetica', 'bold');
        doc.text(lblSize, 20, 161);
        doc.text(lblPrinting, 75, 161);
        doc.text(lblDirection, 125, 161);
        doc.text(lblPole, 165, 161);
        doc.text(lblBase, 205, 161);
        doc.text(lblPocketColor, 245, 161);

        // Print configuration options values
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'normal');
        doc.text(valSize, 20, 168);
        doc.text(valPrinting, 75, 168);
        doc.text(valDirection, 125, 168);
        doc.text(valPole, 165, 168);
        doc.text(valBase, 205, 168);
        doc.text(valPocketColor, 245, 168);

        // Print individual option prices
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(`${currencySymbol} ${sizePrice.toFixed(2)}`, 20, 174);
        doc.text((printingAddon > 0 ? `+ ${currencySymbol} ${printingAddon.toFixed(2)}` : `${currencySymbol} 0.00`), 75, 174);
        doc.text('', 125, 174); // Direction has no price
        doc.text((poleAddon > 0 ? `+ ${currencySymbol} ${poleAddon.toFixed(2)}` : `${currencySymbol} 0.00`), 165, 174);
        doc.text((basePrice > 0 ? `+ ${currencySymbol} ${basePrice.toFixed(2)}` : `${currencySymbol} 0.00`), 205, 174);

        // Draw pocket color box
        const rgb = hexToRgb(valPocketColor);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(245, 171, 12, 6, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(245, 171, 12, 6, 'D');

        let sizeTextPart = configState.size;
        if (window.i18next && window.i18next.isInitialized) {
            sizeTextPart = window.i18next.t(`selections.size.${configState.size}`);
        }
        let sizePart = sizeTextPart.replace(/\s+/g, '-');

        let printingTextPart = configState.printing;
        if (window.i18next && window.i18next.isInitialized) {
            printingTextPart = window.i18next.t(`selections.printing.${configState.printing}`);
        }
        let printingPart = printingTextPart.replace(/\s+/g, '-');

        let directionPart = '';
        if (configState.printing !== 'Double Sided') {
            let directionTextPart = configState.direction;
            if (window.i18next && window.i18next.isInitialized) {
                directionTextPart = window.i18next.t(`selections.direction.${configState.direction}`);
            }
            directionPart = '-' + directionTextPart.replace(/\s+/g, '-');
        }

        let configDetails = `${sizePart}-${printingPart}${directionPart}`;
        configDetails = configDetails.replace(/\s+/g, '-');

        doc.save(`${pdfFilename}_${configDetails}.pdf`);
        showToast('Design saved', 'Your custom flag design has been saved successfully.', 'success');
    } catch (error) {
        console.error(error);
        showToast('Save failed', 'Unable to save your design. Please try again.', 'error', 4200);
    } finally {
        clearTimeout(slowGenerationTimer);
        dom.generatePdf.innerHTML = pdfButtonMarkup;
        updateContentWithTranslations();
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
        exportRenderer.shadowMap.type = THREE.PCFShadowMap;

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

function transitionCameraSpinHalf(targetPosition, duration = 800, isSecondHalf = false) {
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

    // Force rotation in the clockwise (negative) direction to end exactly at the target's theta!
    while (endSpherical.theta >= startSpherical.theta) {
        endSpherical.theta -= Math.PI * 2;
    }
    while (startSpherical.theta - endSpherical.theta > Math.PI * 2) {
        endSpherical.theta += Math.PI * 2;
    }

    const easingFunc = isSecondHalf ? TWEEN.Easing.Quadratic.In : TWEEN.Easing.Quadratic.Out;

    activeCameraTween = new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, duration)
        .easing(easingFunc)
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

function focusCameraSpinHalf(view, duration = 800, isSecondHalf = false, isSequence = false) {
    // Freshly calculate targets with unrotated neutral bounds
    updateDynamicCameraTargets(false);

    const targetPosition = cameraTargets[view];
    if (!targetPosition) return;
    if (typeof isZoomedIn !== 'undefined') isZoomedIn = false;
    preZoomState = null;

    if (!isSequence) {
        currentCameraSequenceId++;
    }

    transitionCameraSpinHalf(targetPosition, duration, isSecondHalf);
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
                syncReadyState();
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
    if (characterModel) characterModel.visible = false; // Hide human reference mesh in AR
    
    syncControlAvailability();
    
    // Show AR coaching overlay
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

    // Hide AR coaching overlay
    const coachingOverlay = document.getElementById('ar-coaching-overlay');
    if (coachingOverlay) {
        coachingOverlay.classList.remove('is-visible');
    }

    if (characterModel) characterModel.visible = showCharacter; // Restore human reference visibility

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
    const coachingOverlay = document.getElementById('ar-coaching-overlay');

    if (hitTestResults.length === 0) {
        reticle.visible = false;
        // If the model hasn't been placed yet, show the coaching overlay when surface is lost
        if (coachingOverlay && sceneRoot && !sceneRoot.visible) {
            coachingOverlay.classList.add('is-visible');
        }
        return;
    }

    const pose = hitTestResults[0].getPose(referenceSpace);
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);

    // Hide coaching overlay when a surface is detected
    if (coachingOverlay) {
        coachingOverlay.classList.remove('is-visible');
    }
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

    // Hide coaching overlay on placement
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
    sceneDirty = true;
    const width = dom.canvasContainer.clientWidth;
    const height = dom.canvasContainer.clientHeight;

    const isMidRange = window.innerWidth >= 769 && window.innerWidth <= 1100;
    const shiftX = isMidRange ? 250 : 0;

    camera.aspect = width / Math.max(height, 1);
    if (shiftX > 0) {
        camera.setViewOffset(width, height, -shiftX / 2.5, 0, width, height);
    } else {
        camera.clearViewOffset();
    }
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
let lastRenderTime = 0;

function renderFrame(_, frame) {
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
    const delta = timer.getDelta(); // This is the crucial fix for pausing!

    if (state.turntableEnabled && !state.isInAR) {
        const step = turntableSpeed * delta;
        sceneRoot.rotation.y += step;

        if (turntableAutoStopEnabled) {
            turntableAccumulatedAngle += Math.abs(step);
            if (turntableAccumulatedAngle >= Math.PI * 8) {
                state.turntableEnabled = false;
                syncTurntableButton();
                turntableAutoStopEnabled = false;
                
                // Trigger home view preset
                const homeBtn = dom.cameraButtons.find(b => b.dataset.view === 'home');
                if (homeBtn) {
                    homeBtn.click();
                } else {
                    focusCameraView('home');
                }
            }
        }
    }

    // --- UPDATE VAT ANIMATION TIME ---
    if (isPlaying) {
        accumulatedTime += delta; // Accumulate delta instead of elapsed
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
    controlsDirty = false; // Reset controls dirty flag

    const tweensActive = TWEEN.getAll().length > 0;
    const turntableActive = state.turntableEnabled && !state.isInAR;
    const flagActive = isPlaying;
    const arActive = state.isInAR;

    const needsRender = sceneDirty || 
                        controlsChanged || 
                        tweensActive || 
                        turntableActive || 
                        flagActive || 
                        arActive;

    if (needsRender && state.modelLoaded) {
        renderer.render(scene, camera);
        sceneDirty = false;
    }
}

/* ---------------------------------
   3D Canvas Navigation Coaching Guide
--------------------------------- */
function preloadLottieAnimation() {
    if (preloadedLottieBuffer || isLottiePreloading) return;
    isLottiePreloading = true;
    
    const lottieUrl = "https://lottie.host/57373add-d2b2-40e1-8f5a-ce8c39890929/yacSXj2kVC.lottie";
    fetch(lottieUrl)
        .then(response => {
            if (!response.ok) throw new Error("Network response was not ok");
            return response.arrayBuffer();
        })
        .then(buffer => {
            preloadedLottieBuffer = buffer;
        })
        .catch(err => {
            console.warn("Failed to prefetch pinch dotLottie animation:", err);
            isLottiePreloading = false;
        });
}

function initNavCoachingGuide() {
    const isMobile = mobileViewportMediaQuery.matches;
    const isAlreadyDone = localStorage.getItem('flag_configurator_nav_guide_done') === 'true';
    if (!isMobile || isAlreadyDone) return;

    // Start prefetching the Lottie animation immediately
    preloadLottieAnimation();

    const overlay = document.getElementById('nav-coaching-overlay');
    if (overlay) {
        overlay.removeAttribute('hidden');
    }

    // Blur config container during active guide welcome screen
    const uiContainer = document.getElementById('ui-container');
    if (uiContainer) {
        uiContainer.classList.add('is-blurred');
    }

    document.getElementById('nav-guide-start-btn')?.addEventListener('click', () => {
        localStorage.setItem('flag_configurator_nav_guide_done', 'true');
        document.getElementById('nav-coaching-step-welcome')?.setAttribute('hidden', '');
        document.getElementById('nav-coaching-step-guide')?.removeAttribute('hidden');
        
        // Ensure prefetch is triggered if not already
        preloadLottieAnimation();

        // Trigger front view and stop turntable rotation immediately when user starts guide
        focusCameraView('front');
        stopTurntableRotation();
        
        // Pause flag VAT animation
        isPlaying = false;
        if (action) action.paused = true;
        syncPlayPauseButton();
        
        navGuideState.active = true;
        startNavGuideStep(1);
    });

    const skipGuide = () => {
        localStorage.setItem('flag_configurator_nav_guide_done', 'true');
        const overlay = document.getElementById('nav-coaching-overlay');
        if (overlay) overlay.setAttribute('hidden', '');
        navGuideState.active = false;
        
        // Remove container blur
        const uiContainer = document.getElementById('ui-container');
        if (uiContainer) {
            uiContainer.classList.remove('is-blurred');
        }
        
        // Start timers and show AR Support toast after skipping guide
        startPostGuideTimers();
        showArSupportedToastIfSupported();
    };

    document.getElementById('nav-guide-skip-btn')?.addEventListener('click', skipGuide);
    document.getElementById('nav-guide-cancel-btn')?.addEventListener('click', skipGuide);
}

function startNavGuideStep(step) {
    navGuideState.currentStep = step;
    navGuideState.hasCompletedCurrentStep = false;
    navGuideState.gestureStarted = false;
    navGuideState.userInteracting = false;
    
    navGuideState.startTarget.copy(controls.target);
    navGuideState.startCameraDistance = camera.position.distanceTo(controls.target);
    navGuideState.startAzimuth = controls.getAzimuthalAngle();
    navGuideState.startPolar = controls.getPolarAngle();

    updateNavGuideUI();
}

function updateNavGuideUI() {
    const step = navGuideState.currentStep;
    const svgContainer = document.getElementById('nav-coaching-svg-container');
    if (svgContainer) {
        if (step === 1) svgContainer.innerHTML = svgRotate;
        else if (step === 2) svgContainer.innerHTML = svgPan;
        else if (step === 3) {
            svgContainer.innerHTML = svgZoom;
            try {
                const config = {
                    autoplay: true,
                    loop: true,
                    canvas: document.getElementById("dotlottie-canvas")
                };
                
                if (preloadedLottieBuffer) {
                    config.data = preloadedLottieBuffer;
                } else {
                    config.src = "https://lottie.host/57373add-d2b2-40e1-8f5a-ce8c39890929/yacSXj2kVC.lottie";
                }
                
                new DotLottie(config);
            } catch (err) {
                console.error("Failed to initialize pinch dotLottie animation:", err);
            }
        }
        else if (step === 4) svgContainer.innerHTML = svgDoubleTap;
    }

    const t = (key, def) => (window.i18next && window.i18next.isInitialized) ? window.i18next.t(key) : def;

    const stepNumEl = document.getElementById('nav-coaching-step-num');
    if (stepNumEl) {
        stepNumEl.textContent = t('nav_guide.step_of', `Step ${step} of 4`).replace('{{current}}', step).replace('{{total}}', 4);
    }

    const titleEl = document.getElementById('nav-step-title');
    const descEl = document.getElementById('nav-step-desc');

    if (step === 1) {
        if (titleEl) titleEl.textContent = t('nav_guide.rotate_title', 'Rotate the Flag');
        if (descEl) descEl.textContent = t('nav_guide.rotate_desc', 'Drag with one finger on the screen to rotate the 3D view.');
    } else if (step === 2) {
        if (titleEl) titleEl.textContent = t('nav_guide.pan_title', 'Move the View');
        if (descEl) descEl.textContent = t('nav_guide.pan_desc', 'Drag with two fingers to pan and move the flag.');
    } else if (step === 3) {
        if (titleEl) titleEl.textContent = t('nav_guide.zoom_title', 'Pinch to Zoom');
        if (descEl) descEl.textContent = t('nav_guide.zoom_desc', 'Pinch with two fingers inward or outward to zoom the view.');
    } else if (step === 4) {
        if (titleEl) titleEl.textContent = t('nav_guide.double_tap_title', 'Double Tap Zoom');
        if (descEl) descEl.textContent = t('nav_guide.double_tap_desc', 'Double tap on the flag to quickly zoom in or out.');
    }

    document.querySelectorAll('.nav-dot').forEach(dot => {
        const dotStep = parseInt(dot.dataset.step);
        dot.classList.toggle('active', dotStep === step);
    });
}

function checkNavGuideGesture() {
    if (!navGuideState.active || navGuideState.hasCompletedCurrentStep) return;
    if (!navGuideState.userInteracting) return;

    const step = navGuideState.currentStep;
    if (step === 1) {
        const azimuthDiff = Math.abs(controls.getAzimuthalAngle() - navGuideState.startAzimuth);
        const polarDiff = Math.abs(controls.getPolarAngle() - navGuideState.startPolar);
        if (azimuthDiff > 0.08 || polarDiff > 0.08) {
            completeNavGuideStep();
        }
    } else if (step === 2) {
        const targetDiff = controls.target.distanceTo(navGuideState.startTarget);
        if (targetDiff > 0.08) {
            completeNavGuideStep();
        }
    } else if (step === 3) {
        const distance = camera.position.distanceTo(controls.target);
        const distDiff = Math.abs(distance - navGuideState.startCameraDistance);
        if (distDiff > 0.15) {
            completeNavGuideStep();
        }
    }
}

function completeNavGuideStep() {
    navGuideState.hasCompletedCurrentStep = true;
    
    setTimeout(() => {
        const successEl = document.getElementById('nav-step-success');
        if (successEl) {
            successEl.removeAttribute('hidden');
            successEl.classList.add('is-visible');
        }

        setTimeout(() => {
            if (successEl) {
                successEl.setAttribute('hidden', '');
                successEl.classList.remove('is-visible');
            }
            
            if (navGuideState.currentStep < 4) {
                startNavGuideStep(navGuideState.currentStep + 1);
            } else {
                const overlay = document.getElementById('nav-coaching-overlay');
                if (overlay) overlay.setAttribute('hidden', '');
                navGuideState.active = false;
                
                // Remove container blur
                const uiContainer = document.getElementById('ui-container');
                if (uiContainer) {
                    uiContainer.classList.remove('is-blurred');
                }

                // Trigger the home view button and start turntable immediately after guide completion
                focusCameraView('home');
                startTurntableAutoStart();

                // Play flag VAT animation
                isPlaying = true;
                if (action) action.paused = false;
                syncPlayPauseButton();

                // Wait to vanish the 'guide completed' toast then show 'AR Supported' toast and start VAT timer
                showToast('Guide Completed', 'You are ready to explore the flag configurator!', 'success').then(() => {
                    showArSupportedToastIfSupported();
                    startVatAnimationTimer();
                });
            }
        }, 1200);
    }, 1000);
}

let autoPauseTimeout = null;

function startTurntableAutoStart() {
    state.turntableEnabled = true;
    turntableAutoStopEnabled = true;
    turntableAccumulatedAngle = 0;
    syncTurntableButton();
}

function startVatAnimationTimer() {
    // Start 60-second auto-pause countdown for flag animation
    if (autoPauseTimeout) window.clearTimeout(autoPauseTimeout);
    autoPauseTimeout = window.setTimeout(() => {
        if (isPlaying) {
            isPlaying = false;
            if (action) action.paused = true;
            syncPlayPauseButton();
            showToast('Flag Animation Paused', '', 'info', 3000);
        }
    }, 60000);
}

function startPostGuideTimers() {
    if (state.turntableEnabled) {
        startTurntableAutoStart();
    }
    startVatAnimationTimer();
}

function showArSupportedToastIfSupported() {
    if (state.arSupported && !state.arSupportedToastShown) {
        const guideOverlay = document.getElementById('nav-coaching-overlay');
        const isGuideActiveOrPending = guideOverlay && !guideOverlay.hasAttribute('hidden');
        if (isGuideActiveOrPending) return;

        // If there are still active or vanishing toasts, check again soon
        if (activeToasts.length > 0 || (dom.toastRegion && dom.toastRegion.children.length > 0)) {
            window.setTimeout(showArSupportedToastIfSupported, 100);
            return;
        }

        state.arSupportedToastShown = true;
        showToast('AR Supported', 'Ready for AR! Tap the green AR button on the right to place the flag in the real world.', 'success', 5000);
    }
}
