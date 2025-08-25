import { getRootDocument } from './template-loader.js'
const document = getRootDocument(import.meta)
const container = document.querySelector('.color-picker.container');

const findElement = (selector) => container.querySelector(selector)
const hueInput = findElement('.hue');
const svCanvas = findElement('canvas');
const svHandle = findElement('.sv-handle');
const preview = findElement('.preview');
const hexInput = findElement('.hex');
const svPicker = findElement('.sv-picker');

// HSV to RGB
function hsvToRgb(h, s, v) {
    h = h / 360;
    s = s / 100;
    v = v / 100;
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

// RGB to HSV
function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const v = max;
    let s = max === 0 ? 0 : d / max;
    let h;
    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return {
        h: h * 360,
        s: s * 100,
        v: v * 100
    };
}

// RGB to Hex
function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

// Dispatch custom color change event
function dispatchColorChange(rgb, hex) {
    const event = new CustomEvent('colorchange', {
        detail: {
            rgb: rgb,
            hex: hex
        },
        bubbles: true,
        cancelable: true
    });
    container.dispatchEvent(event);
}

// Draw SV canvas based on hue
function drawSV() {
    const hue = parseInt(hueInput.value);
    const ctx = svCanvas.getContext('2d');
    const width = svCanvas.width;
    const height = svCanvas.height;
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            const s = (x / width) * 100;
            const v = 100 - (y / height) * 100;
            const { r, g, b } = hsvToRgb(hue, s, v);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
}

// Update color preview and hex
function updateColor(noColor, previewOnly) {
    if (noColor) {
        preview.classList.add('no-color')
        preview.style.background = null
        if (!previewOnly) dispatchColorChange(null, null)
        return
    }

    const hue = parseInt(hueInput.value);
    const left = parseFloat(svHandle.style.left);
    const top = parseFloat(svHandle.style.top);
    const width = svCanvas.width;
    const height = svCanvas.height;
    const s = (left / width) * 100;
    const v = 100 - (top / height) * 100;

    const { r, g, b } = hsvToRgb(hue, s, v);
    const hex = rgbToHex(r, g, b);

    preview.classList.remove('no-color')
    preview.style.background = `rgb(${r},${g},${b})`;
    hexInput.value = hex;

    if (!previewOnly) dispatchColorChange({ r, g, b }, hex);
}

// Update handle position from mouse event
function updateHandleFromEvent(e) {
    const rect = svPicker.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    x = Math.max(0, Math.min(rect.width, x));
    y = Math.max(0, Math.min(rect.height, y));
    svHandle.style.left = `${x}px`;
    svHandle.style.top = `${y}px`;
}

let isDragging = false;

// Event listeners for dragging on SV picker
svPicker.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateHandleFromEvent(e);
    updateColor(false, true);
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        // Updating like this will be too frequent and laggy.
        updateHandleFromEvent(e);
        updateColor(false, true);
    }
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        updateColor(false, false);
    }
    isDragging = false;
});

// Hue change
hueInput.addEventListener('input', () => {
    drawSV();
    updateColor(false, true);
});

// Predefined colors
document.querySelectorAll('.swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        if (swatch.classList.contains('no-color')) {
            updateColor(true, false)
            return
        }

        const backgroundColor = swatch.style.backgroundColor;
        const rgb = backgroundColor.match(/\d+/g).map(Number);
        const { h, s, v } = rgbToHsv(...rgb);
        hueInput.value = Math.round(h);
        drawSV();
        const width = svCanvas.width;
        const height = svCanvas.height;
        svHandle.style.left = `${(s / 100) * width}px`;
        svHandle.style.top = `${((100 - v) / 100) * height}px`;
        updateColor(false, false);
    });
});

// Initialize
drawSV();
svHandle.style.left = '200px';
svHandle.style.top = '0px';
// updateColor(); The default value is null, so keep it that way.

// Example listener for the custom event
svPicker.addEventListener('colorchange', (e) => {
    console.log('Color changed:', e.detail);
});