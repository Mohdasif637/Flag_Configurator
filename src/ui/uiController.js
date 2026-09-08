import * as THREE from 'three';
import { dom, mobileViewportMediaQuery } from './domElements.js';
import { configState, state } from '../state/configState.js';
import { sideConfigs } from '../graphics/graphicConfig.js';
import { formatSelectionName } from '../utils/helpers.js';
import { getClampedPixelRatio } from '../utils/mathUtils.js';
import { renderer, scene, lightingGroup, markSceneDirty } from '../core/scene.js';
import { camera, updateCameraViewportOffset, setActiveCameraView } from '../core/camera.js';
import {
    updateDynamicCameraTargets,
    focusCameraView,
    stopTurntableRotation,
    toggleTurntable,
    runPrintingCameraSequence,
    runDirectionCameraSequence
} from '../core/cameraTransitions.js';
import { toggleAnimation, syncPlayPauseButton } from '../core/renderLoop.js';
import { applyConfigurationToScene, toggleCharacterReference } from '../models/flagModel.js';
import { discardGizmoChanges, updateGizmoOverlay } from '../graphics/gizmo.js';
import { isEnvPanelOpen, setEnvPanelOpen, environmentTexture } from '../core/environment.js';
import { getPocketColorPickr, queuePocketColorPickerLayout, restorePocketColorPickerNativeLayout } from './colorPicker.js';
import { currentLanguage, currentCurrency, syncPreferenceMenuUi, setPreferenceDropdownOpen, updateContentWithTranslations } from './preferences.js';
import { updateDynamicPrices } from '../state/pricing.js';
import { generatePdfProof } from '../features/pdfExport.js';
import { shareCurrentDesign } from '../features/shareExport.js';
import { showToast } from './toast.js';

/**
 * Initializes the carousel controls, active option cards, and category change handlers.
 */
export function initConfiguratorUI() {
    const sections = document.querySelectorAll('.config-section');

    sections.forEach((section) => {
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
            setTimeout(updateArrows, 100);
        }

        cards.forEach((card) => {
            const category = card.dataset.category;
            const value = card.dataset.value;

            if (category && configState[category] === value) {
                cards.forEach((c) => c.classList.remove('is-active'));
                card.classList.add('is-active');
                if (nameDisplay) nameDisplay.textContent = formatSelectionName(category, value);
                if (priceDisplay && card.dataset.price) priceDisplay.textContent = card.dataset.price;
            }

            card.addEventListener('click', () => {
                cards.forEach((c) => c.classList.remove('is-active'));
                card.classList.add('is-active');

                const clickedCategory = card.dataset.category;
                const clickedValue = card.dataset.value;
                const price = card.dataset.price;

                if (sideConfigs.graphic.gizmoActive && clickedCategory && configState[clickedCategory] !== clickedValue) {
                    discardGizmoChanges(false);
                }

                let sizeChanged = false;
                let baseChanged = false;
                if (clickedCategory && clickedCategory !== 'pole-cover') {
                    if (clickedCategory === 'size' && configState.size !== clickedValue) {
                        sizeChanged = true;
                    }
                    if (clickedCategory === 'base' && configState.base !== clickedValue) {
                        baseChanged = true;
                    }
                    configState[clickedCategory] = clickedValue;
                }

                if (nameDisplay) nameDisplay.textContent = formatSelectionName(clickedCategory, clickedValue);
                if (priceDisplay && price) priceDisplay.textContent = price;

                if (clickedCategory === 'size' || clickedCategory === 'printing' || clickedCategory === 'base') {
                    stopTurntableRotation();
                }

                let swapDuration = 800;
                let isBaseSwap = false;
                if (sizeChanged) {
                    const primaryView = (configState.printing === 'Double Sided')
                        ? 'front'
                        : ((configState.direction === 'Left') ? 'back' : 'front');
                    const primaryBtn = dom.cameraButtons.find((b) => b.dataset.view === primaryView);
                    if (primaryBtn && !primaryBtn.classList.contains('is-active')) {
                        setActiveCameraView(primaryView);
                        swapDuration = 570;
                    } else {
                        setActiveCameraView(primaryView);
                    }
                } else if (baseChanged) {
                    if (clickedValue === 'No base') {
                        setActiveCameraView('home');
                    } else {
                        setActiveCameraView(null);
                    }
                    isBaseSwap = true;
                }

                applyConfigurationToScene(sizeChanged || baseChanged, swapDuration, isBaseSwap);

                if (clickedCategory === 'printing') {
                    window.setTimeout(() => {
                        runPrintingCameraSequence();
                    }, 50);
                } else if (clickedCategory === 'direction') {
                    window.setTimeout(() => {
                        runDirectionCameraSequence(clickedValue);
                    }, 50);
                }
            });
        });
    });

    applyConfigurationToScene(false);
}

