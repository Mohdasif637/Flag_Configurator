import * as THREE from 'three';
import Pickr from '@simonwep/pickr';
import { dom, mobileViewportMediaQuery } from './domElements.js';
import { configState } from '../state/configState.js';
import { updatePocketMaterialColor, normalizeHex } from '../models/materials.js';
import { eventBus } from '../state/eventBus.js';

if (typeof window !== 'undefined' && !window.Pickr) {
    window.Pickr = Pickr;
}

let pocketColorPickr = null;
const pocketColorPickrLayoutState = {
    restoreStyleText: null
};

/**
 * Returns the active Pickr instance.
 * @returns {Object|null}
 */
export function getPocketColorPickr() {
    return pocketColorPickr;
}

/**
 * Synchronizes the color picker UI, swatch display, and 3D pocket material with the active color.
 * 
 * @param {string} hex - Hexadecimal color string.
 */
export function syncPocketColorUi(hex) {
    const normalizedHex = normalizeHex(hex);
    if (!normalizedHex) return;

    if (dom.pocketColor) dom.pocketColor.value = normalizedHex;
    if (dom.pocketColorValue) dom.pocketColorValue.textContent = normalizedHex;
    if (dom.pocketColorSwatch) dom.pocketColorSwatch.style.background = normalizedHex;

    const poleCoverName = document.querySelector('#section-pole-cover .selection-name');
    if (poleCoverName) {
        poleCoverName.textContent = normalizedHex;
        poleCoverName.style.color = normalizedHex;
    }

    configState.poleCoverColor = normalizedHex;
    updatePocketMaterialColor(normalizedHex);

    eventBus.emit('pocketColor:changed', normalizedHex);
}

/**
 * Initializes the Pickr color picker widget and binds swatch buttons.
 */
export function initializePocketColorPicker() {
    if (dom.pocketColor) {
        syncPocketColorUi(dom.pocketColor.value);
    }

    if (!window.Pickr) {
        if (dom.pocketColorTrigger) dom.pocketColorTrigger.disabled = true;
        console.warn('Pickr library not found on window object.');
        return;
    }

    if (!dom.pocketColorTrigger) return;

    pocketColorPickr = window.Pickr.create({
        el: dom.pocketColorTrigger,
        container: 'body',
        theme: 'nano',
        default: (dom.pocketColor && dom.pocketColor.value) || '#000000',
        useAsButton: true,
        autoReposition: true,
        position: 'bottom-middle',
        closeOnScroll: false,
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

    // Bind swatch buttons
    const swatchBtns = document.querySelectorAll('#section-pole-cover .color-swatch-btn');
    swatchBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const hex = btn.dataset.color;
            if (hex) {
                syncPocketColorUi(hex);
                if (pocketColorPickr) {
                    pocketColorPickr.setColor(hex);
                }
            }
        });
    });
}

export function queuePocketColorPickerLayout() {
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

export function restorePocketColorPickerNativeLayout() {
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
