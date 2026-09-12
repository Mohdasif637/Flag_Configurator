import * as THREE from 'three';
import { renderer } from '../core/scene.js';
import { dom } from '../ui/domElements.js';
import { configState, state } from '../state/configState.js';
import { sideConfigs, saveCurrentGraphicToCache, syncSideUi } from './graphicConfig.js';
import { textureLoader } from '../models/loaders.js';
import { resetTransformInputs, updateTextureTransforms, resetTransforms } from './textureCompositor.js';
import { setGizmoActive, discardGizmoChanges, initMoveable } from './gizmo.js';
import { showToast } from '../ui/toast.js';
import { truncateFileName } from '../utils/helpers.js';
import { loadPdfLibraries } from '../features/pdfExport.js';
import { eventBus } from '../state/eventBus.js';
import { modelRoot, applyConfigurationToScene } from '../models/flagModel.js';
import { focusCameraView } from '../core/cameraTransitions.js';

let uploadProgressCrawlerId = null;
let currentUploadProgressRatio = 0;
let arSuggestionShown = false;

function getTargetTextureSize() {
    const sizeMapping = {
        'Feather Flag Convex XS': 2048,
        'Feather Flag Convex S': 2560,
        'Feather Flag Convex M': 2048,
        'Feather Flag Convex M-Extra Wide': 2048,
        'Feather Flag Convex L': 2048
    };
    return sizeMapping[configState.size] || 2048;
}

export function setUploadProgress(side, ratio) {
    const config = sideConfigs[side];
    if (!config || !config.dropzone) return;
    const bar = config.dropzone.querySelector('.upload-progress');
    if (bar) {
        currentUploadProgressRatio = Math.min(Math.max(ratio, 0), 1);
        bar.style.transform = `scaleX(${currentUploadProgressRatio})`;
    }
}

function startUploadProgressCrawler(side, startProgress, targetMaxProgress = 0.88, creepRate = 0.08) {
    stopUploadProgressCrawler();
    setUploadProgress(side, startProgress);

    let lastTime = performance.now();
    const tick = (now) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        if (currentUploadProgressRatio < targetMaxProgress) {
            const nextVal = currentUploadProgressRatio + (targetMaxProgress - currentUploadProgressRatio) * (creepRate * dt);
            setUploadProgress(side, nextVal);
            uploadProgressCrawlerId = window.requestAnimationFrame(tick);
        }
    };
    uploadProgressCrawlerId = window.requestAnimationFrame(tick);
}

function stopUploadProgressCrawler() {
    if (uploadProgressCrawlerId) {
        window.cancelAnimationFrame(uploadProgressCrawlerId);
        uploadProgressCrawlerId = null;
    }
}

/**
 * Handles incoming graphic file upload (PDF or image), converts it to an optimized
 * WebP texture canvas, and applies it to the 3D flag materials.
 * 
 * @param {string} side - Side configuration identifier ('graphic').
 * @param {File} file - Uploaded File instance.
 */
