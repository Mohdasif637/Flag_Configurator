import { dom } from '../ui/domElements.js';
import { configState, state } from '../state/configState.js';
import { sideConfigs, IMGBB_API_KEY } from '../graphics/graphicConfig.js';
import { showToast } from '../ui/toast.js';

/**
 * Compresses the active graphic preview to a low-res JPEG data URL for embedded URL sharing.
 * 
 * @param {Function} callback - Receives the compressed data URL or null.
 */
export function compressActiveGraphic(callback) {
    const config = sideConfigs.graphic;
    if (!config.previewUrl) {
        callback(null);
        return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const maxDim = 256;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
            if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
            } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
            }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        try {
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
            callback(compressedBase64);
        } catch (e) {
            console.error('Canvas serialization failed:', e);
            callback(null);
        }
    };
    img.onerror = () => {
        console.error('Failed to load graphic for compression');
        callback(null);
    };
    img.src = config.previewUrl;
}

/**
 * Creates a sharing link (uploading graphic to ImgBB if needed) and copies it to the clipboard
 * or opens the native system share sheet.
 */
export async function shareCurrentDesign() {
    if (!state.ready) return;

    if (!dom.shareDesign) return;
    dom.shareDesign.disabled = true;
    const origText = dom.shareDesign.innerHTML;
    const shareLabel = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('actions.sharing') : 'Sharing...';
    
    const labelSpan = dom.shareDesign.querySelector('span');
    if (labelSpan) labelSpan.textContent = shareLabel;
    
    const restoreButton = () => {
        dom.shareDesign.disabled = false;
        dom.shareDesign.innerHTML = origText;
    };

    const config = sideConfigs.graphic;

    const finalizeShare = async (graphicData) => {
        try {
            const payload = {
                size: configState.size,
                printing: configState.printing,
                direction: configState.direction,
                poleCoverColor: configState.poleCoverColor,
                pole: configState.pole,
                base: configState.base
            };

            if (graphicData) {
                payload.graphic = {
                    fileName: config.fileName || 'graphic.jpg',
                    scale: config.scale,
                    panX: config.panX,
                    panY: config.panY,
                    rotation: config.rotation,
                    ...graphicData
                };
            }

            const base64Str = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
            const shareUrl = window.location.origin + window.location.pathname + '#share=' + base64Str;

            if (navigator.share) {
                try {
                    await navigator.share({
                        title: (window.i18next && window.i18next.isInitialized) ? window.i18next.t('title') : '3D Flag Configurator',
                        text: 'Check out my custom 3D flag design!',
                        url: shareUrl
                    });
                    restoreButton();
                    return;
                } catch (e) {
                    if (e.name === 'AbortError') {
                        restoreButton();
                        return;
                    }
                }
            }

            await navigator.clipboard.writeText(shareUrl);
            showToast('Link copied', 'The sharing link has been copied to your clipboard.', 'success');
        } catch (err) {
            console.error('Sharing failed:', err);
            showToast('Share failed', 'Unable to generate the sharing link.', 'error');
        } finally {
            restoreButton();
        }
    };

    if (config.previewUrl) {
        try {
            if (!IMGBB_API_KEY || IMGBB_API_KEY.includes('YOUR_IMGBB_API_KEY')) {
                throw new Error('ImgBB API key is not configured.');
            }

            const res = await fetch(config.previewUrl);
            const blob = await res.blob();

            const formData = new FormData();
            formData.append('image', blob, config.fileName || 'graphic.webp');

            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.success && data.data && data.data.url) {
                await finalizeShare({ imageUrl: data.data.url });
            } else {
                throw new Error(data.error?.message || 'ImgBB upload failed');
            }
        } catch (error) {
            console.warn('ImgBB upload error, falling back to local base64 compression:', error);
            compressActiveGraphic(async (compressedData) => {
                await finalizeShare(compressedData ? { imgData: compressedData } : null);
            });
        }
    } else {
        await finalizeShare(null);
    }
}

/**
 * Assembles and returns the Add to Cart e-commerce payload.
 * @returns {Object}
 */
export function createCartPayload() {
    const config = sideConfigs.graphic;
    return {
        configuration: { ...configState },
        graphic: config.uploadedTexture ? {
            fileName: config.fileName,
            scale: config.scale,
            panX: config.panX,
            panY: config.panY,
            rotation: config.rotation
        } : null
    };
}