/**
 * Updates UI control enablement according to loading, export, and AR state.
 */
export function syncControlAvailability() {
    const baseEnabled = state.ready && !state.modelFailed && !state.isExporting && !state.isInAR;

    if (dom.uiPanel) dom.uiPanel.classList.toggle('is-disabled', !baseEnabled);
    if (dom.pocketColor) dom.pocketColor.disabled = !baseEnabled;
    if (dom.pocketColorTrigger) dom.pocketColorTrigger.disabled = !baseEnabled;
    if (dom.playPause) dom.playPause.disabled = !baseEnabled;
    if (dom.generatePdf) dom.generatePdf.disabled = !baseEnabled;
    if (dom.shareDesign) dom.shareDesign.disabled = !baseEnabled;

    dom.cameraButtons.forEach((button) => {
        button.disabled = !baseEnabled;
    });
    if (dom.turntableToggle) dom.turntableToggle.disabled = !baseEnabled;
    if (dom.charToggle) dom.charToggle.disabled = !baseEnabled;

    const environmentEnabled = baseEnabled && state.environmentLoaded;
    if (dom.envToggle) dom.envToggle.disabled = !environmentEnabled;
    if (dom.envExposure) dom.envExposure.disabled = !environmentEnabled;
    if (dom.envRotate) dom.envRotate.disabled = !environmentEnabled;
}

/**
 * Updates the template download button href, download attribute, and filename label.
 */
