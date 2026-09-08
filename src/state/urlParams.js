import * as THREE from 'three';
import { configState, state, getCurrentConfigKey } from './configState.js';
import { dom } from '../ui/domElements.js';
import { sideConfigs, uploadedGraphicsCache } from '../graphics/graphicConfig.js';
import { textureLoader } from '../models/loaders.js';
import { renderer } from '../core/scene.js';
import { applyConfigurationToScene } from '../models/flagModel.js';

export let loadedSharedDesign = false;
export let sharedDesignPromise = null;

/**
 * Parses and restores configurator state from the URL hash (#share=...) if present.
 * Allows instant sharing of flag configurations, custom artwork, and finishes.
 * 
 * @returns {Promise<void>}
 */
export async function checkAndLoadSharedDesign() {
    const hash = window.location.hash;
    if (!hash.startsWith('#share=')) return;

    try {
        const base64Data = hash.substring(7);
        const sharedConfig = JSON.parse(decodeURIComponent(escape(atob(base64Data))));

        if (sharedConfig && typeof sharedConfig === 'object') {
            // Apply configState properties
            if (sharedConfig.size) {
                const sizeCode = sharedConfig.size.split(' ').pop();
                const validSizes = {
                    'XS': 'Feather Flag Convex XS',
                    'S': 'Feather Flag Convex S',
                    'M': 'Feather Flag Convex M',
                    'Wide': 'Feather Flag Convex M-Extra Wide',
                    'L': 'Feather Flag Convex L'
                };
                configState.size = validSizes[sizeCode] || sharedConfig.size;
            }
            if (sharedConfig.printing) configState.printing = sharedConfig.printing;
            if (sharedConfig.direction) configState.direction = sharedConfig.direction;
            if (sharedConfig.poleCoverColor) configState.poleCoverColor = sharedConfig.poleCoverColor;
            if (sharedConfig.pole) configState.pole = sharedConfig.pole;
            if (sharedConfig.base) configState.base = sharedConfig.base;

            // Update pocket color input value if the element exists
            if (dom.pocketColor) {
                dom.pocketColor.value = configState.poleCoverColor;
            }

            // Load custom graphic if present
            if (sharedConfig.graphic && (sharedConfig.graphic.imageUrl || sharedConfig.graphic.imgData)) {
                sharedDesignPromise = (async () => {
                    try {
                        const targetUrl = sharedConfig.graphic.imageUrl || sharedConfig.graphic.imgData;
                        const res = await fetch(targetUrl);
                        const blob = await res.blob();
                        const previewUrl = URL.createObjectURL(blob);

                        return new Promise((resolve) => {
                            textureLoader.load(previewUrl, (texture) => {
                                texture.flipY = false;
                                texture.colorSpace = THREE.SRGBColorSpace;
                                texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                                texture.minFilter = THREE.LinearMipmapLinearFilter;
                                texture.generateMipmaps = true;
                                texture.wrapS = THREE.RepeatWrapping;
                                texture.wrapT = THREE.RepeatWrapping;
                                texture.center.set(0.5, 0.5);

                                const key = getCurrentConfigKey();

                                uploadedGraphicsCache[key] = {
                                    uploadedTexture: texture,
                                    uploadedFrontTex: texture.clone(),
                                    uploadedBackTex: texture.clone(),
                                    previewUrl: previewUrl,
                                    fileName: sharedConfig.graphic.fileName,
                                    scale: sharedConfig.graphic.scale !== undefined ? Number(sharedConfig.graphic.scale) : 1.0,
                                    panX: sharedConfig.graphic.panX !== undefined ? Number(sharedConfig.graphic.panX) : 0.0,
                                    panY: sharedConfig.graphic.panY !== undefined ? Number(sharedConfig.graphic.panY) : 0.0,
                                    rotation: sharedConfig.graphic.rotation !== undefined ? Number(sharedConfig.graphic.rotation) : 0.0
                                };

                                if (state.ready) {
                                    applyConfigurationToScene(false);
                                }
                                resolve(true);
                            }, undefined, (err) => {
                                console.error('Three.js TextureLoader failed to load shared design graphic:', err);
                                resolve(false);
                            });
                        });
                    } catch (err) {
                        console.error('Failed to load shared design graphic:', err);
                        return false;
                    }
                })();
            } else {
                sharedDesignPromise = Promise.resolve(true);
            }

            loadedSharedDesign = true;

            // Clean the URL hash using history.replaceState to keep URL clean and uncluttered
            try {
                history.replaceState('', document.title, window.location.pathname + window.location.search);
            } catch (err) {
                console.warn('Could not clean URL hash:', err);
            }
        }
    } catch (e) {
        console.error('Failed to parse shared design configuration from URL hash:', e);
    }
}
