/**
 * Main Application Bootstrap
 * 3D Flag Configurator
 */

import { fetchPricingData } from './state/pricing.js';
import { initI18n } from './ui/preferences.js';
import { checkAndLoadSharedDesign } from './state/urlParams.js';
import {
    initConfiguratorUI,
    bindUIEvents,
    handleResize,
    setLoadingState,
    syncControlAvailability
} from './ui/uiController.js';
import { initGraphicManager } from './graphics/graphicManager.js';
import { bindGizmoControls } from './graphics/gizmo.js';
import { initializePocketColorPicker } from './ui/colorPicker.js';
import { initCameraControls, setActiveCameraView } from './core/camera.js';
import {
    startRenderLoop,
    syncPlayPauseButton,
    startPostGuideTimers,
    showArSupportedToastIfSupported
} from './core/renderLoop.js';
import { initializeARSupport } from './features/arManager.js';
import { loadEnvironment } from './core/environment.js';
import { loadFlagModels } from './models/flagModel.js';
import { initNavCoachingGuide } from './ui/navGuide.js';
import { state } from './state/configState.js';

/**
 * Initializes controls, listeners, 3D assets, and starts rendering.
 */
async function bootstrap() {
    initCameraControls();
    initGraphicManager();
    bindGizmoControls();
    bindUIEvents();
    initializePocketColorPicker();
    syncControlAvailability();
    setLoadingState(true, 'toasts.loading_3d');
    setActiveCameraView('home');
    syncPlayPauseButton();

    initializeARSupport();
    startRenderLoop();

    try {
        await Promise.all([
            loadEnvironment(),
            loadFlagModels()
        ]);
        state.ready = true;
        setLoadingState(false, '');
        syncControlAvailability();

        initNavCoachingGuide();
        startPostGuideTimers();
        showArSupportedToastIfSupported();
    } catch (error) {
        console.error('Failed to load 3D scene assets:', error);
        state.modelFailed = true;
        setLoadingState(false, '');
        syncControlAvailability();
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    await fetchPricingData();
    await initI18n();
    await checkAndLoadSharedDesign();
    initConfiguratorUI();
    await bootstrap();
    handleResize();
});
