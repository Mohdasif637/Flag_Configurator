import { dom } from './domElements.js';

export const activeToasts = [];

/**
 * Translates known toast messages using i18next dictionaries if available.
 * 
 * @param {string} text - The input toast key or message string.
 * @returns {string} Translated message.
 */
export function translateToastText(text) {
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
        'Loading PDF System': 'toasts.loading_pdf_system_title',
        'Preparing the PDF processing modules...': 'toasts.loading_pdf_system_msg',
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
        'Template layers hidden': 'toasts.template_layers_hidden_title',
        'Template guide layers (ProFlags, Safe zones) have been hidden in preview.': 'toasts.template_layers_hidden_msg',
        'Guide Completed': 'toasts.guide_completed_title',
        'You are ready to explore the flag configurator!': 'toasts.guide_completed_msg',
        'Flag Animation Paused': 'toasts.flag_animation_paused_title',
        'Saving design': 'toasts.saving_design_title',
        'Capturing front and back layouts for your design.': 'toasts.saving_design_msg',
        'Design saved': 'toasts.design_saved_title',
        'Your custom flag design has been saved successfully.': 'toasts.design_saved_msg',
        'Save failed': 'toasts.save_failed_title',
        'Unable to save your design. Please try again.': 'toasts.save_failed_msg',
        'Link copied': 'toasts.share_copied_title',
        'The sharing link has been copied to your clipboard.': 'toasts.share_copied_msg',
        'Share failed': 'toasts.share_failed_title',
        'Unable to generate the sharing link.': 'toasts.share_failed_msg',
        'Shared design loaded': 'toasts.share_loaded_title',
        'The shared custom flag design was loaded successfully.': 'toasts.share_loaded_msg',
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

/**
 * Attaches touch and pointer swipe-to-dismiss behavior to toast elements.
 * 
 * @param {HTMLElement} toast
 */
function attachToastSwipeDismiss(toast) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;
    let activePointerId = null;
    let lockAxis = null;

    const onPointerDown = (e) => {
        if (e.target.closest('.toast-close-btn')) return;

        startX = e.clientX;
        startY = e.clientY;
        currentX = 0;
        currentY = 0;
        lockAxis = null;
        isDragging = true;
        activePointerId = e.pointerId;

        if (toast.hideTimer) {
            window.clearTimeout(toast.hideTimer);
            toast.hideTimer = null;
        }

        try {
            toast.setPointerCapture(e.pointerId);
        } catch (err) {}

        toast.style.transition = 'none';
    };

    const onPointerMove = (e) => {
        if (!isDragging || e.pointerId !== activePointerId) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (!lockAxis) {
            if (absX < 5 && absY < 5) return;
            if (absX >= absY * 1.25) {
                lockAxis = 'horizontal';
            } else if (absY >= absX * 1.25) {
                lockAxis = 'vertical';
            } else {
                return;
            }
        }

        if (lockAxis === 'horizontal') {
            currentX = deltaX;
            currentY = 0;
            const opacity = Math.max(0.15, 1 - (absX / 160));
            toast.style.transform = `translate3d(${currentX}px, 0, 0)`;
            toast.style.opacity = opacity;
        } else if (lockAxis === 'vertical') {
            currentX = 0;
            currentY = deltaY;
            const opacity = Math.max(0.15, 1 - (absY / 160));
            toast.style.transform = `translate3d(0, ${currentY}px, 0)`;
            toast.style.opacity = opacity;
        }
    };

    const finishDismiss = (direction) => {
        toast.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.4, 1), opacity 0.2s ease';
        if (direction === 'right') {
            toast.style.transform = 'translate3d(140%, 0, 0)';
        } else if (direction === 'left') {
            toast.style.transform = 'translate3d(-140%, 0, 0)';
        } else if (direction === 'down') {
            toast.style.transform = 'translate3d(0, 140%, 0)';
        } else {
            toast.style.transform = 'translate3d(0, -140%, 0)';
        }
        toast.style.opacity = '0';
        dismissToast(toast, true);
    };

    const restoreToast = () => {
        toast.style.transition = 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease';
        toast.style.transform = 'translate3d(0, 0, 0)';
        toast.style.opacity = '1';
        toast.hideTimer = window.setTimeout(() => dismissToast(toast), 2500);
    };

    const onPointerUp = (e) => {
        if (!isDragging || e.pointerId !== activePointerId) return;
        isDragging = false;
        try {
            if (toast.hasPointerCapture(activePointerId)) {
                toast.releasePointerCapture(activePointerId);
            }
        } catch (err) {}

        const threshold = 35;

        if (lockAxis === 'horizontal') {
            if (currentX > threshold) {
                finishDismiss('right');
            } else if (currentX < -threshold) {
                finishDismiss('left');
            } else {
                restoreToast();
            }
        } else if (lockAxis === 'vertical') {
            if (currentY < -threshold) {
                finishDismiss('up');
            } else if (currentY > threshold) {
                finishDismiss('down');
            } else {
                restoreToast();
            }
        } else {
            restoreToast();
        }
    };

    const onPointerCancel = (e) => {
        if (!isDragging || e.pointerId !== activePointerId) return;
        isDragging = false;
        try {
            if (toast.hasPointerCapture(activePointerId)) {
                toast.releasePointerCapture(activePointerId);
            }
        } catch (err) {}
        restoreToast();
    };

    toast.addEventListener('pointerdown', onPointerDown);
    toast.addEventListener('pointermove', onPointerMove);
    toast.addEventListener('pointerup', onPointerUp);
    toast.addEventListener('pointercancel', onPointerCancel);
}

