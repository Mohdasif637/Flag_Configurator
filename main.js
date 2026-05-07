import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const dom = {
    canvasContainer: document.getElementById('canvas-container'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    uiPanel: document.getElementById('ui-panel'),
    doubleSided: document.getElementById('double-sided'),
    pocketColor: document.getElementById('pocket-color'),
    pocketColorTrigger: document.getElementById('pocket-color-trigger'),
    pocketColorPopover: document.getElementById('pocket-color-popover'),
    pocketColorSurface: document.getElementById('pocket-color-surface'),
    pocketColorCursor: document.getElementById('pocket-color-cursor'),
    pocketColorHue: document.getElementById('pocket-color-hue'),
    pocketColorHex: document.getElementById('pocket-color-hex'),
    pocketColorValue: document.getElementById('pocket-color-value'),
    pocketColorSwatch: document.getElementById('pocket-color-swatch'),
    pocketColorClose: document.getElementById('pocket-color-close'),
    playPause: document.getElementById('play-pause'),
    generatePdf: document.getElementById('generate-pdf'),
    backArtworkGroup: document.getElementById('back-artwork-group'),
    cameraWrapper: document.getElementById('camera-wrapper'),
    envToggle: document.getElementById('env-toggle'),
    envPanel: document.getElementById('env-panel'),
    envExposure: document.getElementById('env-exposure'),
    envRotate: document.getElementById('env-rotate'),
    envBackground: document.getElementById('env-bg'),
    envReset: document.getElementById('env-reset'),
    arContainer: document.getElementById('ar-container'),
    toastRegion: document.getElementById('toast-region'),
    cameraButtons: Array.from(document.querySelectorAll('#camera-controls button'))
};

const sideConfigs = {
    front: {
        label: 'Front',
        input: document.getElementById('front-upload'),
        dropzone: document.getElementById('front-dropzone'),
        actions: document.getElementById('front-actions'),
        transforms: document.getElementById('front-transforms'),
        thumbFrame: document.getElementById('front-thumb-frame'),
        thumb: document.getElementById('front-thumb'),
        resetButton: document.getElementById('reset-front-tex'),
        clearButton: document.getElementById('clear-front'),
        scaleInput: document.getElementById('front-scale'),
        xInput: document.getElementById('front-x'),
        yInput: document.getElementById('front-y'),
        materialName: 'Flag Cloth Front',
        material: null,
        originalMap: null,
        uploadedTexture: null,
        previewUrl: null
    },
    back: {
        label: 'Back',
        input: document.getElementById('back-upload'),
        dropzone: document.getElementById('back-dropzone'),
        actions: document.getElementById('back-actions'),
        transforms: document.getElementById('back-transforms'),
        thumbFrame: document.getElementById('back-thumb-frame'),
        thumb: document.getElementById('back-thumb'),
        resetButton: document.getElementById('reset-back-tex'),
        clearButton: document.getElementById('clear-back'),
        scaleInput: document.getElementById('back-scale'),
        xInput: document.getElementById('back-x'),
        yInput: document.getElementById('back-y'),
        materialName: 'Flag Cloth Back',
        material: null,
        originalMap: null,
        uploadedTexture: null,
        previewUrl: null
    }
};

const scene = new THREE.Scene();
const defaultBackground = new THREE.Color('#e0e0e0');
scene.background = defaultBackground;

const camera = new THREE.PerspectiveCamera(45, getViewportAspect(), 0.6, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(dom.canvasContainer.clientWidth, dom.canvasContainer.clientHeight);
renderer.setPixelRatio(getClampedPixelRatio());
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.xr.enabled = true;
dom.canvasContainer.appendChild(renderer.domElement);

const sceneRoot = new THREE.Group();
scene.add(sceneRoot);

const reticle = createReticle();
scene.add(reticle);

const arController = renderer.xr.getController(0);
arController.addEventListener('select', placeModelFromReticle);
scene.add(arController);

const targetCenter = new THREE.Vector3(0, 1.8, 0);
const cameraHome = new THREE.Vector3(2, 2, 6);
const cameraDistance = 5.5;
const cameraTargets = {
    home: cameraHome.clone(),
    front: new THREE.Vector3(0, targetCenter.y, cameraDistance),
    back: new THREE.Vector3(0, targetCenter.y, -cameraDistance),
    left: new THREE.Vector3(-cameraDistance, targetCenter.y, 0),
    right: new THREE.Vector3(cameraDistance, targetCenter.y, 0)
};
const exportRenderSize = 2048;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.copy(targetCenter);
camera.position.copy(cameraHome);
controls.update();

const clock = new THREE.Clock();
const textureLoader = new THREE.TextureLoader();
const modelLoader = new GLTFLoader();
const environmentLoader = new RGBELoader();

let pocketMaterial = null;
let modelRoot = null;
let environmentTexture = null;
let mixer = null;
let action = null;
let isPlaying = true;
let exportRenderer = null;
let exportCamera = null;
let hitTestSource = null;
let hitTestSourceRequested = false;
let arStatusTag = null;
let envPanelHideTimer = null;
let envPanelShouldBeOpen = false;

const activeToasts = [];

const pocketColorState = {
    hue: 0,
    saturation: 100,
    value: 0
};

const state = {
    modelLoaded: false,
    modelFailed: false,
    environmentResolved: false,
    environmentLoaded: false,
    ready: false,
    isExporting: false,
    isInAR: false,
    arUnsupported: false
};

const pdfButtonMarkup = dom.generatePdf.innerHTML;
const pdfLibraryAvailable = typeof window.jspdf !== 'undefined' && typeof window.jspdf.jsPDF === 'function';

const arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
dom.arContainer.appendChild(arButton);
syncARButtonLabel();

const arButtonLabelObserver = new MutationObserver(syncARButtonLabel);
arButtonLabelObserver.observe(arButton, { childList: true, characterData: true, subtree: true });

bindUploadInputs();
bindTransformInputs();
bindUIEvents();
initializePocketColorPicker();
syncControlAvailability();
setLoadingState(true, 'Loading 3D assets...');
setActiveCameraView('home');

initializeARSupport();
loadEnvironment();
loadModel();
renderer.xr.addEventListener('sessionstart', onARSessionStart);
renderer.xr.addEventListener('sessionend', onARSessionEnd);
renderer.setAnimationLoop(renderFrame);

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

function showToast(title, message, tone = 'info', duration = 3200) {
    while (activeToasts.length >= 2) {
        dismissToast(activeToasts[0]);
    }

    const toast = document.createElement('div');
    toast.className = `toast is-${tone}`;

    const titleNode = document.createElement('span');
    titleNode.className = 'toast-title';
    titleNode.textContent = title;

    const messageNode = document.createElement('span');
    messageNode.className = 'toast-copy';
    messageNode.textContent = message;

    toast.append(titleNode, messageNode);
    dom.toastRegion.appendChild(toast);
    activeToasts.push(toast);

    window.requestAnimationFrame(() => {
        if (toast.dataset.dismissed !== 'true') {
            toast.classList.add('is-visible');
        }
    });

    toast.hideTimer = window.setTimeout(() => {
        dismissToast(toast);
    }, duration);
}

function dismissToast(toast) {
    if (!toast || toast.dataset.dismissed === 'true') {
        return;
    }

    toast.dataset.dismissed = 'true';
    window.clearTimeout(toast.hideTimer);

    const toastIndex = activeToasts.indexOf(toast);
    if (toastIndex !== -1) {
        activeToasts.splice(toastIndex, 1);
    }

    toast.classList.remove('is-visible');
    toast.classList.add('is-hiding');
    window.setTimeout(() => toast.remove(), 360);
}

function initializePocketColorPicker() {
    setPocketColorFromHex(dom.pocketColor.value);

    dom.pocketColorTrigger.addEventListener('click', () => {
        if (dom.pocketColorTrigger.disabled) {
            return;
        }

        if (dom.pocketColorPopover.hidden) {
            openPocketColorPicker();
            return;
        }

        closePocketColorPicker();
    });

    dom.pocketColorClose.addEventListener('click', closePocketColorPicker);
    dom.pocketColorPopover.addEventListener('click', (event) => {
        if (event.target === dom.pocketColorPopover) {
            closePocketColorPicker();
        }
    });

    dom.pocketColorHue.addEventListener('input', (event) => {
        pocketColorState.hue = Number.parseFloat(event.target.value);
        applyPocketColorState();
    });

    dom.pocketColorSurface.addEventListener('pointerdown', (event) => {
        if (dom.pocketColorTrigger.disabled) {
            return;
        }

        event.preventDefault();
        updatePocketColorFromSurface(event);
        const activePointerId = event.pointerId;

        try {
            dom.pocketColorSurface.setPointerCapture(activePointerId);
        } catch {
            // Some mobile browsers reject pointer capture during native range interactions.
        }

        const handleMove = (moveEvent) => {
            if (moveEvent.pointerId !== activePointerId) {
                return;
            }

            moveEvent.preventDefault();
            updatePocketColorFromSurface(moveEvent);
        };

        const handleEnd = (endEvent) => {
            if (endEvent.pointerId !== activePointerId) {
                return;
            }

            try {
                dom.pocketColorSurface.releasePointerCapture(activePointerId);
            } catch {
                // Capture may already be released if the pointer leaves the surface.
            }

            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleEnd);
            window.removeEventListener('pointercancel', handleEnd);
        };

        window.addEventListener('pointermove', handleMove, { passive: false });
        window.addEventListener('pointerup', handleEnd);
        window.addEventListener('pointercancel', handleEnd);
    });

    dom.pocketColorHex.addEventListener('change', () => {
        if (!setPocketColorFromHex(dom.pocketColorHex.value)) {
            dom.pocketColorHex.value = dom.pocketColor.value.toUpperCase();
        }
    });

    dom.pocketColorHex.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();

            if (!setPocketColorFromHex(dom.pocketColorHex.value)) {
                dom.pocketColorHex.value = dom.pocketColor.value.toUpperCase();
            }

            closePocketColorPicker();
        }
    });
}

