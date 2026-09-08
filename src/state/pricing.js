import { configState } from './configState.js';
import { getCurrencySymbol } from '../ui/preferences.js';

let pricingData = null;

/**
 * Loads the pricing matrix from static assets.
 * @returns {Promise<Object>}
 */
export async function fetchPricingData() {
    if (pricingData) return pricingData;
    try {
        const response = await fetch('assets/prices.json');
        pricingData = await response.json();
    } catch (e) {
        console.error('Failed to load pricing data', e);
    }
    return pricingData;
}

/**
 * Returns cached pricing data.
 * @returns {Object|null}
 */
export function getPricingData() {
    return pricingData;
}

/**
 * Recalculates tier pricing based on active configuration and updates UI cards and total.
 */
export function updateDynamicPrices() {
    if (!pricingData) return;

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

    let sizePrice = 0;
    let printingAddon = 0;
    let poleAddon = 0;
    let basePrice = 0;

    const flagOnlyTier = pricingData.pricingTiers.flagOnly.find(item => item.size === sizeKey);
    const hwTier = pricingData.pricingTiers.completeWithHardware.find(item => item.size === sizeKey);

    if (flagOnlyTier) {
        sizePrice = flagOnlyTier.singleSided;
        printingAddon = flagOnlyTier[printKey] - flagOnlyTier.singleSided;
    }

    if (configState.pole === 'With Pole') {
        if (hwTier && flagOnlyTier) {
            poleAddon = hwTier[printKey] - flagOnlyTier[printKey];
        }
    }

    if (configState.base !== 'No base') {
        const mappedBase = baseMapping[configState.base] || configState.base;
        if (mappedBase && pricingData.pricingTiers.bases[mappedBase]) {
            basePrice = pricingData.pricingTiers.bases[mappedBase];
        }
    }

    // Update configuration card prices in the DOM
    const cards = document.querySelectorAll('.config-card');
    cards.forEach(card => {
        const category = card.dataset.category;
        const value = card.dataset.value;
        let cardPrice = 0;

        if (category === 'size') {
            const cardSizeKey = sizeMapping[value] || value.split(' ').pop();
            const cardTier = pricingData.pricingTiers.flagOnly.find(item => item.size === cardSizeKey);
            if (cardTier) cardPrice = cardTier.singleSided;
        } else if (category === 'printing') {
            const cardPrintKey = printingMapping[value] || 'singleSided';
            if (flagOnlyTier) {
                cardPrice = flagOnlyTier[cardPrintKey] - flagOnlyTier.singleSided;
            }
        } else if (category === 'pole') {
            if (value === 'With Pole' && hwTier && flagOnlyTier) {
                cardPrice = hwTier[printKey] - flagOnlyTier[printKey];
            } else {
                cardPrice = 0;
            }
        } else if (category === 'base') {
            if (value === 'No base') {
                cardPrice = 0;
            } else {
                const cardMappedBase = baseMapping[value] || value;
                if (cardMappedBase && pricingData.pricingTiers.bases[cardMappedBase]) {
                    cardPrice = pricingData.pricingTiers.bases[cardMappedBase];
                }
            }
        }

        if (['size', 'printing', 'pole', 'base'].includes(category)) {
            const currencySymbol = getCurrencySymbol();
            const formattedPrice = `${currencySymbol} ${cardPrice.toFixed(2)}`.trim();
            card.dataset.price = formattedPrice;

            if (card.classList.contains('is-active')) {
                const section = card.closest('.config-section');
                if (section) {
                    const priceDisplay = section.querySelector('.selection-price');
                    if (priceDisplay) {
                        priceDisplay.textContent = (category !== 'size' && cardPrice > 0) ? `+ ${currencySymbol} ${cardPrice.toFixed(2)}` : formattedPrice;
                    }
                }
            }
        }
    });

    const total = sizePrice + printingAddon + poleAddon + basePrice;
    const totalEl = document.getElementById('total-price-value');
    if (totalEl) {
        const currencySymbol = getCurrencySymbol();
        totalEl.textContent = `${currencySymbol} ${total.toFixed(2)}`.trim();
    }
}
