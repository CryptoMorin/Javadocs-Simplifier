import { corsFetch } from './corsfetch.js';
import { ThemeGenerator } from "./theme-generator.js";
import { getTemplate } from "./template-loader.js";
import "./zip-full.min.js";

const headerTemplate = await getTemplate('header')

const JAVADOCS_NAMESPACE = "JavaDocs"
function getJavaDocsObject(object) {
    let javadocs = object[JAVADOCS_NAMESPACE]
    if (!javadocs) {
        javadocs = {}
        object[JAVADOCS_NAMESPACE] = javadocs
    }
    return javadocs
}

function iframeURLChange(iframe, callback) {
    var unloadHandler = function () {
        // Timeout needed because the URL changes immediately after
        // the `unload` event is dispatched.
        setTimeout(function () {
            callback(iframe.contentWindow.location.href);
        }, 0);
    };

    function attachUnload() {
        // Remove the unloadHandler in case it was already attached.
        // Otherwise, the change will be dispatched twice.
        iframe.contentWindow.removeEventListener("unload", unloadHandler);
        iframe.contentWindow.addEventListener("unload", unloadHandler);
    }

    iframe.addEventListener("load", attachUnload);
    attachUnload();
}

function injectDynamicScriptInterceptor(actualURLOrigin) {
    // Monkey-patch createElement
    const code = `
        const doc = document;
        const javadocs = window.${JAVADOCS_NAMESPACE}
        const javadocsLoader = javadocs.loaderInstance
        const actualURLOrigin = "${actualURLOrigin}"

        // TODO - There's no way for us to redirect "window.location.href" calls

        async function processSource(element, value) {
            const resolved = javadocsLoader._resolvePath(actualURLOrigin, value);
            if (!javadocsLoader.isJarMode) await javadocsLoader._digestAsset(resolved)
            const blobUrl = javadocsLoader._finalUrlFor(resolved);
            if (blobUrl) value = blobUrl;
            return value
        }

        const origCreateElement = doc.createElement.bind(doc);
        doc.createElement = function (tagName, ...args) {
        const el = origCreateElement(tagName, ...args);

        if (tagName.toLowerCase() === "script") {
            const origSetAttribute = el.setAttribute.bind(el);

            Object.defineProperty(el, 'src', {
                get: () => el.getAttribute("src"),
                set: function(value) {
                    processSource(el, value).then(val => {
                        origSetAttribute("src", val)
                    })
                },
                enumerable: true, // Makes the property appear during enumeration
                configurable: true // Allows the property to be redefined or deleted
            });

            el.setAttribute = function (name, value) {
                if (name.toLowerCase() === "src") {
                    processSource(el, value).then(val => {
                        origSetAttribute(name, val);
                    })
                } else {
                    return origSetAttribute(name, value);
                }
            };
        }

        return el;
    };
    `
    return code;



    // Set up a MutationObserver to catch scripts added via innerHTML, appendChild, etc.
    // const observer = new doc.defaultView.MutationObserver((mutations) => {
    //     for (const mut of mutations) {
    //         console.log("called mutation obs", mut)
    //         for (const node of mut.addedNodes) {
    //             if (node.tagName && node.tagName.toLowerCase() === "script" && node.src) {
    //                 const resolved = loaderInstance._resolvePath(doc.location.href, node.getAttribute("src"));
    //                 const blobUrl = loaderInstance._finalUrlFor(resolved);
    //                 if (blobUrl) node.src = blobUrl;
    //             }
    //         }
    //     }
    // });

    // observer.observe(doc.documentElement, { childList: true, subtree: true });
}

export class JavaDocsLoadError extends Error {
    constructor(isValidJavadocs, message) {
        super(message);
        this.isValidJavadocs = isValidJavadocs;
        this.name = "JavaDocsLoadError";
    }
}

export class JavadocsLoader {
    indexHTML = null
    isJarMode = null