function openPocketColorPicker() {
    positionPocketColorPicker();
    dom.pocketColorPopover.hidden = false;
    dom.uiPanel.classList.add('is-picker-open');
    dom.pocketColorTrigger.setAttribute('aria-expanded', 'true');
    dom.pocketColorHex.value = dom.pocketColor.value.toUpperCase();
}

function closePocketColorPicker() {
    if (dom.pocketColorPopover.hidden) {
        return;
    }

    dom.pocketColorPopover.hidden = true;
    dom.uiPanel.classList.remove('is-picker-open');
    dom.pocketColorTrigger.setAttribute('aria-expanded', 'false');
}

function positionPocketColorPicker() {
    const panelRect = dom.uiPanel.getBoundingClientRect();

    dom.pocketColorPopover.style.setProperty('--picker-panel-top', `${panelRect.top}px`);
    dom.pocketColorPopover.style.setProperty('--picker-panel-left', `${panelRect.left}px`);
    dom.pocketColorPopover.style.setProperty('--picker-panel-width', `${panelRect.width}px`);
    dom.pocketColorPopover.style.setProperty('--picker-panel-height', `${panelRect.height}px`);
}

function updatePocketColorFromSurface(event) {
    const rect = dom.pocketColorSurface.getBoundingClientRect();
    const x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height, 0, 1);

    pocketColorState.saturation = x * 100;
    pocketColorState.value = (1 - y) * 100;
    applyPocketColorState();
}

