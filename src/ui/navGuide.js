import * as THREE from 'three';
import { camera, controls } from '../core/camera.js';
import { focusCameraView } from '../core/cameraTransitions.js';
import {
    startPostGuideTimers,
    startInitialAutoRotation,
    stopInitialAutoRotation,
    setAnimationPlaying
} from '../core/renderLoop.js';
import { mobileViewportMediaQuery } from './domElements.js';
import { showToast } from './toast.js';
import { eventBus } from '../state/eventBus.js';

export const navGuideState = {
    active: false,
    currentStep: 0,
    startTarget: new THREE.Vector3(),
    startCameraDistance: 0,
    startAzimuth: 0,
    startPolar: 0,
    hasCompletedCurrentStep: false,
    userInteracting: false,
    gestureStarted: false
};

const svgRotate = `<svg viewBox="0 0 100 100" class="gesture-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M 16 22 Q 41 14, 66 22" class="gesture-trail" />
    <g class="gesture-finger rotate-animation">
        <g transform="scale(1.95)">
            <circle cx="0" cy="0" r="4.5" class="gesture-touch-point" />
            <path d="M -2 18 L -2 2 C -2 0.9, -1.1 0, 0 0 C 1.1 0, 2 0.9, 2 2 L 2 9 C 2.5 8.2, 3.5 7.5, 4.5 7.5 C 5.5 7.5, 6.5 8.2, 6.5 9.5 L 6.5 11 C 7 10.2, 8 9.5, 9 9.5 C 10 9.5, 11 10.2, 11 11.5 L 11 13 C 11.5 12.2, 12.5 11.5, 13.5 11.5 C 14.5 11.5, 15.5 12.2, 15.5 13.5 L 15.5 21 C 15.5 26, 11.5 30, 6.5 30 C 3 30, 0.5 28.5, -0.5 26.5 L -5.5 22.5 C -6.5 21.5, -6.5 20, -5.5 19 C -4.5 18, -3 18, -2 19 L -2 18 Z" class="gesture-hand" />
        </g>
    </g>
</svg>`;

const svgPan = `<svg viewBox="0 0 100 100" class="gesture-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <g class="gesture-finger pan-animation">
        <g transform="scale(1.82)">
            <circle cx="0" cy="0" r="4.5" class="gesture-touch-point" />
            <circle cx="4.25" cy="0" r="4.5" class="gesture-touch-point" />
            <path d="M -2 18 L -2 2 C -2 0.9, -1.1 0, 0 0 C 1.1 0, 2 0.9, 2 2 L 2 9 L 2 2 C 2 0.9, 3.1 0, 4.25 0 C 5.4 0, 6.5 0.9, 6.5 2 L 6.5 11 C 7 10.2, 8 9.5, 9 9.5 C 10 9.5, 11 10.2, 11 11.5 L 11 13 C 11.5 12.2, 12.5 11.5, 13.5 11.5 C 14.5 11.5, 15.5 12.2, 15.5 13.5 L 15.5 21 C 15.5 26, 11.5 30, 6.5 30 C 3 30, 0.5 28.5, -0.5 26.5 L -5.5 22.5 C -6.5 21.5, -6.5 20, -5.5 19 C -4.5 18, -3 18, -2 19 L -2 18 Z" class="gesture-hand" />
        </g>
    </g>
</svg>`;

const svgZoom = `<img src="icons/pinch.svg" class="gesture-svg" alt="Pinch to zoom" aria-hidden="true">`;

const svgDoubleTap = `<svg viewBox="0 0 100 100" class="gesture-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="30" r="12" class="gesture-ripple ripple-1" />
    <circle cx="40" cy="30" r="12" class="gesture-ripple ripple-2" />
    <g class="gesture-finger double-tap-animation">
        <g transform="scale(1.95)">
            <circle cx="0" cy="0" r="4.5" class="gesture-touch-point" />
            <path d="M -2 18 L -2 2 C -2 0.9, -1.1 0, 0 0 C 1.1 0, 2 0.9, 2 2 L 2 9 C 2.5 8.2, 3.5 7.5, 4.5 7.5 C 5.5 7.5, 6.5 8.2, 6.5 9.5 L 6.5 11 C 7 10.2, 8 9.5, 9 9.5 C 10 9.5, 11 10.2, 11 11.5 L 11 13 C 11.5 12.2, 12.5 11.5, 13.5 11.5 C 14.5 11.5, 15.5 12.2, 15.5 13.5 L 15.5 21 C 15.5 26, 11.5 30, 6.5 30 C 3 30, 0.5 28.5, -0.5 26.5 L -5.5 22.5 C -6.5 21.5, -6.5 20, -5.5 19 C -4.5 18, -3 18, -2 19 L -2 18 Z" class="gesture-hand" />
        </g>
    </g>
</svg>`;