export function updateTemplateDownloadLink() {
    const downloadBtn = dom.templateDownloadBtn || document.getElementById('template-download-btn');
    const filenameDisplay = dom.templateFilename || document.getElementById('template-filename');
    if (!downloadBtn) return;

    const sizeMapping = {
        'Feather Flag Convex XS': 'xs',
        'Feather Flag Convex S': 'S',
        'Feather Flag Convex M': 'M',
        'Feather Flag Convex M-Extra Wide': 'M-Wide',
        'Feather Flag Convex L': 'l'
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

    let fileSuffix = '';
    if (configState.printing === 'Double Sided') {
        fileSuffix = '-double-sided';
    } else {
        const dirSuffix = configState.direction.toLowerCase() === 'left' ? '-left' : '-right';
        fileSuffix = `-single-sided${dirSuffix}`;
    }

    const filename = `featherflag-convex-${sizeInfo.file}${fileSuffix}.pdf`;
    const downloadUrl = `./assets/templates/${filename}`;

    let sizeText = configState.size;
    if (window.i18next && window.i18next.isInitialized) {
        sizeText = window.i18next.t(`selections.size.${configState.size}`);
    }
    const sizePart = sizeText.replace(/\s+/g, '-');

    let printingText = configState.printing;
    if (window.i18next && window.i18next.isInitialized) {
        printingText = window.i18next.t(`selections.printing.${configState.printing}`);
    }
    const printingPart = printingText.replace(/\s+/g, '-');

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

    downloadBtn.href = downloadUrl;
    downloadBtn.setAttribute('download', filename);
    downloadBtn.removeAttribute('target');
    downloadBtn.removeAttribute('rel');
    if (filenameDisplay) {
        filenameDisplay.textContent = displayName;
    }
}

/**
 * Initiates the download for the active size/printing template PDF.
 * @param {Event} [event]
 */
export async function handleTemplateDownload(event) {
    if (event) event.preventDefault();
    const downloadBtn = dom.templateDownloadBtn || document.getElementById('template-download-btn');
    if (!downloadBtn) return;

    const url = downloadBtn.getAttribute('href');
    const filename = downloadBtn.getAttribute('download') || 'graphic-template.pdf';
    if (!url) return;

    if (window.location.protocol === 'file:') {
        const isKnownAvailable = filename.includes('-xs-') || filename.includes('-l-');
        if (isKnownAvailable) {
            triggerFileDownload(url, filename);
        } else {
            showTemplateUnavailableToast();
        }
        return;
    }

    try {
        const response = await fetch(url, {
            method: 'HEAD',
            cache: 'no-store'
        });

        if (response.ok) {
            triggerFileDownload(url, filename);
        } else {
            showTemplateUnavailableToast();
        }
    } catch (err) {
        console.warn('[Template Download] HEAD check failed:', err);
        const isKnownAvailable = filename.includes('-xs-') || filename.includes('-l-');
        if (isKnownAvailable) {
            triggerFileDownload(url, filename);
        } else {
            showTemplateUnavailableToast();
        }
    }
}

function triggerFileDownload(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showTemplateUnavailableToast() {
    const title = (window.i18next && window.i18next.isInitialized)
        ? window.i18next.t('templates.unavailable_title')
        : 'Template Coming Soon';
    const desc = (window.i18next && window.i18next.isInitialized)
        ? window.i18next.t('templates.unavailable_desc')
        : 'The graphic template for this size is currently being prepared. Please check back soon.';
    showToast(title, desc, 'info', 4500);
}

/**
 * Sets visibility and animated progress bar of the initial 3D loading overlay.
 * 
 * @param {boolean} visible
 * @param {string} [messageKeyOrText]
 */
export function setLoadingState(visible, messageKeyOrText = '') {
    if (visible) {
        dom.loadingOverlay.classList.add('is-visible');
        dom.loadingOverlay.style.opacity = '1';

        const progressBar = document.getElementById('loading-progress-bar');
        if (progressBar) {
            progressBar.style.transition = 'none';
            progressBar.style.width = '0%';
            progressBar.offsetHeight; // Force reflow
            progressBar.style.transition = 'width 4.0s cubic-bezier(0.08, 0.82, 0.17, 1.0)';
            progressBar.style.width = '80%';
        }

        if (messageKeyOrText && messageKeyOrText.includes('toasts.')) {
            dom.loadingText.setAttribute('data-i18n', messageKeyOrText);
            if (window.i18next && window.i18next.isInitialized) {
                dom.loadingText.textContent = window.i18next.t(messageKeyOrText);
            }
        } else if (messageKeyOrText) {
            dom.loadingText.removeAttribute('data-i18n');
            dom.loadingText.textContent = messageKeyOrText;
        }
    } else {
        const progressBar = document.getElementById('loading-progress-bar');
        if (progressBar) {
            progressBar.style.transition = 'width 0.25s ease-out';
            progressBar.style.width = '100%';
        }

        setTimeout(() => {
            dom.loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                dom.loadingOverlay.classList.remove('is-visible');
            }, 500);
        }, 300);
    }
}

/**
 * Handles window resize events, adjusting aspect ratio, canvas dimensions,
 * clamped device pixel ratios, and dynamic camera targets.
 */
export function handleResize() {
    markSceneDirty();
    const width = dom.canvasContainer ? dom.canvasContainer.clientWidth : window.innerWidth;
    const height = dom.canvasContainer ? dom.canvasContainer.clientHeight : window.innerHeight;

    updateCameraViewportOffset();

    renderer.setPixelRatio(getClampedPixelRatio(mobileViewportMediaQuery.matches));
    renderer.setSize(width, height);

    updateDynamicCameraTargets(false);

    const pickr = getPocketColorPickr();
    if (pickr?.isOpen()) {
        queuePocketColorPickerLayout();
    } else if (!mobileViewportMediaQuery.matches) {
        restorePocketColorPickerNativeLayout();
    }

    Object.values(sideConfigs).forEach((config) => {
        if (config.gizmoActive) {
            updateGizmoOverlay();
        }
    });
}

/**
 * Binds DOM event listeners for preferences, camera controls, toolbars,
 * environment panel, tooltips, and action buttons.
 */
