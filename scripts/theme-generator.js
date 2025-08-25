export class ThemeGenerator {
    static createAnimationDisableCSS() {
        const css = `/* ThemeGenerator */
        * {
            -webkit-transition: none !important;
            -moz-transition: none !important;
            -o-transition: none !important;
            transition: none !important;
        }`;

        const cssBlob = new Blob([css], { type: 'text/css' });
        return URL.createObjectURL(cssBlob);
    }

    static animationDisableCSSURL = this.createAnimationDisableCSS();

    createStylsheet(cssUrl) {
        const link = this.doc.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = cssUrl;
        return link;
    }

    constructor(doc, settings = {}) {
        if (!doc)
            throw new Error("Provided document is null: " + doc)

        this.doc = doc;
        this.windowObject = doc.defaultView;

        // Collect computed styles and generate CSS rules
        this.elements = doc.querySelectorAll('*');
        this.state = 'INIT'
        this.cssRules = [];
        this.processedSelectors = new Set();
        this.styleSheetElement = null;
        this.blob = null;
        this.generatedClassIds = [];
        this.settings = {
            brightness: 1.0, // Lower = darker, higher = brighter (0.5 to 1.5)
            contrast: 2.0, // Higher = more contrast (affects saturation/lightness, 0.5 to 2)
            sepia: 0, // 0 to 1 (0 = no sepia, 1 = full sepia)
            grayscale: 0, // 0 to 1 (0 = full color, 1 = full grayscale)
            mainColor: null, // Main color for backgrounds, borders, etc. (HSL, hex, or null for computed hues)
            darkTheme: false,
            filter: null,
            ignoredHTMLTags: new Set([
                'nosript', 'script', 'link', 'title', 'meta', 'base',
                'iframe', 'head', 'html', 'canvas'
            ]),
            ...settings
        }

        this.elements = Array.from(this.elements).filter(this.standardFilter.bind(this))
    }

    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    standardFilter(element) {
        if (this.settings.ignoredHTMLTags.has(element.tagName.toLowerCase())) return false;

        const filter = this.settings.filter
        if (filter) return filter(element);

        return true;
    }

    generate() {
        this.requireState('INIT')
        this.state = "GENERATING"
        try {
            for (const element of this.elements)
                this.processElement(element)

            // Combine fallback CSS with dynamic rules
            const finalCSS = `/* ThemeGenerator: ${JSON.stringify(this.settings)} */\n` + this.cssRules.join('\n')

            // Create a Blob with the CSS
            const cssBlob = new Blob([finalCSS], { type: 'text/css' });
            const cssUrl = URL.createObjectURL(cssBlob);
            this.blob = cssUrl;

            // Create link element for Blob URL
            const link = this.createStylsheet(cssUrl)
            this.styleSheetElement = link

            // Clean up Blob URL
            // link.onload = () => URL.revokeObjectURL(cssUrl);
            link.onerror = () => {
                URL.revokeObjectURL(cssUrl);
                console.error('Failed to load CSS Blob in', this.windowObject);
            };

            this.doc.head.appendChild(link);
            this.state = 'GENERATED'
            return cssUrl
        } catch (e) {
            console.error('Error applying dynamic theme to:', e);
            this.state = 'ERROR'
        }
    }

    requireState(state) {
        if (this.state !== state) {
            throw new Error(`Invalid state: expected ${state}, but got ${this.state}`)
        }
    }

    disableAnimations() {
        // We need this because getComputedStyle() takes transitions into account.
        // However it doesn't fucking work.
        const tempAnimRemove = this.createStylsheet(ThemeGenerator.animationDisableCSSURL)
        this.doc.head.appendChild(tempAnimRemove)
        return tempAnimRemove
    }

    enableAnimations(tempAnimRemove) {
        this.doc.head.removeChild(tempAnimRemove)
        tempAnimRemove.remove()
    }

    delete() {
        this.requireState('GENERATED')
        this.state = 'DELETING'

        this.styleSheetElement.parentNode.removeChild(this.styleSheetElement)
        this.styleSheetElement.remove()
        this.styleSheetElement.disabled = true
        this.styleSheetElement = null
        URL.revokeObjectURL(this.blob)

        for (const { element, className } of this.generatedClassIds) {
            element.classList.remove(className)

            // Browser keeps attribute as `class=""`
            if (element.classList.length == 0)
                element.removeAttribute('class');
        }

        this.state = 'DELETED'
    }

    processElement(element) {
        const selector = this.getElementSelector(element);
        if (this.processedSelectors.has(selector)) return; // Avoid duplicate rules
        this.processedSelectors.add(selector);

        // const temp = this.doc.createElement('div')
        // temp.style = element.style
        // temp.style.setProperty("-webkit-transition", "none", "important");
        // temp.style.setProperty("-moz-transition", "none", "important");
        // temp.style.setProperty("-o-transition", "none", "important");
        // temp.style.setProperty("transition", "none", "important");
        const style = this.windowObject.getComputedStyle(element);
        const rules = [];

        // Background color
        if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
            const adjustedBg = this.adjustColor(style.backgroundColor, true);
            rules.push(`background-color: ${adjustedBg} !important;`);
        }

        // Text color
        if (style.color && style.color !== 'rgba(0, 0, 0, 0)') {
            const adjustedText = this.adjustColor(style.color, false);
            rules.push(`color: ${adjustedText} !important;`);
        }

        // Border color
        if (style.borderColor && style.borderColor !== 'rgba(0, 0, 0, 0)') {
            const adjustedBorder = this.adjustColor(style.borderColor, true);
            rules.push(`border-color: ${adjustedBorder} !important;`);
        }

        // Outline color
        if (style.outlineColor && style.outlineColor !== 'rgba(0, 0, 0, 0)') {
            const adjustedOutline = this.adjustColor(style.outlineColor, true);
            rules.push(`outline-color: ${adjustedOutline} !important;`);
        }

        // Background image (for gradients)
        if (style.backgroundImage && style.backgroundImage.includes('gradient')) {
            const adjustedGradient = this.adjustGradient(style.backgroundImage);
            rules.push(`background-image: ${adjustedGradient} !important;`);
        }

        // Box shadow
        if (style.boxShadow && style.boxShadow !== 'none') {
            const adjustedShadow = this.adjustBoxShadow(style.boxShadow);
            rules.push(`box-shadow: ${adjustedShadow} !important;`);
        }

        if (rules.length > 0) {
            this.cssRules.push(`${selector} { ${rules.join(' ')} }`);
        }
    }

    // Function to adjust color with settings
    adjustColor(cssColor, isBackground) {
        const match = cssColor.match(/\d+/g);
        if (!match) {
            return isBackground ? 'hsl(0, 0%, 8%)' : 'hsl(0, 0%, 90%)';
        }

        const [r, g, b] = match.map(Number);
        let [h, s, l] = this.rgbToHsl(r, g, b);
        const oh = h, os = s, ol = l;
        const settings = this.settings;

        if (!settings.darkTheme) {
            if (settings.mainColor) {
                if (isBackground) {
                    const [mH, mS, mL] = this.parseMainColor(settings.mainColor);
                    h = mH
                    s = (s + mS) / 2
                    // if (l > 5 && l < 95) {
                    //     if (l == mL) l = l;
                    //     if (l < mL) l += 10
                    //     else l -= 10
                    // }
                }
            }
        } else {
            // Apply sepia (shift hue towards sepia tone, ~30-40 degrees)
            if (settings.sepia) h = (1 - settings.sepia) * h + settings.sepia * 40;
            // Apply grayscale (reduce saturation)
            if (settings.grayscale) s = s * (1 - settings.grayscale);
            // Apply contrast (scale saturation and lightness difference)
            if (settings.contrast) s = Math.min(100, s * settings.contrast);
            if (settings.brightness) l = l * settings.brightness;

            if (isBackground) {
                // Apply mainColor hue for backgrounds, borders, etc., unless null
                if (settings.mainColor) {
                    const [mH, mS] = this.parseMainColor(settings.mainColor);

                    if (settings.sepia) h = (1 - settings.sepia) * mH + (settings.sepia * 40);
                    else h = mH

                    s = (s + mS) / 2
                }
                // Check if background is already dark (lightness < 20%)
                l = 100 - (l * settings.brightness)
                // if (ol < 20) {
                //     // Brighten dark backgrounds (target 20-30% lightness)
                //     l = Math.min(30, l * 1.5 * settings.brightness + 10);
                // } else {
                //     // Darken lighter backgrounds (target 5-10% lightness)
                //     l = Math.max(5, Math.min(10, l * 0.3 * settings.brightness));
                // }
            } else {
                // Lighten text (target 85-95% lightness, no mainColor)
                // l = Math.min(95, l * 1.2 * settings.brightness + 25);
                l = 100 - l
            }
        }

        return this.hslToCss(h, s, l);
    }

    // Function to convert HSL to CSS color string
    hslToCss(h, s, l) {
        return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
    }

    // Function to convert RGB to HSL
    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h * 360, s * 100, l * 100];
    }

    // Function to parse mainColor to HSL
    parseMainColor(color) {
        if (!color) return [0, 0, 8]; // Default to grayscale dark for null
        if (color.startsWith('hsl')) {
            const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        } else if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16);
            const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16);
            const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16);
            return this.rgbToHsl(r, g, b);
        }
        return [0, 0, 8]; // Fallback to grayscale dark
    }

    // Function to parse and adjust gradient colors
    adjustGradient(gradient) {
        return gradient.replace(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+)?\)/g, color => {
            return this.adjustColor(color, true); // Treat gradient colors as backgrounds
        });
    }

    // Function to adjust box-shadow color
    adjustBoxShadow(shadow) {
        const parts = shadow.split(/(\brgba?\([^)]+\))/);
        return parts.map(part => {
            if (part.match(/rgba?\(/)) {
                return this.adjustColor(part, true); // Treat shadow colors as backgrounds
            }
            return part;
        }).join('');
    }

    // Generate unique selector for an element
    getElementSelector(element) {
        if (element.id) return `#${element.id}`;
        if (element.className) {
            const classes = Array.from(element.classList).join('.');
            return `.${classes.replace(/\s+/g, '.')}`;
        }

        const randId = Math.floor(Math.random() * 1000000000);
        const className = 'JavaDocs_' + randId
        element.classList.add(className)
        this.generatedClassIds.push({ element, className });

        return element.tagName.toLowerCase() + '.' + className;
    }
}