/**
 * Initializes the mobile 3D navigation coaching tour.
 */
export function initNavCoachingGuide() {
    const isMobile = mobileViewportMediaQuery.matches;
    const isAlreadyDone = localStorage.getItem('flag_configurator_nav_guide_done') === 'true';
    if (!isMobile || isAlreadyDone) return;

    const overlay = document.getElementById('nav-coaching-overlay');
    if (overlay) overlay.removeAttribute('hidden');

    const uiContainer = document.getElementById('ui-container');
    if (uiContainer) uiContainer.classList.add('is-blurred');

    document.getElementById('nav-guide-start-btn')?.addEventListener('click', () => {
        localStorage.setItem('flag_configurator_nav_guide_done', 'true');
        document.getElementById('nav-coaching-step-welcome')?.setAttribute('hidden', '');
        document.getElementById('nav-coaching-step-guide')?.removeAttribute('hidden');
        document.getElementById('canvas-coaching-overlay')?.removeAttribute('hidden');

        focusCameraView('front');
        stopInitialAutoRotation();
        
        setAnimationPlaying(false);

        navGuideState.active = true;
        startNavGuideStep(1);
    });

    const skipGuide = () => {
        localStorage.setItem('flag_configurator_nav_guide_done', 'true');
        const guideOverlay = document.getElementById('nav-coaching-overlay');
        if (guideOverlay) guideOverlay.setAttribute('hidden', '');
        document.getElementById('canvas-coaching-overlay')?.setAttribute('hidden', '');
        navGuideState.active = false;

        const container = document.getElementById('ui-container');
        if (container) container.classList.remove('is-blurred');

        startPostGuideTimers();
    };

    document.getElementById('nav-guide-skip-btn')?.addEventListener('click', skipGuide);
    document.getElementById('nav-guide-cancel-btn')?.addEventListener('click', skipGuide);

    controls.addEventListener('change', () => {
        if (navGuideState.active && !navGuideState.hasCompletedCurrentStep) {
            checkNavGuideGesture();
        }
    });

    controls.addEventListener('start', () => {
        if (navGuideState.active) {
            navGuideState.userInteracting = true;
            if (!navGuideState.gestureStarted) {
                navGuideState.gestureStarted = true;
                navGuideState.startTarget.copy(controls.target);
                navGuideState.startCameraDistance = camera.position.distanceTo(controls.target);
                navGuideState.startAzimuth = controls.getAzimuthalAngle();
                navGuideState.startPolar = controls.getPolarAngle();
            }
        }
    });

    controls.addEventListener('end', () => {
        if (navGuideState.active) {
            navGuideState.userInteracting = false;
        }
    });

    eventBus.on('camera:doubleTap', () => {
        if (navGuideState.active && navGuideState.currentStep === 4 && !navGuideState.hasCompletedCurrentStep) {
            completeNavGuideStep();
        }
    });
}

function startNavGuideStep(step) {
    navGuideState.currentStep = step;
    navGuideState.hasCompletedCurrentStep = false;
    navGuideState.gestureStarted = false;
    navGuideState.userInteracting = false;
    
    navGuideState.startTarget.copy(controls.target);
    navGuideState.startCameraDistance = camera.position.distanceTo(controls.target);
    navGuideState.startAzimuth = controls.getAzimuthalAngle();
    navGuideState.startPolar = controls.getPolarAngle();

    updateNavGuideUI();
}

