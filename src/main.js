/**
 * Main Application Bootstrap
 * 3D Flag Configurator
 */

import { fetchPricingData } from './state/pricing.js';
import { initI18n } from './ui/preferences.js';
import { checkAndLoadSharedDesign, loadedSharedDesign, sharedDesignPromise } from './state/urlParams.js';
import {
    initConfiguratorUI,
    bindUIEvents,
    handleResize,
    setLoadingState,
    syncControlAvailability
} from './ui/uiController.js';
import { initGraphicManager } from './graphics/graphicManager.js';
import { bindGizmoControls } from './graphics/gizmo.js';
import { initializePocketColorPicker, warmupPocketColorPickr } from './ui/colorPicker.js';
import { renderer, scene } from './core/scene.js';
import { initCameraControls, setActiveCameraView, camera } from './core/camera.js';
import {
    startRenderLoop,
    syncPlayPauseButton,
    startPostGuideTimers
} from './core/renderLoop.js';
import { initializeARSupport, syncARVisibility } from './features/arManager.js';
import { loadEnvironment } from './core/environment.js';
import { loadFlagModels, modelRoot, applyConfigurationToScene } from './models/flagModel.js';
import { initNavCoachingGuide } from './ui/navGuide.js';
import { state, configState } from './state/configState.js';
import { sideConfigs, syncSideUi } from './graphics/graphicConfig.js';
import { showToast } from './ui/toast.js';

if (typeof window !== 'undefined') {
    window.flagConfigurator = {
        state,
        configState,
        sideConfigs,
        syncControlAvailability,
        syncSideUi
    };
}

/**
 * Initializes controls, listeners, 3D assets, and starts rendering.
 */
async function bootstrap() {
    setLoadingState(true, 'toasts.loading_3d');
    initCameraControls();
    handleResize();
    initGraphicManager();
    bindGizmoControls();
    bindUIEvents();
    initializePocketColorPicker();
    syncControlAvailability();
    setActiveCameraView('home');
    syncPlayPauseButton();

    initializeARSupport();

    try {
        await Promise.all([
            loadEnvironment(),
            loadFlagModels()
        ]);

        let sharedDesignLoadedToastPromise = null;
        if (loadedSharedDesign && sharedDesignPromise) {
            const success = await sharedDesignPromise;
            if (success) {
                if (modelRoot) {
                    modelRoot.userData.lastConfigStr = null;
                }
                applyConfigurationToScene(false);
                sharedDesignLoadedToastPromise = () => showToast('Shared design loaded', 'The shared custom flag design was loaded successfully.', 'success');
            }
        }

        renderer.render(scene, camera);
        startRenderLoop();

        state.ready = true;
        await setLoadingState(false, '');
        syncControlAvailability();

        initNavCoachingGuide();
        syncARVisibility();

        const guideOverlay = document.getElementById('nav-coaching-overlay');
        const isGuideActiveOrPending = guideOverlay && !guideOverlay.hasAttribute('hidden');
        if (!isGuideActiveOrPending) {
            startPostGuideTimers();
        }

        warmupPocketColorPickr(2500);

        if (sharedDesignLoadedToastPromise) {
            sharedDesignLoadedToastPromise();
        }
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
    bootstrap();
    handleResize();
});
