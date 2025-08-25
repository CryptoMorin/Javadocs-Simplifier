export function parseCSSColor(colorString) {
    if (!colorString || typeof colorString !== 'string') {
        return null;
    }

    const trimmedColor = colorString.trim();

    try {
        // Use CSSColorValue to parse the color (modern API)
        const color = CSSColorValue.parse(trimmedColor);

        // Convert to RGBA
        if (color instanceof CSSRGBColor || color instanceof CSSColorValue) {
            const { r, g, b, alpha } = color.to('srgb');
            return {
                r: Math.round(r * 255), // Normalize to 0-255
                g: Math.round(g * 255),
                b: Math.round(b * 255),
                a: Number(alpha.toFixed(2)) // Normalize to 0-1, 2 decimal places
            };
        }
    } catch (e) {
        console.warn("Failed to parse color", colorString, "using CSSColorValue API:", e)

        // Fallback for cases where CSSColorValue is not supported or color is invalid
        return parseFallbackColor(trimmedColor);
    }

    return null;
}

// Fallback parser for older browsers or unsupported formats
function parseFallbackColor(colorString) {
    // Helper to clamp values
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // There are a fuckton of them... this is just here for demonstration.
    const namedColors = {
        'red': [255, 0, 0, 1],
        'blue': [0, 0, 255, 1],
        'green': [0, 128, 0, 1],
        'white': [255, 255, 255, 1],
        'black': [0, 0, 0, 1],
        'transparent': [0, 0, 0, 0]
    };

    // Check for named colors
    if (namedColors[colorString.toLowerCase()]) {
        const [r, g, b, a] = namedColors[colorString.toLowerCase()];
        return { r, g, b, a };
    }

    // Regular expressions for different color formats
    const hex3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
    const hex6 = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;
    const rgb = /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/;
    const rgba = /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*([0-1]?\.?\d*)\)$/;
    const hsl = /^hsl\((\d{1,3}),\s*(\d{1,3})%,\s*(\d{1,3})%\)$/;
    const hsla = /^hsla\((\d{1,3}),\s*(\d{1,3})%,\s*(\d{1,3})%,\s*([0-1]?\.?\d*)\)$/;
    const hwb = /^hwb\((\d{1,3}),\s*(\d{1,3})%,\s*(\d{1,3})%(?:,\s*([0-1]?\.?\d*))?\)$/;
    const lab = /^lab\((-?\d*\.?\d+),\s*(-?\d*\.?\d+),\s*(-?\d*\.?\d+)(?:,\s*([0-1]?\.?\d*))?\)$/;
    const lch = /^lch\((-?\d*\.?\d+),\s*(-?\d*\.?\d+),\s*(-?\d*\.?\d+)(?:,\s*([0-1]?\.?\d*))?\)$/;

    // Hex color (#RGB or #RRGGBB)
    let match;
    if ((match = colorString.match(hex3))) {
        const r = parseInt(match[1] + match[1], 16);
        const g = parseInt(match[2] + match[2], 16);
        const b = parseInt(match[3] + match[3], 16);
        return { r, g, b, a: 1 };
    } else if ((match = colorString.match(hex6))) {
        const r = parseInt(match[1], 16);
        const g = parseInt(match[2], 16);
        const b = parseInt(match[3], 16);
        return { r, g, b, a: 1 };
    }

    // RGB color
    if ((match = colorString.match(rgb))) {
        const r = clamp(parseInt(match[1]), 0, 255);
        const g = clamp(parseInt(match[2]), 0, 255);
        const b = clamp(parseInt(match[3]), 0, 255);
        return { r, g, b, a: 1 };
    }

    // RGBA color
    if ((match = colorString.match(rgba))) {
        const r = clamp(parseInt(match[1]), 0, 255);
        const g = clamp(parseInt(match[2]), 0, 255);
        const b = clamp(parseInt(match[3]), 0, 255);
        const a = clamp(parseFloat(match[4]), 0, 1);
        return { r, g, b, a: Number(a.toFixed(2)) };
    }

    // HSL color
    if ((match = colorString.match(hsl))) {
        const h = parseInt(match[1]) % 360;
        const s = clamp(parseInt(match[2]), 0, 100) / 100;
        const l = clamp(parseInt(match[3]), 0, 100) / 100;
        const rgb = hslToRgb(h, s, l);
        return { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 };
    }

    // HSLA color
    if ((match = colorString.match(hsla))) {
        const h = parseInt(match[1]) % 360;
        const s = clamp(parseInt(match[2]), 0, 100) / 100;
        const l = clamp(parseInt(match[3]), 0, 100) / 100;
        const a = clamp(parseFloat(match[4]), 0, 1);
        const rgb = hslToRgb(h, s, l);
        return { r: rgb[0], g: rgb[1], b: rgb[2], a: Number(a.toFixed(2)) };
    }

    return null;
}

// Helper function to convert HSL to RGB
function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) {
        r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
        r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
        r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
        r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
        r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
        r = c; g = 0; b = x;
    }

    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