    constructor({ blockExternal = false } = {}) {
        this.blockExternal = blockExternal;
        this._blobByPath = new Map(); // path -> Blob
        this._pathByURL = new Map(); // ObjectURL -> path
        this._urlByPath = new Map();  // path -> ObjectURL
        this.themeSettings = { darkTheme: false, mainColor: null }
    }

    isJavadocsPage(html) {
        return html.querySelector('body').classList.contains('class-declaration-page');
    }

    async load(inputUrl) {
        this.inputUrl = inputUrl
        if (inputUrl.endsWith(".jar")) {
            const entryPath = await this._ingestJar(inputUrl);
            return this._renderHtml(entryPath);
        } else if (inputUrl.endsWith(".htm") || inputUrl.endsWith(".html")) {
            const entryPath = await this._ingestHtmlPage(inputUrl);
            return this._renderHtml(entryPath);
        } else {
            throw new JavaDocsLoadError(false, "Unsupported URL type: must be .jar or .html");
        }
    }

    // ---------------------- PATH RESOLVER ----------------------

    _resolvePath(basePath, relative) {
        if (/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?\/\//.test(relative)) {
            return relative; // already absolute
        }
        if (this._isHttpish(basePath)) {
            return new URL(relative, basePath).toString(); // network mode
        }
        return this._resolveZipPath(basePath, relative); // jar mode
    }

    _resolveZipPath(basePath, relative) {
        let baseDir = basePath.includes("/")
            ? basePath.slice(0, basePath.lastIndexOf("/") + 1)
            : "";
        let parts = (baseDir + relative).split("/");
        let stack = [];
        for (const part of parts) {
            if (part === "" || part === ".") continue;
            if (part === "..") {
                if (stack.length > 0) stack.pop();
            } else {
                stack.push(part);
            }
        }
        return stack.join("/");
    }

    _isHttpish(p) {
        return /^https?:\/\//i.test(p);
    }

    // ---------------------- JAR INGESTION ----------------------

    async _ingestJar(url) {
        const res = await corsFetch(url);
        if (!res.ok) throw new JavaDocsLoadError(null, `Failed to download jar: ${res.status}`);
        const buf = await res.arrayBuffer();

        const { BlobReader, BlobWriter, ZipReader } = zip;
        const reader = new ZipReader(new BlobReader(new Blob([buf])));
        const entries = await reader.getEntries();
        this.isJarMode = true

        let entryPath = null;

        for (const entry of entries) {
            if (entry.directory) continue;

            const blob = await entry.getData(new BlobWriter());
            this._blobByPath.set(entry.filename, blob);
            if (!entryPath && entry.filename === "index.html") {
                entryPath = entry.filename;
            }
        }
        await reader.close();
        if (!entryPath) {
            throw new JavaDocsLoadError(false, "index.html was not found")
        }

        for (const [path, blob] of [...this._blobByPath]) {
            const mime = this._guessMime(path)

            if (mime === "text/html" || mime === 'text/css') {
                const text = await this._blobToText(blob);
                let rewritten = null

                if (mime === "text/css") {
                    rewritten = this._rewriteCss(text, path);
                } else {
                    rewritten = this._rewriteHtml(text, path);
                }

                this._blobByPath.set(path, this._textToBlob(rewritten, mime));
            }
        }

        return entryPath;
    }

    // ---------------------- HTML INGESTION ----------------------

    async _digestAsset(assetPath) {
        if (this._blobByPath.has(assetPath)) return
        if (this.blockExternal && this._isHttpish(assetPath)) return;

        const res = await corsFetch(assetPath);
        if (!res.ok) return;
        let blob = await res.blob();

        if (this._guessMime(assetPath) === "text/css") {
            const css = await this._blobToText(blob);
            blob = this._textToBlob(this._rewriteCss(css, assetPath), "text/css");
        }
        this._blobByPath.set(assetPath, blob);
    }

