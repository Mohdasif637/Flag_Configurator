import * as THREE from 'three';
import { scene, sceneRoot, renderer } from '../core/scene.js';
import { dom } from '../ui/domElements.js';
import { configState, state } from '../state/configState.js';
import { sideConfigs, saveCurrentGraphicToCache } from '../graphics/graphicConfig.js';
import { getPricingData } from '../state/pricing.js';
import { getCurrencySymbol, updateContentWithTranslations } from '../ui/preferences.js';
import { showToast } from '../ui/toast.js';
import { loadScript } from '../utils/helpers.js';
import { normalizeHex } from '../models/materials.js';
import { targetCenter as defaultTargetCenter, cameraDistance as defaultCameraDistance } from '../core/camera.js';
import { syncControlAvailability } from '../ui/uiController.js';

let pdfLibrariesLoading = false;
let pdfLibrariesPromise = null;
let exportRenderer = null;
let exportCamera = null;
const exportRenderSize = 2048;

/**
 * Dynamically loads jsPDF and pdf.js libraries from CDN.
 * @returns {Promise<boolean>}
 */
export function loadPdfLibraries() {
    if (window.jspdf && window.pdfjsLib) {
        return Promise.resolve(true);
    }
    
    if (pdfLibrariesLoading) {
        return pdfLibrariesPromise;
    }
    
    pdfLibrariesLoading = true;
    
    pdfLibrariesPromise = Promise.all([
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
    ]).then(() => {
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        pdfLibrariesLoading = false;
        return true;
    }).catch(err => {
        console.error('Failed to load PDF libraries', err);
        showToast('Load Failed', 'Could not load the PDF saving libraries. Please check your internet connection.', 'error', 4000);
        pdfLibrariesLoading = false;
        pdfLibrariesPromise = null;
        return false;
    });
    
    return pdfLibrariesPromise;
}

let pdfSaveProgressRatio = 0;
let pdfSaveCrawlerId = null;

function setPdfSaveProgress(ratio) {
    if (!dom.generatePdf) return;
    let bar = dom.generatePdf.querySelector('.btn-progress');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'btn-progress';
        dom.generatePdf.appendChild(bar);
    }
    pdfSaveProgressRatio = Math.min(Math.max(ratio, 0), 1);
    bar.style.opacity = '0.85';
    bar.style.transform = `scaleX(${pdfSaveProgressRatio})`;
}

function startPdfSaveCrawler(startProgress = 0.15, targetMax = 0.88, creepRate = 0.25) {
    stopPdfSaveCrawler();
    setPdfSaveProgress(startProgress);
    let lastTime = performance.now();
    const tick = (now) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        if (pdfSaveProgressRatio < targetMax) {
            const nextVal = pdfSaveProgressRatio + (targetMax - pdfSaveProgressRatio) * (creepRate * dt);
            setPdfSaveProgress(nextVal);
            pdfSaveCrawlerId = window.requestAnimationFrame(tick);
        }
    };
    pdfSaveCrawlerId = window.requestAnimationFrame(tick);
}

function stopPdfSaveCrawler() {
    if (pdfSaveCrawlerId) {
        window.cancelAnimationFrame(pdfSaveCrawlerId);
        pdfSaveCrawlerId = null;
    }
}

