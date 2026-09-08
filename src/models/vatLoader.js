import * as THREE from 'three';
import { exrLoader } from './loaders.js';

export const vatMaterials = [];
export const vatCache = {};
export const vatLoadPromises = {};

let currentVatTexture = null;
let currentNormTexture = null;

export function setVatTextures(posTex, normTex) {
    currentVatTexture = posTex;
    currentNormTexture = normTex;
}

export function getVatTextures() {
    return {
        positions: currentVatTexture,
        normals: currentNormTexture
    };
}

/**
 * Loads and caches Vertex Animation Texture (VAT) position, normal EXRs, and metadata.
 * 
 * @param {string} sizeCode - Size identifier (e.g. 'xs', 's', 'm', 'l').
 * @returns {Promise<{positions: THREE.Texture, normals: THREE.Texture, info: Object}|null>}
 */
export async function loadVATData(sizeCode) {
    const code = sizeCode.toLowerCase();
    if (vatCache[code]) return vatCache[code];
    if (vatLoadPromises[code]) return vatLoadPromises[code];

    vatLoadPromises[code] = (async () => {
        try {
            const [pTex, nTex, infoRes] = await Promise.all([
                new Promise((resolve, reject) => exrLoader.load(`3d/vat/${code}/positions.exr`, resolve, undefined, reject)),
                new Promise((resolve, reject) => exrLoader.load(`3d/vat/${code}/normals.exr`, resolve, undefined, reject)),
                fetch(`3d/vat/${code}/info.json`)
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

            vatCache[code] = { positions: pTex, normals: nTex, info };
            return vatCache[code];
        } catch (e) {
            console.error(`Failed to load VAT data for ${sizeCode}`, e);
            return null;
        }
    })();

    return vatLoadPromises[code];
}

/**
 * Updates dynamic VAT uniforms across standard and precompiled shaders.
 * 
 * @param {THREE.Material} mat - Target material.
 * @param {THREE.Texture} posTex - Position EXR texture.
 * @param {THREE.Texture} normTex - Normal EXR texture.
 * @param {number} frameCount - Total frames in the VAT animation sequence.
 */
export function updateVatUniforms(mat, posTex, normTex, frameCount) {
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
