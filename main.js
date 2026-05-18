/* ---------------------------------
   Imports & Dependencies
--------------------------------- */
import * as THREE from 'three';
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
        materialName: 'Graphic Shader',
        material: null,
        originalMap: null,
        uploadedTexture: null,
        previewUrl: null,
        fileName: null
    }
};

/* ---------------------------------
   Three.js Core Setup
--------------------------------- */
const scene = new THREE.Scene();
const defaultBackground = new THREE.Color('#e0e0e0');
scene.background = defaultBackground;

const camera = new THREE.PerspectiveCamera(45, getViewportAspect(), 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
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
overheadLight.position.set(10, 10, 2); 
overheadLight.castShadow = true;
overheadLight.shadow.mapSize.width = 2048;
overheadLight.shadow.mapSize.height = 2048;

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

const shadowGeometry = new THREE.PlaneGeometry(100, 100);
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
const targetCenter = new THREE.Vector3(0, 1.8, 0);
const cameraHome = new THREE.Vector3(2, 2, 6);
const cameraDistance = 5.5;
const turntableSpeed = THREE.MathUtils.degToRad(26);
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
controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN
};
controls.target.copy(targetCenter);
camera.position.copy(cameraHome);
controls.update();
controls.saveState();

function bindOrbitPresetClearOnUserAdjust() {
    const canvas = renderer.domElement;
    const onUserAdjust = () => {
        if (state.isInAR || !state.ready || state.isExporting) return;
        setActiveCameraView(null);
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

    TWEEN.removeAll();
    new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, 600)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);
            camera.position.lerpVectors(startCameraPosition, endCameraPosition, progress);
            controls.update();
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
    
    const endTarget = preZoomState.controlsTarget;
    const endCameraPosition = preZoomState.cameraPosition;
    const startTarget = controls.target.clone();
    const startCameraPosition = camera.position.clone();

    const startSpherical = new THREE.Spherical().setFromVector3(startCameraPosition.clone().sub(startTarget));
    const endSpherical = new THREE.Spherical().setFromVector3(endCameraPosition.clone().sub(endTarget));
    
    while (endSpherical.theta - startSpherical.theta > Math.PI) endSpherical.theta -= Math.PI * 2;
    while (endSpherical.theta - startSpherical.theta < -Math.PI) endSpherical.theta += Math.PI * 2;

    TWEEN.removeAll();
    new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, 600)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);
            
            const radius = THREE.MathUtils.lerp(startSpherical.radius, endSpherical.radius, progress);
            const phi = THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, progress);
            const theta = THREE.MathUtils.lerp(startSpherical.theta, endSpherical.theta, progress);
            
            camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(controls.target);
            controls.update();
        })
        .onComplete(() => {
             setActiveCameraView(preZoomState.activeView);
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

let pocketMaterial = null;
let modelRoot = null;
let environmentTexture = null;
let mixer = null;
let action = null;
let isPlaying = true;
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
    <img src="Icons/ar.svg" alt="" aria-hidden="true" data-ar-icon="true" class="control-icon">
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
    dom.pocketColorValue.textContent = normalizedHex;
    dom.pocketColorSwatch.style.background = normalizedHex;

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
    dom.playPause.disabled = !baseEnabled || !action;
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
                if (!child.isMesh) return;
                child.castShadow = true;
                child.receiveShadow = true;

                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((material) => {
                    material.side = THREE.DoubleSide;

                    if (material.name === sideConfigs.artwork.materialName) {
                        sideConfigs.artwork.material = material;
                        sideConfigs.artwork.originalMap = material.map;
                    }

                    if (material.name === 'Cloth.001') {
                        pocketMaterial = material;
                    }
                });
            });

            renderer.shadowMap.needsUpdate = true;
            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(modelRoot);
                action = mixer.clipAction(gltf.animations[0]);
                action.play();
            }

            syncPocketColorUi(dom.pocketColor.value);
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
    if (!config.material) return;
    config.material.map = config.uploadedTexture || config.originalMap;
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
    if (!action || dom.playPause.disabled) return;

    isPlaying = !isPlaying;
    action.paused = !isPlaying;

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

        let savedMixerTime = 0;
        if (mixer) {
            savedMixerTime = mixer.time;
            mixer.setTime(0);
        }

        scene.updateMatrixWorld(true);

        const frontImage = captureProofView(new THREE.Vector3(0, targetCenter.y, cameraDistance));
        const backImage = captureProofView(new THREE.Vector3(0, targetCenter.y, -cameraDistance));

        sceneRoot.rotation.copy(savedRotation);
        if (mixer) mixer.setTime(savedMixerTime);

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
            logarithmicDepthBuffer: true
        });
        exportRenderer.setSize(exportRenderSize, exportRenderSize, false);
        exportRenderer.setPixelRatio(1);
        exportRenderer.outputColorSpace = THREE.SRGBColorSpace;
        exportRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        exportRenderer.shadowMap.enabled = true;
        exportRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        exportCamera = new THREE.PerspectiveCamera(45, 1, 0.05, 1000);
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
function transitionCamera(targetPosition) {
    if (state.isInAR) return;
    TWEEN.removeAll();

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

    new TWEEN.Tween({ progress: 0 })
        .to({ progress: 1 }, 800)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(({ progress }) => {
            controls.target.lerpVectors(startTarget, endTarget, progress);
            const radius = THREE.MathUtils.lerp(startSpherical.radius, endSpherical.radius, progress);
            const phi = THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, progress);
            const theta = THREE.MathUtils.lerp(startSpherical.theta, endSpherical.theta, progress);

            sceneRoot.rotation.y = THREE.MathUtils.lerp(startRotationY, endRotationY, progress);
            camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(controls.target);
            controls.update();
        })
        .start();
}
    
function focusCameraView(view) {
    const targetPosition = cameraTargets[view];
    if (!targetPosition) return;
    if (typeof isZoomedIn !== 'undefined') isZoomedIn = false;
    
    transitionCamera(targetPosition);
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

function renderFrame(_, frame) {
    TWEEN.update();

    if (state.isInAR) updateARHitTesting(frame);

    timer.update();
    const delta = timer.getDelta();
    if (state.turntableEnabled && !state.isInAR) {
        sceneRoot.rotation.y += turntableSpeed * delta;
    }

    if (mixer) mixer.update(delta);

    controls.update();
    renderer.render(scene, camera);
}