export async function handleGraphicFile(side, file) {
    const config = sideConfigs[side];

    if (sideConfigs.graphic.gizmoActive) {
        discardGizmoChanges(true);
    }

    if (!state.ready) {
        return;
    }

    if (config.dropzone) config.dropzone.classList.add('is-loading');
    config.fileName = file.name;
    setUploadProgress(side, 0.06);

    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    const targetSize = getTargetTextureSize();
    const destCanvas = document.createElement('canvas');
    destCanvas.width = targetSize;
    destCanvas.height = targetSize;
    const destContext = destCanvas.getContext('2d', { alpha: false });
    destContext.imageSmoothingEnabled = true;
    destContext.imageSmoothingQuality = 'high';

    destContext.fillStyle = '#ffffff';
    destContext.fillRect(0, 0, targetSize, targetSize);

    const fileType = file.type;
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const isPdf = fileType === 'application/pdf' || fileExtension === 'pdf';
    const isImage = /^image\/(png|jpeg|webp)$/.test(fileType) || ['png', 'jpg', 'jpeg', 'webp'].includes(fileExtension);

    if (isPdf) {
        setUploadProgress(side, 0.16);
        if (typeof window.pdfjsLib === 'undefined') {
            const success = await loadPdfLibraries();
            if (!success) {
                stopUploadProgressCrawler();
                destCanvas.width = 0;
                destCanvas.height = 0;
                if (config.dropzone) config.dropzone.classList.remove('is-loading');
                setUploadProgress(side, 0);
                return;
            }
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1 });

            setUploadProgress(side, 0.28);

            const aspect = viewport.width / (viewport.height || 1);
            const isNearSquare = aspect >= 0.70 && aspect <= 1.42;

            let pdfScale = isNearSquare
                ? (targetSize / Math.min(viewport.width, viewport.height))
                : (targetSize / Math.max(viewport.width, viewport.height));

            const scaledViewport = page.getViewport({ scale: pdfScale });
            const scaledWidth = Math.round(scaledViewport.width);
            const scaledHeight = Math.round(scaledViewport.height);

            startUploadProgressCrawler(side, 0.28, 0.88, 0.07);

            if (scaledWidth === targetSize && scaledHeight === targetSize) {
                await page.render({ canvasContext: destContext, viewport: scaledViewport }).promise;
            } else {
                const intermediateCanvas = document.createElement('canvas');
                intermediateCanvas.width = scaledWidth;
                intermediateCanvas.height = scaledHeight;
                const intermediateContext = intermediateCanvas.getContext('2d', { alpha: false });
                intermediateContext.imageSmoothingEnabled = true;
                intermediateContext.imageSmoothingQuality = 'high';
                intermediateContext.fillStyle = '#ffffff';
                intermediateContext.fillRect(0, 0, scaledWidth, scaledHeight);

                await page.render({ canvasContext: intermediateContext, viewport: scaledViewport }).promise;

                if (isNearSquare) {
                    const cropX = Math.round((scaledWidth - targetSize) / 2);
                    const cropY = Math.round((scaledHeight - targetSize) / 2);
                    destContext.drawImage(intermediateCanvas, cropX, cropY, targetSize, targetSize, 0, 0, targetSize, targetSize);
                } else {
                    const destX = Math.round((targetSize - scaledWidth) / 2);
                    const destY = Math.round((targetSize - scaledHeight) / 2);
                    destContext.drawImage(intermediateCanvas, 0, 0, scaledWidth, scaledHeight, destX, destY, scaledWidth, scaledHeight);
                }

                intermediateCanvas.width = 0;
                intermediateCanvas.height = 0;
            }

            stopUploadProgressCrawler();
            setUploadProgress(side, 0.90);

            const blob = await new Promise((resolve) => destCanvas.toBlob(resolve, 'image/webp', 0.95));
            destCanvas.width = 0;
            destCanvas.height = 0;
            setUploadProgress(side, 0.96);

            file = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.webp', { type: 'image/webp' });
        } catch (error) {
            console.error('PDF conversion failed:', error);
            stopUploadProgressCrawler();
            destCanvas.width = 0;
            destCanvas.height = 0;
            if (config.dropzone) config.dropzone.classList.remove('is-loading');
            setUploadProgress(side, 0);
            showToast('PDF error', 'Failed to read or convert the PDF file.', 'error', 4200);
            return;
        }
    } else if (isImage) {
        setUploadProgress(side, 0.20);
        try {
            const loadImageElement = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = (err) => reject(err);
                img.src = src;
            });

            const imgUrl = URL.createObjectURL(file);
            const img = await loadImageElement(imgUrl);
            URL.revokeObjectURL(imgUrl);
            setUploadProgress(side, 0.50);

            const aspect = img.naturalWidth / (img.naturalHeight || 1);
            const isNearSquare = aspect >= 0.70 && aspect <= 1.42;

            if (isNearSquare) {
                let imgScale = targetSize / Math.min(img.naturalWidth, img.naturalHeight);
                if (imgScale > 1.0) imgScale = 1.0;

                const scaledWidth = Math.round(img.naturalWidth * imgScale);
                const scaledHeight = Math.round(img.naturalHeight * imgScale);
                const sourceW = Math.min(scaledWidth, targetSize);
                const sourceH = Math.min(scaledHeight, targetSize);
                const sourceX = Math.round((img.naturalWidth - sourceW / imgScale) / 2);
                const sourceY = Math.round((img.naturalHeight - sourceH / imgScale) / 2);
                const destX = Math.round((targetSize - sourceW) / 2);
                const destY = Math.round((targetSize - sourceH) / 2);

                destContext.drawImage(img, sourceX, sourceY, sourceW / imgScale, sourceH / imgScale, destX, destY, sourceW, sourceH);
            } else {
                let imgScale = targetSize / Math.max(img.naturalWidth, img.naturalHeight);
                if (imgScale > 1.0) imgScale = 1.0;

                const destWidth = Math.round(img.naturalWidth * imgScale);
                const destHeight = Math.round(img.naturalHeight * imgScale);
                const destX = Math.round((targetSize - destWidth) / 2);
                const destY = Math.round((targetSize - destHeight) / 2);

                destContext.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, destX, destY, destWidth, destHeight);
            }

            setUploadProgress(side, 0.88);
            const blob = await new Promise((resolve) => destCanvas.toBlob(resolve, 'image/webp', 0.95));
            destCanvas.width = 0;
            destCanvas.height = 0;
            setUploadProgress(side, 0.96);

            file = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.webp', { type: 'image/webp' });
        } catch (error) {
            console.error('Image processing failed:', error);
            stopUploadProgressCrawler();
            destCanvas.width = 0;
            destCanvas.height = 0;
            if (config.dropzone) config.dropzone.classList.remove('is-loading');
            setUploadProgress(side, 0);
            showToast('Image error', 'Failed to process the uploaded image.', 'error', 4200);
            return;
        }
    } else {
        destCanvas.width = 0;
        destCanvas.height = 0;
        if (config.dropzone) config.dropzone.classList.remove('is-loading');
        setUploadProgress(side, 0);
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
            if (config.thumb) config.thumb.src = config.previewUrl;

            if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl);
            if (previousTexture) previousTexture.dispose();
            if (previousFrontTex) previousFrontTex.dispose();
            if (previousBackTex) previousBackTex.dispose();

            resetTransformInputs(side);
            updateTextureTransforms(side);
            saveCurrentGraphicToCache();
            if (modelRoot) modelRoot.userData.lastConfigStr = null;
            applyConfigurationToScene(false);

            setUploadProgress(side, 1.0);
            window.setTimeout(() => {
                if (config.dropzone) config.dropzone.classList.remove('is-loading');
                setUploadProgress(side, 0);
            }, 350);

            syncSideUi(side);
            if (config.titleElement) {
                config.titleElement.textContent = config.fileName;
                config.titleElement.title = config.fileName;
            }
            if (config.input) config.input.value = '';

            const targetView = (configState.direction === 'Left') ? 'back' : 'front';
            focusCameraView(targetView, 800, false);

            eventBus.emit('graphic:applied', side);
            setGizmoActive(true);
        },
        undefined,
        () => {
            URL.revokeObjectURL(textureUrl);
            if (config.input) config.input.value = '';
            stopUploadProgressCrawler();
            if (config.dropzone) config.dropzone.classList.remove('is-loading');
            setUploadProgress(side, 0);
            showToast('Upload failed', `The ${config.label.toLowerCase()} graphic could not be processed.`, 'error', 4200);
        }
    );
}