function applyPocketColorState() {
    const hex = hsvToHex(pocketColorState.hue, pocketColorState.saturation, pocketColorState.value);
    syncPocketColorUi(hex);
}

function setPocketColorFromHex(value) {
    const normalizedHex = normalizeHex(value);
    if (!normalizedHex) {
        return false;
    }

    const hsv = hexToHsv(normalizedHex);
    pocketColorState.hue = hsv.hue;
    pocketColorState.saturation = hsv.saturation;
    pocketColorState.value = hsv.value;
    syncPocketColorUi(normalizedHex);
    return true;
}

function syncPocketColorUi(hex) {
    const normalizedHex = hex.toUpperCase();

    dom.pocketColor.value = normalizedHex;
    dom.pocketColorValue.textContent = normalizedHex;
    dom.pocketColorHex.value = normalizedHex;
    dom.pocketColorSwatch.style.background = normalizedHex;
    dom.pocketColorSurface.style.setProperty('--picker-hue-color', `hsl(${pocketColorState.hue}, 100%, 50%)`);
    dom.pocketColorHue.value = String(Math.round(pocketColorState.hue));
    dom.pocketColorCursor.style.left = `${pocketColorState.saturation}%`;
    dom.pocketColorCursor.style.top = `${100 - pocketColorState.value}%`;

    if (pocketMaterial) {
        pocketMaterial.color.set(normalizedHex);
    }
}

