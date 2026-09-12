import * as THREE from 'three';
import { dom, mobileViewportMediaQuery } from '../ui/domElements.js';
import { getViewportAspect, getClampedPixelRatio } from '../utils/mathUtils.js';

export const scene = new THREE.Scene();
export const defaultBackground = new THREE.Color('#f5f5f5');
scene.background = defaultBackground;

export const sceneRoot = new THREE.Group();
scene.add(sceneRoot);

export const lightingGroup = new THREE.Group();
scene.add(lightingGroup);

export const overheadLight = new THREE.DirectionalLight(0xffffff, 0.6);
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
export const shadowCatcher = new THREE.Mesh(shadowGeometry, shadowMaterial);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = 0;
shadowCatcher.receiveShadow = true;
sceneRoot.add(shadowCatcher);

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: false });
renderer.setSize(dom.canvasContainer.clientWidth, dom.canvasContainer.clientHeight);
renderer.setPixelRatio(getClampedPixelRatio(mobileViewportMediaQuery.matches));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
dom.canvasContainer.appendChild(renderer.domElement);

let _sceneDirty = true;

/**
 * Marks the 3D scene as dirty, requesting a re-render on the next animation frame.
 */
export function markSceneDirty() {
    _sceneDirty = true;
}

/**
 * Checks if the scene requires re-rendering.
 * @returns {boolean}
 */
export function isSceneDirty() {
    return _sceneDirty;
}

/**
 * Clears the dirty rendering flag.
 */
export function clearSceneDirty() {
    _sceneDirty = false;
}

/**
 * Creates the circular reticle used for surface hit-testing in WebXR AR mode.
 * @returns {THREE.Mesh}
 */
export function createReticle() {
    const geometry = new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00633b,
        transparent: true,
        opacity: 0.92
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    return mesh;
}

export const reticle = createReticle();
scene.add(reticle);
