import i18next from 'i18next';
import { dom } from './domElements.js';
import { formatSelectionName } from '../utils/helpers.js';
import { eventBus } from '../state/eventBus.js';

if (typeof window !== 'undefined' && !window.i18next) {
    window.i18next = i18next;
}

export let currentLanguage = localStorage.getItem('pref-language') || 'en';
export let currentCurrency = localStorage.getItem('pref-currency') || 'USD';

/**
 * Returns the currency symbol for the active currency code.
 * @returns {'$'|'€'}
 */
export function getCurrencySymbol() {
    return currentCurrency === 'EUR' ? '€' : '$';
}

/**
 * Synchronizes the top-right preferences dropdown UI with active language and currency.
 */
export function syncPreferenceMenuUi() {
    if (dom.prefBtnText) {
        const displayLang = currentLanguage.toUpperCase();
        const displaySymbol = getCurrencySymbol();
        dom.prefBtnText.textContent = `${displayLang} | ${displaySymbol}`;
    }

    if (dom.prefLangList) {
        const items = dom.prefLangList.querySelectorAll('.pref-menu-item');
        items.forEach(item => {
            const isActive = item.dataset.value === currentLanguage;
            item.classList.toggle('is-active', isActive);
        });
    }

    if (dom.prefCurrencyList) {
        const items = dom.prefCurrencyList.querySelectorAll('.pref-menu-item');
        items.forEach(item => {
            const isActive = item.dataset.value === currentCurrency;
            item.classList.toggle('is-active', isActive);
        });
    }
}

/**
 * Opens or closes the preferences dropdown.
 * @param {boolean} open
 */
export function setPreferenceDropdownOpen(open) {
    if (!dom.prefDropdown || !dom.prefBtn) return;
    dom.prefDropdown.classList.toggle('is-open', open);
    dom.prefBtn.setAttribute('aria-expanded', String(open));
}

/**
 * Initializes i18next with en and nl JSON dictionary resources.
 */
export async function initI18n() {
    try {
        const [enRes, nlRes] = await Promise.all([
            fetch('assets/locales/en.json'),
            fetch('assets/locales/nl.json')
        ]);
        const enTranslations = await enRes.json();
        const nlTranslations = await nlRes.json();

        await window.i18next.init({
            lng: currentLanguage,
            fallbackLng: 'en',
            resources: {
                en: { translation: enTranslations },
                nl: { translation: nlTranslations }
            }
        });

        syncPreferenceMenuUi();
        updateContentWithTranslations();
    } catch (error) {
        console.error('Failed to initialize i18next:', error);
    }
}

/**
 * Updates all DOM elements bearing data-i18n attributes with translated text.
 */
export function updateContentWithTranslations() {
    if (!window.i18next || !window.i18next.isInitialized) return;

    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const attrVal = el.getAttribute('data-i18n');
        if (!attrVal) return;

        const parts = attrVal.split(';');
        parts.forEach(part => {
            const match = part.trim().match(/^(?:\[([^\]]+)\])?(.*)$/);
            if (!match) return;

            const attrName = match[1];
            const key = match[2];
            const translation = window.i18next.t(key);

            if (attrName) {
                el.setAttribute(attrName, translation);
            } else {
                el.textContent = translation;
            }
        });
    });

    const sections = document.querySelectorAll('.config-section');
    sections.forEach(section => {
        const activeCard = section.querySelector('.config-card.is-active');
        const nameDisplay = section.querySelector('.selection-name');
        if (activeCard && nameDisplay) {
            const category = activeCard.dataset.category;
            const value = activeCard.dataset.value;
            if (category && value) {
                nameDisplay.textContent = formatSelectionName(category, value);
            }
        }
    });

    eventBus.emit('i18n:updated');
}

/**
 * Sets the active language and updates translations across the app.
 * @param {'en'|'nl'} lang
 */
export function setLanguage(lang) {
    if (lang === currentLanguage) return;
    currentLanguage = lang;
    localStorage.setItem('pref-language', lang);
    if (window.i18next && window.i18next.changeLanguage) {
        window.i18next.changeLanguage(lang, () => {
            syncPreferenceMenuUi();
            updateContentWithTranslations();
            eventBus.emit('preference:changed', { language: currentLanguage, currency: currentCurrency });
        });
    }
}

/**
 * Sets the active currency and updates pricing across the app.
 * @param {'USD'|'EUR'} currency
 */
export function setCurrency(currency) {
    if (currency === currentCurrency) return;
    currentCurrency = currency;
    localStorage.setItem('pref-currency', currency);
    syncPreferenceMenuUi();
    eventBus.emit('preference:changed', { language: currentLanguage, currency: currentCurrency });
}