export function bindUIEvents() {
    if (dom.playPause) dom.playPause.addEventListener('click', toggleAnimation);
    if (dom.generatePdf) dom.generatePdf.addEventListener('click', generatePdfProof);
    if (dom.shareDesign) dom.shareDesign.addEventListener('click', shareCurrentDesign);
    if (dom.addToCart) {
        dom.addToCart.addEventListener('click', () => {
            showToast('Coming Soon.....', '', 'info', 2500);
        });
    }
    if (dom.turntableToggle) dom.turntableToggle.addEventListener('click', toggleTurntable);
    if (dom.templateDownloadBtn) dom.templateDownloadBtn.addEventListener('click', handleTemplateDownload);

    // Printing Info Tooltip Popover
    if (dom.printingInfoBtn && dom.printingInfoPopover) {
        if (dom.printingInfoPopover.parentElement !== document.body) {
            document.body.appendChild(dom.printingInfoPopover);
        }

        const updatePrintingTooltipPosition = () => {
            if (!dom.printingInfoBtn || !dom.printingInfoPopover || dom.printingInfoPopover.hidden) return;

            const btnRect = dom.printingInfoBtn.getBoundingClientRect();
            if (btnRect.bottom < 0 || btnRect.top > window.innerHeight) {
                togglePrintingTooltip(false);
                return;
            }

            const popoverRect = dom.printingInfoPopover.getBoundingClientRect();
            const popoverWidth = popoverRect.width || 280;
            const popoverHeight = popoverRect.height || 220;

            let left = btnRect.left;
            const maxLeft = window.innerWidth - popoverWidth - 12;
            if (left > maxLeft) left = maxLeft;
            if (left < 12) left = 12;

            let top = btnRect.bottom + 8;
            if (top + popoverHeight > window.innerHeight - 12) {
                if (btnRect.top - popoverHeight - 8 >= 12) {
                    top = btnRect.top - popoverHeight - 8;
                } else {
                    top = Math.max(12, window.innerHeight - popoverHeight - 12);
                }
            }

            dom.printingInfoPopover.style.top = `${Math.round(top)}px`;
            dom.printingInfoPopover.style.left = `${Math.round(left)}px`;
        };

        const togglePrintingTooltip = (forceOpen) => {
            const shouldOpen = (typeof forceOpen === 'boolean') ? forceOpen : dom.printingInfoPopover.hidden;
            dom.printingInfoPopover.hidden = !shouldOpen;
            dom.printingInfoBtn.setAttribute('aria-expanded', String(shouldOpen));
            if (shouldOpen) {
                updatePrintingTooltipPosition();
                requestAnimationFrame(updatePrintingTooltipPosition);
            }
        };

        const uiShell = document.getElementById('ui-shell');
        if (uiShell) {
            uiShell.addEventListener('scroll', updatePrintingTooltipPosition, { passive: true });
        }
        window.addEventListener('scroll', updatePrintingTooltipPosition, { passive: true });
        window.addEventListener('resize', updatePrintingTooltipPosition, { passive: true });

        let lastTouchTime = 0;
        const markTouch = () => { lastTouchTime = Date.now(); };
        dom.printingInfoBtn.addEventListener('touchstart', markTouch, { passive: true });
        dom.printingInfoBtn.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') markTouch();
        }, { passive: true });

        dom.printingInfoBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            togglePrintingTooltip();
        });

        let tooltipHoverTimer = null;
        const cancelTooltipTimer = () => {
            if (tooltipHoverTimer) {
                clearTimeout(tooltipHoverTimer);
                tooltipHoverTimer = null;
            }
        };

        dom.printingInfoBtn.addEventListener('mouseenter', () => {
            if (Date.now() - lastTouchTime < 800) return;
            cancelTooltipTimer();
            togglePrintingTooltip(true);
        });

        dom.printingInfoBtn.addEventListener('mouseleave', () => {
            if (Date.now() - lastTouchTime < 800) return;
            cancelTooltipTimer();
            tooltipHoverTimer = setTimeout(() => {
                togglePrintingTooltip(false);
            }, 300);
        });

        dom.printingInfoPopover.addEventListener('mouseenter', () => {
            if (Date.now() - lastTouchTime < 800) return;
            cancelTooltipTimer();
        });

        dom.printingInfoPopover.addEventListener('mouseleave', () => {
            if (Date.now() - lastTouchTime < 800) return;
            cancelTooltipTimer();
            tooltipHoverTimer = setTimeout(() => {
                togglePrintingTooltip(false);
            }, 300);
        });

        document.addEventListener('click', (event) => {
            if (!dom.printingInfoPopover.hidden && !dom.printingInfoPopover.contains(event.target) && !dom.printingInfoBtn.contains(event.target)) {
                togglePrintingTooltip(false);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !dom.printingInfoPopover.hidden) {
                togglePrintingTooltip(false);
                dom.printingInfoBtn.focus();
            }
        });
    }

    // Preferences Dropdown
    if (dom.prefBtn) {
        dom.prefBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = dom.prefDropdown.classList.contains('is-open');
            setPreferenceDropdownOpen(!isOpen);
        });
    }

    document.addEventListener('click', (event) => {
        if (dom.prefDropdown && dom.prefDropdown.classList.contains('is-open')) {
            if (!dom.prefDropdown.contains(event.target) && !dom.prefBtn.contains(event.target)) {
                setPreferenceDropdownOpen(false);
            }
        }
    });

    if (dom.prefLangList) {
        const langItems = dom.prefLangList.querySelectorAll('.pref-menu-item');
        langItems.forEach((item) => {
            item.addEventListener('click', async () => {
                const lang = item.dataset.value;
                localStorage.setItem('pref-language', lang);
                syncPreferenceMenuUi();
                if (window.i18next && window.i18next.isInitialized) {
                    await window.i18next.changeLanguage(lang);
                    updateContentWithTranslations();
                    updateDynamicPrices();
                    updateTemplateDownloadLink();
                }
            });
        });
    }

    if (dom.prefCurrencyList) {
        const currencyItems = dom.prefCurrencyList.querySelectorAll('.pref-menu-item');
        currencyItems.forEach((item) => {
            item.addEventListener('click', () => {
                const curr = item.dataset.value;
                localStorage.setItem('pref-currency', curr);
                syncPreferenceMenuUi();
                updateDynamicPrices();
            });
        });
    }

    // Keyboard Space shortcut to play/pause flag animation
    window.addEventListener('keydown', (event) => {
        const activeTag = document.activeElement?.tagName;
        const isInteractiveFocus = activeTag === 'INPUT' || activeTag === 'BUTTON' || document.activeElement?.classList.contains('upload-card');

        if (event.code === 'Space' && !isInteractiveFocus) {
            event.preventDefault();
            toggleAnimation();
        }
    });

    // Height Reference Character Toggle
    if (dom.charToggle) {
        dom.charToggle.addEventListener('click', () => {
            if (dom.charToggle.disabled) return;
            if (sideConfigs.graphic.gizmoActive) {
                discardGizmoChanges(false);
            }
            toggleCharacterReference();
        });
    }

    // Environment Lighting Settings
    if (dom.envToggle) {
        dom.envToggle.addEventListener('click', () => {
            if (dom.envToggle.disabled) return;
            setEnvPanelOpen(!isEnvPanelOpen());
        });
    }

    document.addEventListener('click', (event) => {
        if (dom.cameraWrapper && !dom.cameraWrapper.contains(event.target) && isEnvPanelOpen()) {
            setEnvPanelOpen(false);
        }
    });

    if (dom.envExposure) {
        dom.envExposure.addEventListener('input', (event) => {
            renderer.toneMappingExposure = Number.parseFloat(event.target.value);
            markSceneDirty();
        });
    }

    if (dom.envRotate) {
        dom.envRotate.addEventListener('input', (event) => {
            if (!environmentTexture) return;
            const radians = Number.parseFloat(event.target.value);
            scene.environmentRotation.y = radians;
            lightingGroup.rotation.y = radians;
            markSceneDirty();
        });
    }

    if (dom.envReset) {
        dom.envReset.addEventListener('click', () => {
            dom.envExposure.value = '1';
            dom.envRotate.value = '0';
            renderer.toneMappingExposure = 1;
            scene.environmentRotation.y = 0;
            lightingGroup.rotation.y = 0;
            markSceneDirty();
        });
    }

    // Camera Preset Buttons
    dom.cameraButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (sideConfigs.graphic.gizmoActive) {
                discardGizmoChanges(false);
            }
            const view = button.dataset.view;
            if (view !== 'home') stopTurntableRotation();
            focusCameraView(view);
        });
    });

    window.addEventListener('resize', handleResize);
}