function finishPdfSaveProgress() {
    stopPdfSaveCrawler();
    setPdfSaveProgress(1.0);
    setTimeout(() => {
        if (!dom.generatePdf) return;
        const bar = dom.generatePdf.querySelector('.btn-progress');
        if (bar) {
            bar.style.opacity = '0';
            setTimeout(() => {
                bar.style.transform = 'scaleX(0)';
            }, 300);
        }
    }, 350);
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

function captureProofView(position, targetCenter) {
    const exportContext = getExportRenderer();
    exportContext.camera.position.copy(position);
    exportContext.camera.lookAt(targetCenter);
    exportContext.renderer.render(scene, exportContext.camera);
    return exportContext.renderer.domElement.toDataURL('image/jpeg', 1.0);
}

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

/**
 * Generates and downloads a print-ready vector PDF proof including 3D snapshots,
 * technical specs, selected options, and dynamic price breakdown.
 * 
 * @param {THREE.Vector3} targetCenter - Active 3D focus center.
 * @param {number} cameraDistance - Distance for snapshot capture.
 */
export async function generatePdfProof(targetCenterOverride, cameraDistanceOverride) {
    if (!state.ready || state.isExporting) return;

    const targetCenter = (targetCenterOverride instanceof THREE.Vector3) ? targetCenterOverride : defaultTargetCenter;
    const cameraDistance = (typeof cameraDistanceOverride === 'number') ? cameraDistanceOverride : defaultCameraDistance;

    if (sideConfigs.graphic.gizmoActive) {
        saveCurrentGraphicToCache();
        sideConfigs.graphic.gizmoActive = false;
    }

    state.isExporting = true;
    syncControlAvailability();
    startPdfSaveCrawler(0.15, 0.88, 0.25);
    const saveBtnSpan = dom.generatePdf ? dom.generatePdf.querySelector('span') : null;
    const origText = saveBtnSpan ? saveBtnSpan.textContent : '';
    if (saveBtnSpan) {
        saveBtnSpan.textContent = (window.i18next && window.i18next.isInitialized) ? window.i18next.t('actions.saving') : 'Saving...';
    }

    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function') {
        const success = await loadPdfLibraries();
        if (!success) {
            stopPdfSaveCrawler();
            if (dom.generatePdf) {
                const bar = dom.generatePdf.querySelector('.btn-progress');
                if (bar) bar.style.opacity = '0';
            }
            if (saveBtnSpan) saveBtnSpan.textContent = origText;
            updateContentWithTranslations();
            state.isExporting = false;
            syncControlAvailability();
            return;
        }
    }

    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        const savedRotation = sceneRoot.rotation.clone();
        sceneRoot.rotation.set(0, 0, 0);
        scene.updateMatrixWorld(true);

        const frontImage = captureProofView(new THREE.Vector3(0, targetCenter.y, cameraDistance), targetCenter);
        const backImage = captureProofView(new THREE.Vector3(0, targetCenter.y, -cameraDistance), targetCenter);

        sceneRoot.rotation.copy(savedRotation);

        const getTrans = (key, fallback) => (window.i18next && window.i18next.isInitialized) ? window.i18next.t(key) : fallback;

        const pdfTitle = getTrans('pdf.title', 'Flag Configurator - Saved Design');
        const pdfSavedOn = getTrans('pdf.saved_on', 'Saved on: ');
        const pdfFrontLayout = getTrans('pdf.front_layout', 'Front Layout');
        const pdfBackLayout = getTrans('pdf.back_layout', 'Back Layout');
        const pdfFilename = getTrans('pdf.filename', 'Flag_Design');

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
        const valPocketColor = normalizeHex(dom.pocketColor ? dom.pocketColor.value : '') || '#000000';

        // Calculate dynamic pricing
        let sizePrice = 0;
        let printingAddon = 0;
        let poleAddon = 0;
        let basePrice = 0;
        const currencySymbol = getCurrencySymbol();
        const pricingData = getPricingData();

        if (pricingData) {
            const sizeMapping = {
                'Feather Flag Convex XS': 'xs',
                'Feather Flag Convex S': 'S',
                'Feather Flag Convex M': 'M',
                'Feather Flag Convex M-Extra Wide': 'M-Wide',
                'Feather Flag Convex L': 'l'
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

            if (configState.pole === 'With Pole' && hwTier && flagOnlyTier) {
                poleAddon = hwTier[printKey] - flagOnlyTier[printKey];
            }

            if (configState.base !== 'No base') {
                const mappedBase = baseMapping[configState.base] || configState.base;
                if (mappedBase && pricingData.pricingTiers.bases[mappedBase]) {
                    basePrice = pricingData.pricingTiers.bases[mappedBase];
                }
            }
        }

        const totalPrice = sizePrice + printingAddon + poleAddon + basePrice;

        // Render PDF header
        doc.setFontSize(20);
        doc.setTextColor(50, 50, 50);
        doc.setFont('helvetica', 'bold');
        doc.text(pdfTitle, 20, 18);
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.setFont('helvetica', 'normal');
        doc.text(`${pdfSavedOn}${new Date().toLocaleDateString()}`, 20, 26);

        // Render total price
        const pdfTotalPriceLabel = getTrans('pdf.total_price', 'Total Price') + ':';
        const pdfTotalPriceVal = `${currencySymbol} ${totalPrice.toFixed(2)}`;
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'bold');
        doc.text(pdfTotalPriceLabel, 277, 18, { align: 'right' });
        doc.setFontSize(20);
        doc.setTextColor(5, 150, 105);
        doc.text(pdfTotalPriceVal, 277, 26, { align: 'right' });

        // Render layouts
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text(pdfFrontLayout, 20, 36);
        doc.addImage(frontImage, 'JPEG', 20, 40, 105, 105);

        doc.text(pdfBackLayout, 150, 36);
        doc.addImage(backImage, 'JPEG', 150, 40, 105, 105);

        // Divider
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.5);
        doc.line(20, 153, 277, 153);

        // Headers
        doc.setFontSize(9);
        doc.setTextColor(130, 130, 130);
        doc.setFont('helvetica', 'bold');
        doc.text(lblSize, 20, 161);
        doc.text(lblPrinting, 75, 161);
        doc.text(lblDirection, 125, 161);
        doc.text(lblPole, 165, 161);
        doc.text(lblBase, 205, 161);
        doc.text(lblPocketColor, 245, 161);

        // Values
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'normal');
        doc.text(valSize, 20, 168);
        doc.text(valPrinting, 75, 168);
        doc.text(valDirection, 125, 168);
        doc.text(valPole, 165, 168);
        doc.text(valBase, 205, 168);
        doc.text(valPocketColor, 245, 168);

        // Option prices
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(`${currencySymbol} ${sizePrice.toFixed(2)}`, 20, 174);
        doc.text((printingAddon > 0 ? `+ ${currencySymbol} ${printingAddon.toFixed(2)}` : `${currencySymbol} 0.00`), 75, 174);
        doc.text('', 125, 174);
        doc.text((poleAddon > 0 ? `+ ${currencySymbol} ${poleAddon.toFixed(2)}` : `${currencySymbol} 0.00`), 165, 174);
        doc.text((basePrice > 0 ? `+ ${currencySymbol} ${basePrice.toFixed(2)}` : `${currencySymbol} 0.00`), 205, 174);

        // Color swatch preview rectangle
        const rgb = hexToRgb(valPocketColor);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(245, 171, 12, 6, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(245, 171, 12, 6, 'D');

        const sizePart = configState.size.replace(/\s+/g, '-');
        const printingPart = configState.printing.replace(/\s+/g, '-');
        const directionPart = configState.printing !== 'Double Sided' ? `-${configState.direction}` : '';
        const configDetails = `${sizePart}-${printingPart}${directionPart}`;

        doc.save(`${pdfFilename}_${configDetails}.pdf`);
        finishPdfSaveProgress();
        showToast('Design saved', 'Saved successfully.', 'success');
    } catch (error) {
        console.error('PDF generation failed:', error);
        stopPdfSaveCrawler();
        if (dom.generatePdf) {
            const bar = dom.generatePdf.querySelector('.btn-progress');
            if (bar) bar.style.opacity = '0';
        }
        showToast('Save failed', 'Unable to save your design. Please try again.', 'error', 4200);
    } finally {
        if (saveBtnSpan) saveBtnSpan.textContent = origText;
        updateContentWithTranslations();
        state.isExporting = false;
        syncControlAvailability();
    }
}