function normalizeHex(value) {
    const trimmedValue = value.trim();
    const withHash = trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`;
    const shortMatch = /^#([\da-fA-F]{3})$/;
    const fullMatch = /^#([\da-fA-F]{6})$/;

    if (fullMatch.test(withHash)) {
        return withHash.toUpperCase();
    }

    const shortResult = withHash.match(shortMatch);
    if (!shortResult) {
        return null;
    }

    const expanded = shortResult[1]
        .split('')
        .map((character) => `${character}${character}`)
        .join('');

    return `#${expanded}`.toUpperCase();
}

function hexToHsv(hex) {
    const rgb = hexToRgb(hex);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let hue = 0;

    if (delta !== 0) {
        if (max === r) {
            hue = 60 * (((g - b) / delta) % 6);
        } else if (max === g) {
            hue = 60 * (((b - r) / delta) + 2);
        } else {
            hue = 60 * (((r - g) / delta) + 4);
        }
    }

    if (hue < 0) {
        hue += 360;
    }

    const saturation = max === 0 ? 0 : (delta / max) * 100;
    const value = max * 100;

    return { hue, saturation, value };
}

function hsvToHex(hue, saturation, value) {
    const rgb = hsvToRgb(hue, saturation, value);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function hsvToRgb(hue, saturation, value) {
    const s = saturation / 100;
    const v = value / 100;
    const chroma = v * s;
    const huePrime = hue / 60;
    const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

    let red = 0;
    let green = 0;
    let blue = 0;

    if (huePrime >= 0 && huePrime < 1) {
        red = chroma;
        green = x;
    } else if (huePrime < 2) {
        red = x;
        green = chroma;
    } else if (huePrime < 3) {
        green = chroma;
        blue = x;
    } else if (huePrime < 4) {
        green = x;
        blue = chroma;
    } else if (huePrime < 5) {
        red = x;
        blue = chroma;
    } else {
        red = chroma;
        blue = x;
    }

    const match = v - chroma;

    return {
        r: Math.round((red + match) * 255),
        g: Math.round((green + match) * 255),
        b: Math.round((blue + match) * 255)
    };
}

function hexToRgb(hex) {
    const normalizedHex = normalizeHex(hex);
    const hexValue = normalizedHex.slice(1);

    return {
        r: Number.parseInt(hexValue.slice(0, 2), 16),
        g: Number.parseInt(hexValue.slice(2, 4), 16),
        b: Number.parseInt(hexValue.slice(4, 6), 16)
    };
}

function rgbToHex(red, green, blue) {
    return `#${[red, green, blue]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`.toUpperCase();
}

function syncReadyState() {
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

    if (!pdfLibraryAvailable) {
        showToast('Preview ready', 'Artwork tools are ready, but PDF export is currently unavailable.', 'info', 4000);
        return;
    }

    showToast('Preview ready', 'You can now upload artwork, tune the preview, and export a proof.', 'success');
}

function syncControlAvailability() {
    const baseEnabled = state.ready && !state.modelFailed && !state.isExporting && !state.isInAR;

    dom.uiPanel.classList.toggle('is-disabled', !baseEnabled);
    dom.doubleSided.disabled = !baseEnabled;
    dom.pocketColor.disabled = !baseEnabled;
    dom.pocketColorTrigger.disabled = !baseEnabled;
    dom.playPause.disabled = !baseEnabled || !action;
    dom.generatePdf.disabled = !baseEnabled || !pdfLibraryAvailable;

    dom.cameraButtons.forEach((button) => {
        button.disabled = !baseEnabled;
    });

    const environmentEnabled = baseEnabled && state.environmentLoaded;
    dom.envToggle.disabled = !environmentEnabled;
    dom.envExposure.disabled = !environmentEnabled;
    dom.envRotate.disabled = !environmentEnabled;
    dom.envBackground.disabled = !environmentEnabled;
    dom.envReset.disabled = !environmentEnabled;

    if (!environmentEnabled) {
        setEnvPanelOpen(false);
    }

    if (!baseEnabled) {
        closePocketColorPicker();
    }

    if (!state.isInAR && !state.arUnsupported) {
        arButton.disabled = !state.ready || state.modelFailed || state.isExporting;
        syncARButtonLabel();
    }

    updateBackArtworkVisibility();
    syncSideUi('front');
    syncSideUi('back');
}

function updateBackArtworkVisibility() {
    dom.backArtworkGroup.hidden = !dom.doubleSided.checked;
}

function syncSideUi(side) {
    const config = sideConfigs[side];
    const isBackSideHidden = side === 'back' && !dom.doubleSided.checked;
    const canInteract = state.ready && !state.modelFailed && !state.isExporting && !state.isInAR && !isBackSideHidden;
    const hasUpload = Boolean(config.uploadedTexture);

    config.input.disabled = !canInteract;
    config.resetButton.disabled = !canInteract || !hasUpload;
    config.clearButton.disabled = !canInteract || !hasUpload;
    config.actions.hidden = !hasUpload;
    config.resetButton.hidden = !hasUpload;
    config.clearButton.hidden = !hasUpload;
    config.transforms.hidden = !hasUpload;
    config.thumbFrame.hidden = !config.previewUrl;
    config.dropzone.classList.toggle('is-disabled', !canInteract);
    config.dropzone.setAttribute('aria-disabled', String(!canInteract));
    config.dropzone.tabIndex = canInteract ? 0 : -1;
}

function syncARButtonLabel() {
    if (state.arUnsupported || !arButton.isConnected) {
        return;
    }

    if (arButton.textContent.trim() !== 'AR') {
        arButton.textContent = 'AR';
    }

    arButton.setAttribute('aria-label', 'Start AR');
    arButton.title = 'Start AR';
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
            if (envPanelShouldBeOpen) {
                dom.envPanel.classList.add('is-open');
            }
        });
        return;
    }

    dom.envPanel.classList.remove('is-open');
    envPanelHideTimer = window.setTimeout(() => {
        if (!isEnvPanelOpen()) {
            dom.envPanel.hidden = true;
        }
    }, 340);
}

