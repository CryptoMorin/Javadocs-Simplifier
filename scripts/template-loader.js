const templates = new Map()

function getTemplatePath(name) {
    return `../templates/${name}.html`
}

async function loadTemplate(name) {
    const request = await fetch(getTemplatePath(name))
    if (!request.ok) {
        if (request.status === 404) return null
        else throw new Error(`Request failed for template '${name}': ${request.statusText}`)
    }

    const text = await request.text()

    const parser = new DOMParser();
    return parser.parseFromString(text, 'text/html');
}

async function getTemplate0(name) {
    let doc = templates.get(name)
    if (doc) return doc

    const template = await loadTemplate(name)
    if (!template) return null

    doc = new HTMLTemplate(name, template)
    templates.set(name, doc)
    return doc
}

export async function getTemplate(name) {
    const template = getTemplate0(name)
    if (!template) {
        const path = new URL(getTemplatePath(name), document.baseURI).href
        throw new Error(`Unknown template: ${name}, at ${window.location.href}/${document.baseURI} -> ${path}`)
    }
    return template
}

export function getRootDocument(importMeta) {
    const url = new URL(importMeta.url);
    const uniqueId = url.searchParams.get('id');
    if (!uniqueId) return document

    const shadowRoot = window.__shadowRoots?.[uniqueId];
    if (!shadowRoot)
        throw new Error(`Shadow root with id ${uniqueId} not found`)

    return shadowRoot
}

// This is required because scripts have internal flags that mark
// scripts as "already started": https://html.spec.whatwg.org/multipage/scripting.html#already-started
function effectivelyCopyScript(scriptElement) {
    const script = document.createElement('script');

    // Attributes like "type=module" and "src=..." are copied.
    [...scriptElement.attributes].forEach(({ name, value }) =>
        script.setAttribute(name, value)
    );

    script.innerHTML = scriptElement.innerHTML
    return script;
}

export class HTMLTemplate {
    constructor(name, doc) {
        this.name = name;
        this.doc = doc;

        if (!doc) {
            throw new Error("Template document is invalid: " + doc);
        }
    }

    addTo(node, bodyAdder = (element) => node.appendChild(element)) {
        if (!(node instanceof Node))
            throw new Error(node + " is not a node")

        let destinationHead;
        const destinationBody = node;
        let scriptSrcParam = '';

        if (node instanceof ShadowRoot) {
            // In the old days, styles weren't supported in shadow roots, you had to use:
            // <style> @import "css/style.css"; </style>
            // But now links are supported.
            destinationHead = node

            const uniqueId = Math.random().toString(36).slice(2).toString()
            window.__shadowRoots = window.__shadowRoots || {};
            window.__shadowRoots[uniqueId] = node;
            scriptSrcParam = "?id=" + uniqueId;
        } else {
            destinationHead = node.ownerDocument.head
        }

        this.doc.head.childNodes.forEach(x => {
            if (x instanceof HTMLScriptElement) {
                const script = effectivelyCopyScript(x)
                script.src += scriptSrcParam
                destinationHead.appendChild(script)
                return;
            }
            destinationHead.appendChild(x.cloneNode(true))
        })

        this.doc.body.childNodes.forEach(x => {
            let finalElement = x;

            if (finalElement instanceof HTMLScriptElement) {
                const script = effectivelyCopyScript(finalElement)
                if (script.src) script.src += scriptSrcParam
                finalElement = script
            } else if (finalElement instanceof HTMLElement) {
                finalElement = finalElement.cloneNode(true);
                const allScripts = finalElement.querySelectorAll('script')
                for (const script of allScripts) {
                    const newScript = effectivelyCopyScript(script)
                    if (script.src) newScript.src += scriptSrcParam
                    script.replaceWith(newScript)
                }
            } else {
                finalElement = finalElement.cloneNode(true);
            }

            bodyAdder(finalElement)
        })
    }
}

/**
 * Waits until the given predicate returns a truthy value. Calls and awaits the predicate
 * function at the given interval time. Can be used to poll until a certain condition is true.
 *
 * @example
 * ```js
 * import { fixture, waitUntil } from '@open-wc/testing-helpers';
 *
 * const element = await fixture(html`<my-element></my-element>`);
 *
 * await waitUntil(() => element.someAsyncProperty, 'element should become ready');
 * ```
 * 
 * From: https://open-wc.org/docs/testing/helpers/#waituntil
 *
 * @param {() => unknown | Promise<unknown>} predicate - predicate function which is called each poll interval.
 *   The predicate is awaited, so it can return a promise.
 * @param {string} [message] an optional message to display when the condition timed out
 * @param {{ interval?: number, timeout?: number }} [options] timeout and polling interval
 */
export function waitUntil(predicate, message, options = {}) {
    const { interval = 50, timeout = 1000 } = options;

    // Save the current stack so that we can reference it later if we timeout.
    const { stack } = new Error();

    return new Promise((resolve, reject) => {
        let timeoutId;

        setTimeout(() => {
            clearTimeout(timeoutId);

            const error = new Error(
                message ? `Timeout: ${message}` : `waitUntil timed out after ${timeout}ms`,
            );
            error.stack = stack;

            reject(error);
        }, timeout);

        async function nextInterval() {
            try {
                const value = await predicate()
                if (value) {
                    resolve(value);
                } else {
                    timeoutId = setTimeout(() => {
                        nextInterval();
                    }, interval);
                }
            } catch (error) {
                reject(error);
            }
        }
        nextInterval();
    });
}

// Note: Using self-closing tags will not work, and other elements
// will be caught in the shadow root, so avoid it.
// Correct: <template-anchor template="..."></template-anchor>
// Incorrect: <template-anchor template="..." />
class TemplateAnchorHTMLElement extends HTMLElement {
    static get observedAttributes() {
        return ['template'];
    }

    _connected = false;

    // Called when the element is added to the DOM
    connectedCallback() {
        this.loadTemplate();
        this._connected = true
    }

    // Called when the `template` attribute changes
    attributeChangedCallback(name, oldValue, newValue) {
        if (!this._connected) return // called once before connectedCallback()
        if (name === 'template' && oldValue !== newValue) {
            this.loadTemplate();
        }
    }

    get templatePath() {
        return this.getAttribute('template')
    }

    get isInline() {
        return this.hasAttribute('inline')
    }

    // Load and render the template
    async loadTemplate() {
        let targetDoc;

        if (this.isInline) {
            targetDoc = this
            this.style.position = 'absolute'
        } else {
            // Create a shadow DOM to encapsulate the template content
            this.attachShadow({ mode: 'open' });
            targetDoc = this.shadowRoot
        }

        targetDoc.innerHTML = ''
        const templatePath = this.templatePath;
        if (!templatePath) {
            targetDoc.innerHTML = '<p>Error: No template specified</p>';
            return;
        }

        try {
            const loadedTemplate = await getTemplate0(templatePath)
            if (!loadedTemplate) {
                targetDoc.innerHTML = `<p>Unknown template: ${templatePath}</p>`;
                return;
            }

            // Insert the template content into the shadow DOM
            if (this.isInline) {
                loadedTemplate.addTo(targetDoc, (element => targetDoc.after(element)));
                this.remove()
            } else {
                loadedTemplate.addTo(targetDoc);
            }
        } catch (error) {
            console.error(error);
            targetDoc.innerHTML = `<p>Error loading template '${templatePath}':" ${error}</p>`;
        }
    }
}

// Prevent double registration due to transitive dependencies?
if (!customElements.get('template-anchor')) {
    customElements.define('template-anchor', TemplateAnchorHTMLElement)
}