function updateNavGuideUI() {
    const step = navGuideState.currentStep;
    const svgContainer = document.getElementById('nav-coaching-svg-container');
    if (svgContainer) {
        if (step === 1) svgContainer.innerHTML = svgRotate;
        else if (step === 2) svgContainer.innerHTML = svgPan;
        else if (step === 3) svgContainer.innerHTML = svgZoom;
        else if (step === 4) svgContainer.innerHTML = svgDoubleTap;
    }

    const t = (key, def) => (window.i18next && window.i18next.isInitialized) ? window.i18next.t(key) : def;

    const stepNumEl = document.getElementById('nav-coaching-step-num');
    if (stepNumEl) {
        stepNumEl.textContent = t('nav_guide.step_of', `Step ${step} of 4`).replace('{{current}}', step).replace('{{total}}', 4);
    }

    const titleEl = document.getElementById('nav-step-title');
    const descEl = document.getElementById('nav-step-desc');

    if (step === 1) {
        if (titleEl) titleEl.textContent = t('nav_guide.rotate_title', 'Rotate the Flag');
        if (descEl) descEl.textContent = t('nav_guide.rotate_desc', 'Drag with one finger on the screen to rotate the 3D view.');
    } else if (step === 2) {
        if (titleEl) titleEl.textContent = t('nav_guide.pan_title', 'Move the View');
        if (descEl) descEl.textContent = t('nav_guide.pan_desc', 'Drag with two fingers to pan and move the flag.');
    } else if (step === 3) {
        if (titleEl) titleEl.textContent = t('nav_guide.zoom_title', 'Pinch to Zoom');
        if (descEl) descEl.textContent = t('nav_guide.zoom_desc', 'Pinch with two fingers inward or outward to zoom the view.');
    } else if (step === 4) {
        if (titleEl) titleEl.textContent = t('nav_guide.double_tap_title', 'Double Tap Zoom');
        if (descEl) descEl.textContent = t('nav_guide.double_tap_desc', 'Double tap on the flag to quickly zoom in or out.');
    }

    document.querySelectorAll('.nav-dot').forEach(dot => {
        const dotStep = parseInt(dot.dataset.step);
        dot.classList.toggle('active', dotStep === step);
    });
}

export function checkNavGuideGesture() {
    if (!navGuideState.active || navGuideState.hasCompletedCurrentStep) return;
    if (!navGuideState.userInteracting) return;

    const step = navGuideState.currentStep;
    if (step === 1) {
        const azimuthDiff = Math.abs(controls.getAzimuthalAngle() - navGuideState.startAzimuth);
        const polarDiff = Math.abs(controls.getPolarAngle() - navGuideState.startPolar);
        if (azimuthDiff > 0.08 || polarDiff > 0.08) {
            completeNavGuideStep();
        }
    } else if (step === 2) {
        const targetDiff = controls.target.distanceTo(navGuideState.startTarget);
        if (targetDiff > 0.08) {
            completeNavGuideStep();
        }
    } else if (step === 3) {
        const distance = camera.position.distanceTo(controls.target);
        const distDiff = Math.abs(distance - navGuideState.startCameraDistance);
        if (distDiff > 0.15) {
            completeNavGuideStep();
        }
    }
}

export function completeNavGuideStep() {
    navGuideState.hasCompletedCurrentStep = true;
    
    setTimeout(() => {
        const successEl = document.getElementById('nav-step-success');
        if (successEl) {
            successEl.removeAttribute('hidden');
            successEl.classList.add('is-visible');
        }

        setTimeout(() => {
            if (successEl) {
                successEl.setAttribute('hidden', '');
                successEl.classList.remove('is-visible');
            }
            
            if (navGuideState.currentStep < 4) {
                startNavGuideStep(navGuideState.currentStep + 1);
            } else {
                const overlay = document.getElementById('nav-coaching-overlay');
                if (overlay) overlay.setAttribute('hidden', '');
                document.getElementById('canvas-coaching-overlay')?.setAttribute('hidden', '');
                navGuideState.active = false;
                
                const uiContainer = document.getElementById('ui-container');
                if (uiContainer) uiContainer.classList.remove('is-blurred');

                focusCameraView('home');
                startInitialAutoRotation();
                setAnimationPlaying(true);

                showToast('Guide Completed', 'You are ready to explore the flag configurator!', 'success');
            }
        }, 1200);
    }, 1000);
}