function initializeARSupport() {
    if (!navigator.xr) {
        markARUnsupported();
        return;
    }

    navigator.xr.isSessionSupported('immersive-ar')
        .then((supported) => {
            if (!supported) {
                markARUnsupported();
            }
        })
        .catch(() => {
            markARUnsupported();
        });
}

function markARUnsupported() {
    if (state.arUnsupported) {
        return;
    }

    state.arUnsupported = true;
    arButton.disabled = true;
    arButtonLabelObserver.disconnect();

    if (arButton.isConnected) {
        arButton.remove();
    }

    arStatusTag = document.createElement('div');
    arStatusTag.className = 'ar-status-tag';
    arStatusTag.textContent = 'AR Not Supported';
    dom.arContainer.appendChild(arStatusTag);

    window.setTimeout(() => {
        if (!arStatusTag) {
            return;
        }

        arStatusTag.classList.add('is-fading');

        window.setTimeout(() => {
            if (arStatusTag) {
                arStatusTag.remove();
                arStatusTag = null;
            }
        }, 800);
    }, 5000);
}

function loadEnvironment() {
    environmentLoader.load(
        'studio.hdr',
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

function loadModel() {
    modelLoader.load(
        'flag.glb',
        (gltf) => {
            modelRoot = gltf.scene;
            sceneRoot.add(modelRoot);
            sceneRoot.visible = !state.isInAR;

            modelRoot.traverse((child) => {
                if (!child.isMesh) {
                    return;
                }

                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((material) => {
                    material.side = THREE.DoubleSide;

                    if (material.name === sideConfigs.front.materialName) {
                        sideConfigs.front.material = material;
                        sideConfigs.front.originalMap = material.map;
                    }

                    if (material.name === sideConfigs.back.materialName) {
                        sideConfigs.back.material = material;
                        sideConfigs.back.originalMap = material.map;
                    }

                    if (material.name === 'Cloth.001') {
                        pocketMaterial = material;
                    }
                });
            });

            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(modelRoot);
                action = mixer.clipAction(gltf.animations[0]);
                action.play();
            }

            syncPocketColorUi(dom.pocketColor.value);
            applyBackMaterialState();
            state.modelLoaded = true;
            syncReadyState();
        },
        undefined,
        () => {
            state.modelFailed = true;
            setLoadingState(true, 'The 3D model could not be loaded. Refresh the page and try again.');
            syncControlAvailability();
            showToast('Model load failed', 'The preview model is unavailable, so the configurator cannot continue.', 'error', 5000);
        }
    );
}

function bindUploadInputs() {
    Object.entries(sideConfigs).forEach(([side, config]) => {
        config.input.addEventListener('change', (event) => {
            const [file] = event.target.files;
            if (file) {
                handleArtworkFile(side, file);
            }
        });

        config.dropzone.addEventListener('keydown', (event) => {
            if (config.input.disabled) {
                return;
            }

            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                config.input.click();
            }
        });

        ['dragenter', 'dragover'].forEach((eventName) => {
            config.dropzone.addEventListener(eventName, (event) => {
                event.preventDefault();
                if (config.input.disabled) {
                    return;
                }
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

            if (config.input.disabled) {
                return;
            }

            const [file] = event.dataTransfer.files;
            if (file) {
                handleArtworkFile(side, file);
            }
        });

        config.resetButton.addEventListener('click', () => {
            resetTransforms(side);
        });

        config.clearButton.addEventListener('click', () => {
            clearArtwork(side, true);
        });
    });
}

function bindTransformInputs() {
    Object.entries(sideConfigs).forEach(([side, config]) => {
        [config.scaleInput, config.xInput, config.yInput].forEach((input) => {
            input.addEventListener('input', () => {
                updateTextureTransforms(side);
            });
        });
    });
}

function bindUIEvents() {
    dom.doubleSided.addEventListener('change', () => {
        applyBackMaterialState();
        syncControlAvailability();
        showToast(
            'Print mode updated',
            dom.doubleSided.checked ? 'Back artwork is enabled for double-sided proofs.' : 'Back artwork is hidden for single-sided proofs.',
            'info'
        );
    });

    dom.playPause.addEventListener('click', toggleAnimation);
    dom.generatePdf.addEventListener('click', generatePdfProof);

    window.addEventListener('keydown', (event) => {
        const activeTag = document.activeElement?.tagName;
        const isInteractiveFocus = activeTag === 'INPUT' || activeTag === 'BUTTON' || document.activeElement?.classList.contains('upload-card');

        if (event.key === 'Escape' && !dom.pocketColorPopover.hidden) {
            closePocketColorPicker();
        }

        if (event.code === 'Space' && !isInteractiveFocus) {
            event.preventDefault();
            toggleAnimation();
        }
    });

    dom.envToggle.addEventListener('click', () => {
        if (dom.envToggle.disabled) {
            return;
        }
        setEnvPanelOpen(!isEnvPanelOpen());
    });

    document.addEventListener('click', (event) => {
        if (!dom.cameraWrapper.contains(event.target) && isEnvPanelOpen()) {
            setEnvPanelOpen(false);
        }

        if (
            !dom.pocketColorPopover.hidden &&
            !dom.pocketColorPopover.contains(event.target) &&
            !dom.pocketColorTrigger.contains(event.target)
        ) {
            closePocketColorPicker();
        }
    });

    dom.envExposure.addEventListener('input', (event) => {
        renderer.toneMappingExposure = Number.parseFloat(event.target.value);
    });

    dom.envRotate.addEventListener('input', (event) => {
        if (!environmentTexture) {
            return;
        }

        const radians = Number.parseFloat(event.target.value);
        scene.environmentRotation.y = radians;
        scene.backgroundRotation.y = radians;
    });

    dom.envBackground.addEventListener('change', () => {
        syncEnvironmentBackground();
    });

    dom.envReset.addEventListener('click', () => {
        dom.envExposure.value = '1';
        dom.envRotate.value = '0';
        dom.envBackground.checked = false;
        renderer.toneMappingExposure = 1;
        scene.environmentRotation.y = 0;
        scene.backgroundRotation.y = 0;
        syncEnvironmentBackground();
    });

    dom.cameraButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const view = button.dataset.view;
            focusCameraView(view);
        });
    });

    window.addEventListener('resize', handleResize);
}