    async _ingestHtmlPage(pageUrl) {
        const res = await corsFetch(pageUrl);
        if (!res.ok) throw new JavaDocsLoadError(null, `Failed to download HTML: ${res.status}`);
        const htmlBlob = await res.blob();
        const entryPath = pageUrl;
        this._blobByPath.set(entryPath, htmlBlob);

        let htmlText = await this._blobToText(htmlBlob);
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, "text/html");
        this.indexHTML = doc
        this.isJarMode = false

        const assetUrls = [];
        doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach(el => {
            assetUrls.push(this._resolvePath(entryPath, el.getAttribute("href")));
        })
        doc.querySelectorAll("script[src]").forEach(el => {
            assetUrls.push(this._resolvePath(entryPath, el.getAttribute("src")));
        })
        doc.querySelectorAll("img[src]").forEach(el => {
            assetUrls.push(this._resolvePath(entryPath, el.getAttribute("src")));
        })

        await Promise.all(assetUrls.map(x => this._digestAsset(x)))

        const rewrittenHtml = this._rewriteHtml(htmlText, entryPath);
        this._blobByPath.set(entryPath, this._textToBlob(rewrittenHtml, "text/html"));

        this._finalUrlFor(entryPath);
        return entryPath;
    }

    // ---------------------- HTML/CSS REWRITE ----------------------

    _rewriteURL(el, attr, basePath) {
        const v = el.getAttribute(attr);
        if (v) {
            const resolved = this._resolvePath(basePath, v);
            const blobUrl = this._finalUrlFor(resolved);
            if (blobUrl) {
                el.setAttribute(attr, blobUrl);
            }
        }
    }

    _rewriteHtml(html, basePath) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const fix = (el, attr) => this._rewriteURL(el, attr, basePath)

        doc.querySelectorAll("link[href]").forEach(el => fix(el, "href"));
        doc.querySelectorAll("script[src]").forEach(el => fix(el, "src"));
        doc.querySelectorAll("img[src]").forEach(el => fix(el, "src"));

        const injection = injectDynamicScriptInterceptor(basePath)
        const preScript = doc.createElement('script')
        preScript.innerHTML = injection
        doc.body.prepend(preScript)

        // Try defaulting back, however any requests are likely to fail because of CORS.
        if (!this.isJarMode) {
            const base = doc.createElement("base")
            base.setAttribute("href", this.inputUrl)
            doc.head.prepend(base)
        }

        /*
            scriptText = scriptText.replace(
                /window\.location\.href\s*=\s*["']([^"']+)["']/g,
                (m, path) => `window.location.href = "${normalize(path)}";`
            );
        */
        return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
    }

    _rewriteCss(css, basePath) {
        return css.replace(/url\(([^)]+)\)/g, (m, p1) => {
            let ref = p1.trim().replace(/^['"]|['"]$/g, "");
            if (/^(data:|https?:|blob:)/.test(ref)) return `url(${ref})`;
            const resolved = this._resolvePath(basePath, ref);
            const blobUrl = this._finalUrlFor(resolved);
            return blobUrl ? `url(${blobUrl})` : m;
        });
    }

    // ---------------------- UTILITIES ----------------------

    _finalUrlFor(path) {
        if (this._urlByPath.has(path)) return this._urlByPath.get(path);
        const blob = this._blobByPath.get(path);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        this._urlByPath.set(path, url);
        this._pathByURL.set(url, path)
        return url;
    }

    _textToBlob(text, type) {
        return new Blob([text], { type });
    }

    async _blobToText(blob) {
        return await blob.text();
    }

    _guessMime(path) {
        if (path.endsWith(".html") || path.endsWith(".htm")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".gif")) return "image/gif";
        return "application/octet-stream";
    }

    _renderHtml(entryPath) {
        const blob = this._blobByPath.get(entryPath);
        if (!blob) throw new JavaDocsLoadError(null, "Entry HTML not found");
        const url = this._urlByPath.get(entryPath) || this._finalUrlFor(entryPath);

        // For some reason, just using x.remove() doesn't work here...
        document.body.innerHTML = '';
        document.head.querySelectorAll('link').forEach(x => x.parentNode.removeChild(x))
        document.head.querySelectorAll('script').forEach(x => x.parentNode.removeChild(x))

        const iframe = document.createElement("iframe");
        iframe.src = url;
        iframe.classList.add('javadocs-view')
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";

        this.addHeader()
        document.body.appendChild(iframe);
        getJavaDocsObject(iframe.contentWindow).loaderInstance = this
        getJavaDocsObject(iframe.contentWindow).actualURLOrigin = this.isJarMode ? '/' : this.inputUrl

        iframeURLChange(iframe, (loc) => {
            console.log("iframe URL Changed:", loc)
            getJavaDocsObject(iframe.contentWindow).loaderInstance = this
            getJavaDocsObject(iframe.contentWindow).actualURLOrigin = this.isJarMode ? '/' : this.inputUrl
        })

        iframe.addEventListener('load', () => {
            console.log('Loaded:', iframe)

            if (this.isJarMode) {
                const elUrl = iframe.contentDocument.location.href
                const reversed = this._pathByURL.get(elUrl)
                console.log("Navigating to:", elUrl, reversed)

                iframe.contentDocument.querySelectorAll("a[href]").forEach(
                    el => this._rewriteURL(el, "href", reversed)
                );
            }

            if (this.isJarMode) {
                if (this.themeGenerator) {
                    // Apply theme on page navigation for JARs.
                    this.updateTheme(iframe.contentDocument, this.themeSettings)
                }
            } else {
                this.removeUselessShit(iframe.contentDocument)
            }
        })

        return iframe;
    }

    addHeader() {
        headerTemplate.addTo(document.body)
    }

    updateTheme(doc, settings) {
        if (!settings) {
            console.error("Attempted to update theme with invalid settings:", settings)
            return
        }

        this.themeGenerator?.delete()
        const themeSettings = this.themeSettings
        Object.assign(themeSettings, settings)
        this.themeGenerator = new ThemeGenerator(doc, themeSettings)
        this.themeGenerator.generate()
    }

    removeUselessShit(doc) {
        const removeElementIfExists = selector => doc.querySelector(selector)?.remove()
        removeElementIfExists('#method-summary-table')
        removeElementIfExists('#method-summary')
        removeElementIfExists('#field-detail')
        removeElementIfExists('#method-detail')
        removeElementIfExists('#nested-class-summary')
        removeElementIfExists('.inheritance')
        removeElementIfExists('#enum-constant-detail')
        removeElementIfExists('.sub-title') // Remove the header package name
        removeElementIfExists('.notes') // e.g. "All Superinterfaces4"
        removeElementIfExists('.type-signature') // e.g. "public interface Class extends ..."
        removeElementIfExists('.sub-nav') // e.g. "public interface Class extends ..."
        removeElementIfExists('#constructor-summary')
        removeElementIfExists('#constructor-detail')

        doc.querySelectorAll('#field-summary .col-first')?.forEach(x => x.remove())
        const table = doc.querySelector('#field-summary .summary-table')
        if (table) {
            // Getting non-computed value requires finding the stylesheet that handles this
            // and changing it there manually, which is a pain in the ass...
            //
            // const tableStyle = window.getComputedStyle(table);
            // let grid = tableStyle['grid-template-columns']
            // Remove the first element
            // grid = grid.split(' ').slice(1).join(' ')

            table.style.gridTemplateColumns = 'minmax(20%, max-content) minmax(20%, auto)'
        }

        const enumConstSummary = doc.querySelector('#enum-constant-summary')
        if (enumConstSummary) {
            enumConstSummary.querySelector('h2').remove()
        }

        if (doc.querySelector('#enum-constant-summary')) {
            removeElementIfExists('#field-summary')
        }

        const headers = doc.querySelectorAll('#field-summary h2')
        for (const header of headers) {
            if (header.textContent === "Field Summary") {
                header.remove()
                break
            }
        }

        // Older JavaDocs
        removeElementIfExists('contentContainer div.details')
    }
}