/**
 * Clears active graphic and restores default flag material textures.
 * 
 * @param {string} [side='graphic']
 * @param {boolean} [announce=false] - Whether to show a toast notification.
 */
export function clearGraphic(side = 'graphic', announce = false) {
    const config = sideConfigs[side];
    setGizmoActive(false);

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

    if (config.thumb) config.thumb.removeAttribute('src');
    if (config.input) config.input.value = '';
    if (config.titleElement) {
        config.titleElement.textContent = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('upload.title') : config.defaultTitle;
        config.titleElement.removeAttribute('title');
    }
    resetTransformInputs(side);
    saveCurrentGraphicToCache();
    if (modelRoot) modelRoot.userData.lastConfigStr = null;
    applyConfigurationToScene(false);
    syncSideUi(side);

    eventBus.emit('graphic:cleared', side);

    if (announce) {
        showToast('Graphic removed', `${config.label} graphic has been cleared from the preview.`, 'info');
    }
}

/**
 * Binds dropzone drag-and-drop and file input change events.
 */
export function initGraphicManager() {
    const config = sideConfigs.graphic;
    if (!config) return;

    if (config.input) {
        config.input.addEventListener('change', (e) => {
            initMoveable();
            const file = e.target.files && e.target.files[0];
            if (file) handleGraphicFile('graphic', file);
        });
    }

    if (config.dropzone) {
        const preloadMoveableOnce = () => {
            initMoveable();
        };

        config.dropzone.addEventListener('click', preloadMoveableOnce, { once: true });
        config.dropzone.addEventListener('dragenter', preloadMoveableOnce, { once: true });
        config.dropzone.addEventListener('drop', preloadMoveableOnce, { once: true });

        config.dropzone.addEventListener('click', (e) => {
            if (e.target.closest('#clear-graphic, #graphic-thumb-frame')) return;
            if (config.clearButton && !config.clearButton.hidden) {
                const clearRect = config.clearButton.getBoundingClientRect();
                const dropRect = config.dropzone.getBoundingClientRect();
                if (e.clientX >= clearRect.left - 14 && e.clientX <= dropRect.right) {
                    clearGraphic('graphic', true);
                    return;
                }
            }
            if (config.input) {
                config.input.click();
            }
        });

        config.dropzone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                if (e.target.closest('#clear-graphic, #graphic-thumb-frame')) return;
                e.preventDefault();
                if (config.input) {
                    config.input.click();
                }
            }
        });

        let dragCounter = 0;

        config.dropzone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter++;
            config.dropzone.classList.add('is-drag-over');
        });

        config.dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            config.dropzone.classList.add('is-drag-over');
        });

        config.dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                config.dropzone.classList.remove('is-drag-over');
            }
        });

        config.dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter = 0;
            config.dropzone.classList.remove('is-drag-over');
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) handleGraphicFile('graphic', file);
        });
    }

    if (config.clearButton) {
        config.clearButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            clearGraphic('graphic', true);
        });
        config.clearButton.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        config.clearButton.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
    }

    if (config.resetButton) {
        config.resetButton.addEventListener('click', (e) => {
            e.stopPropagation();
            resetTransforms('graphic');
            showToast('Position Reset', 'Graphic transforms reset to defaults.', 'info', 1500);
        });
    }
}