function handleArtworkFile(side, file) {
    const config = sideConfigs[side];

    if (!state.ready || !config.material) {
        showToast('Preview still loading', 'Please wait for the 3D preview to finish loading before uploading artwork.', 'info', 3600);
        return;
    }

    if (!/^image\/(png|jpeg)$/.test(file.type)) {
        showToast('Unsupported file', 'Please upload a PNG or JPG image.', 'error', 3800);
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

            if (previousPreviewUrl) {
                URL.revokeObjectURL(previousPreviewUrl);
            }

            if (previousTexture) {
                previousTexture.dispose();
            }

            resetTransformInputs(side);
            updateTextureTransforms(side);
            applySideMaterialMap(side);
            syncSideUi(side);
            config.input.value = '';

            if (side === 'back' && dom.doubleSided.checked && !state.isInAR) {
                focusCameraView('back');
            }

            showToast('Artwork applied', `${config.label} artwork has been updated successfully.`, 'success');
        },
        undefined,
        () => {
            URL.revokeObjectURL(textureUrl);
            config.input.value = '';
            showToast('Upload failed', `The ${config.label.toLowerCase()} artwork could not be processed.`, 'error', 4200);
        }
    );
}

function applySideMaterialMap(side) {
    const config = sideConfigs[side];
    if (!config.material) {
        return;
    }

    if (side === 'back') {
        applyBackMaterialState();
        return;
    }

    config.material.map = config.uploadedTexture || config.originalMap;
    config.material.color.setHex(0xffffff);
    config.material.needsUpdate = true;
}