/**
 * Displays a toast notification in the UI toast container.
 * 
 * @param {string} title - Notification header text.
 * @param {string} [message] - Notification body message.
 * @param {'info'|'success'|'warning'|'danger'} [tone='info'] - Visual tone style.
 * @param {number} [duration=3200] - Duration in ms before automatically fading out.
 * @returns {Promise<void>} Resolves when toast is dismissed.
 */
export function showToast(title, message, tone = 'info', duration = 3200) {
    return new Promise((resolve) => {
        while (activeToasts.length >= 2) dismissToast(activeToasts[0]);

        if (!dom.toastRegion) return resolve();

        const priorNodes = Array.from(dom.toastRegion.children);
        const priorRects = priorNodes.map((node) => node.getBoundingClientRect());

        const toast = document.createElement('div');
        toast.className = `toast is-${tone}`;

        const bodyNode = document.createElement('div');
        bodyNode.className = 'toast-body';

        const titleNode = document.createElement('span');
        titleNode.className = 'toast-title';
        titleNode.textContent = translateToastText(title);
        bodyNode.append(titleNode);

        if (message) {
            const messageNode = document.createElement('span');
            messageNode.className = 'toast-copy';
            messageNode.textContent = translateToastText(message);
            bodyNode.append(messageNode);
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'toast-close-btn';
        closeBtn.setAttribute('aria-label', 'Dismiss notification');
        closeBtn.setAttribute('title', 'Dismiss');
        closeBtn.innerHTML = `
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;

        closeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            dismissToast(toast);
        });

        toast.append(bodyNode, closeBtn);
        attachToastSwipeDismiss(toast);

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

/**
 * Dismisses an active toast notification with smooth exit animations.
 * 
 * @param {HTMLElement} toast
 * @param {boolean} [immediate=false]
 */
export function dismissToast(toast, immediate = false) {
    if (!toast || toast.dataset.dismissed === 'true') return;

    toast.dataset.dismissed = 'true';
    window.clearTimeout(toast.hideTimer);

    const toastIndex = activeToasts.indexOf(toast);
    if (toastIndex !== -1) activeToasts.splice(toastIndex, 1);

    if (immediate) {
        window.setTimeout(() => {
            toast.remove();
            if (toast.resolvePromise) toast.resolvePromise();
        }, 240);
    } else {
        toast.classList.remove('is-visible');
        toast.classList.add('is-hiding');

        window.setTimeout(() => {
            toast.remove();
            if (toast.resolvePromise) toast.resolvePromise();
        }, 320);
    }
}
