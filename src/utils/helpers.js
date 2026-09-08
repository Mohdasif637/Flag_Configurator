/**
 * Dynamically loads an external script and resolves once loaded.
 * 
 * @param {string} src - URL of the script to load.
 * @returns {Promise<void>}
 */
export function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
            if (existingScript.dataset.loaded === 'true') {
                resolve();
            } else {
                existingScript.addEventListener('load', () => resolve());
                existingScript.addEventListener('error', (err) => reject(err));
            }
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.loaded = 'false';
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });
}

/**
 * Truncates long filenames cleanly with an ellipsis in the center while maintaining file extension.
 * 
 * @param {string} fileName - Original file name.
 * @param {HTMLElement} [containerElement] - Element whose container width bounds the string.
 * @returns {string} Truncated string.
 */
export function truncateFileName(fileName, containerElement) {
    if (!fileName) return '';
    if (containerElement) {
        containerElement.title = fileName;
    }
    const extIndex = fileName.lastIndexOf('.');
    const ext = extIndex !== -1 ? fileName.substring(extIndex) : '';
    const name = extIndex !== -1 ? fileName.substring(0, extIndex) : fileName;

    const endChars = 4;
    if (name.length <= endChars + 5) return fileName;
    if (!containerElement) return fileName;

    const canvas = truncateFileName.canvas || (truncateFileName.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    const computedStyle = window.getComputedStyle(containerElement);
    context.font = `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;

    const availableWidth = Math.max(0, containerElement.clientWidth - 24);

    if (context.measureText(fileName).width <= availableWidth) {
        return fileName;
    }

    const endText = `.......${name.substring(name.length - endChars)}${ext}`;
    const endWidth = context.measureText(endText).width;

    let startText = name.substring(0, name.length - endChars);
    while (startText.length > 0 && (context.measureText(startText).width + endWidth > availableWidth)) {
        startText = startText.substring(0, startText.length - 1);
    }

    return `${startText}${endText}`;
}

/**
 * Formats the human-readable selection label for a configuration card.
 * 
 * @param {string} category - Configuration category (size, printing, pole, etc.).
 * @param {string} value - Selection option value.
 * @returns {string} Formatted label with dimensions if size.
 */
export function formatSelectionName(category, value) {
    let displayName = value;
    if (window.i18next && window.i18next.isInitialized) {
        const key = `selections.${category}.${value}`;
        if (window.i18next.exists(key)) {
            displayName = window.i18next.t(key);
        }
    }
    if (category === 'size') {
        const sizeDimensions = {
            'Feather Flag Convex XS': '60x180cm',
            'Feather Flag Convex S': '60x240cm',
            'Feather Flag Convex M': '70x330cm',
            'Feather Flag Convex M-Extra Wide': '90x300cm',
            'Feather Flag Convex L': '75x380cm'
        };
        const dim = sizeDimensions[value];
        if (dim) {
            return `${displayName} - ${dim}`;
        }
    }
    return displayName;
}

/**
 * Creates a debounced version of a function.
 * 
 * @param {Function} fn - Function to debounce.
 * @param {number} delay - Delay in milliseconds.
 * @returns {Function}
 */
export function debounce(fn, delay = 200) {
    let timerId = null;
    return (...args) => {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn(...args), delay);
    };
}