function applyBackMaterialState() {
    const config = sideConfigs.back;
    if (!config.material) {
        return;
    }

    config.material.map = dom.doubleSided.checked ? (config.uploadedTexture || config.originalMap) : null;
    config.material.color.setHex(0xffffff);
    config.material.needsUpdate = true;
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
    if (!config.uploadedTexture) {
        return;
    }

    const scale = Number.parseFloat(config.scaleInput.value);
    const panX = Number.parseFloat(config.xInput.value);
    const panY = Number.parseFloat(config.yInput.value);

    config.uploadedTexture.repeat.set(1 / scale, 1 / scale);
    config.uploadedTexture.offset.set(-panX, panY);
    config.uploadedTexture.needsUpdate = true;
}

function toggleAnimation() {
    if (!action || dom.playPause.disabled) {
        return;
    }

    isPlaying = !isPlaying;
    action.paused = !isPlaying;
    dom.playPause.textContent = isPlaying ? 'Pause Animation' : 'Play Animation';
}

async function generatePdfProof() {
    if (!state.ready || state.isExporting) {
        return;
    }

    if (!pdfLibraryAvailable) {
        showToast('PDF unavailable', 'The PDF export library is not loaded right now.', 'error', 4200);
        return;
    }

    state.isExporting = true;
    syncControlAvailability();
    dom.generatePdf.textContent = 'Generating...';
    showToast('Generating proof', 'Capturing clean front and back views for the PDF.', 'info', 2000);

    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        const frontImage = captureProofView(new THREE.Vector3(0, targetCenter.y, cameraDistance));
        const backImage = captureProofView(new THREE.Vector3(0, targetCenter.y, -cameraDistance));

        doc.setFontSize(22);
        doc.setTextColor(50, 50, 50);
        doc.text('Probo Configurator - Client Proof', 20, 20);
        doc.setFontSize(12);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 28);

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
            preserveDrawingBuffer: true
        });
        exportRenderer.setSize(exportRenderSize, exportRenderSize, false);
        exportRenderer.setPixelRatio(1);
        exportRenderer.outputColorSpace = THREE.SRGBColorSpace;
        exportRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        exportCamera = new THREE.PerspectiveCamera(45, 1, 0.6, 1000);
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

function syncEnvironmentBackground() {
    if (dom.envBackground.checked && environmentTexture) {
        scene.background = environmentTexture;
        scene.backgroundBlurriness = 0.2;
        scene.backgroundRotation.y = scene.environmentRotation.y;
        return;
    }

    scene.background = defaultBackground;
    scene.backgroundBlurriness = 0;
}

function transitionCamera(targetPosition) {
    if (state.isInAR) {
        return;
    }

    TWEEN.removeAll();

    const endPosition = targetPosition.clone();
    const startTarget = controls.target.clone();
    const endTarget = targetCenter.clone();
    const startSpherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(startTarget));
    const endSpherical = new THREE.Spherical().setFromVector3(endPosition.clone().sub(endTarget));

    while (endSpherical.theta - startSpherical.theta > Math.PI) {
        endSpherical.theta -= Math.PI * 2;
    }

    while (endSpherical.theta - startSpherical.theta < -Math.PI) {
        endSpherical.theta += Math.PI * 2;
    }

    new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, 800)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);

            const radius = THREE.MathUtils.lerp(startSpherical.radius, endSpherical.radius, progress);
            const phi = THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, progress);
            const theta = THREE.MathUtils.lerp(startSpherical.theta, endSpherical.theta, progress);

            camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(controls.target);
            controls.update();
        })
        .start();
}

function focusCameraView(view) {
    const targetPosition = cameraTargets[view];
    if (!targetPosition) {
        return;
    }

    transitionCamera(targetPosition);
    setActiveCameraView(view);
}

function setActiveCameraView(view) {
    dom.cameraButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.view === view);
    });
}

function onARSessionStart() {
    state.isInAR = true;
    controls.enabled = false;
    reticle.visible = false;

    if (modelRoot) {
        sceneRoot.visible = false;
    }

    syncControlAvailability();
    showToast('AR mode active', 'Move your device to find a surface, then tap to place the flag.', 'info', 4200);
}

function onARSessionEnd() {
    state.isInAR = false;
    controls.enabled = true;
    reticle.visible = false;
    resetHitTestState();

    sceneRoot.visible = true;
    sceneRoot.position.set(0, 0, 0);
    sceneRoot.rotation.set(0, 0, 0);
    focusCameraView('home');
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

    if (!session || !frame) {
        return;
    }

    if (!hitTestSourceRequested) {
        session.requestReferenceSpace('viewer')
            .then((referenceSpace) => session.requestHitTestSource({ space: referenceSpace }))
            .then((source) => {
                hitTestSource = source;
            })
            .catch(() => {
                showToast('AR placement unavailable', 'Hit testing could not be started for this session.', 'error', 4200);
            });

        session.addEventListener('end', resetHitTestState, { once: true });
        hitTestSourceRequested = true;
    }

    if (!hitTestSource) {
        return;
    }

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

function placeModelFromReticle() {
    if (!state.isInAR || !reticle.visible || !modelRoot) {
        return;
    }

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

function handleResize() {
    const width = dom.canvasContainer.clientWidth;
    const height = dom.canvasContainer.clientHeight;

    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(getClampedPixelRatio());
    renderer.setSize(width, height);

    if (!dom.pocketColorPopover.hidden) {
        positionPocketColorPicker();
    }
}

function renderFrame(_, frame) {
    TWEEN.update();

    if (state.isInAR) {
        updateARHitTesting(frame);
    }

    const delta = clock.getDelta();
    if (mixer) {
        mixer.update(delta);
    }

    controls.update();
    renderer.render(scene, camera);
}
