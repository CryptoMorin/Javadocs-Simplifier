import { showLoadMessage, showError, clearError } from "./search.js";

function logMessage(messages) {
    showLoadMessage(messages.join(' '))
    console.log(...messages)
}

async function simpleProxyRequest(base, url) {
    const encoded = encodeURIComponent(url)
    return fetch(base + encoded)
}

const corsproxy_io = url => simpleProxyRequest('https://corsproxy.io/?url=', url) // https://corsproxy.io/
const htmldriven = url => simpleProxyRequest('https://cors-proxy.htmldriven.com/?url=', url) // https://cors-proxy.htmldriven.com/
const thingproxy = url => simpleProxyRequest('https://thingproxy.freeboard.io/fetch/', url) // https://github.com/Freeboard/thingproxy
const whateverorigin = url => simpleProxyRequest('https://whateverorigin.org/get?url=', url) // https://whateverorigin.org/
const alloworigin = url => simpleProxyRequest('http://alloworigin.com/get?url=', url) // https://github.com/Eiledon/alloworigin
// https://developer.puter.com/tutorials/cors-free-fetch-api/ - Requires an entire library.
// Paid const justcors = url => simpleProxyRequest('https://justcors.com/.../', url) // https://justcors.com/

// https://cors.sh/
const CORSProxies = [corsproxy_io, htmldriven, thingproxy, whateverorigin, alloworigin]

async function proxifiedCORSRequest(url) {
    for (const proxy of CORSProxies) {
        console.log(`[${proxy.name}] Downloading ${url}`)
        try {
            return await proxy(url)
        } catch (error) {
            console.warn(`[${proxy.name}] Failed to download ${url}:`, error)
        }
    }
}

async function downloadPage(url) {
    const htmlFile = await (await proxifiedCORSRequest(url)).text()
    console.log('Parsing the downloaded javadocs...')
    const parser = new DOMParser();
    const html = parser.parseFromString(htmlFile, 'text/html');
    return html
}

function relativizeLink(url, base) {
    if (!url) throw Error('Relative url is invalid: ' + url + " (Base: " + base + ")")
    if (!base) throw Error('Base url is invalid: ' + url + " (Relative: " + url + ")")
    return new URL(url, base).href
}

class HTMLAsset {
    constructor(url, file, node) {
        this.url = url;
        this.file = file;
        this.node = node;
    }
}

class HTML {
    constructor(html, url, stylesheets, scripts) {
        this.html = html;
        this.url = url;
        this.stylesheets = stylesheets;
        this.scripts = scripts;
    }
}

function downloadAsset(url, asset, linkAttribute) {
    const relativeURL = asset.getAttribute(linkAttribute)
    if (!relativeURL) {
        console.error("No URL is defined for asset: ", asset)
        throw Error("No URL is defined for asset: " + asset)
    }

    const absoluteURL = relativizeLink(relativeURL, url)
    return new HTMLAsset(relativeURL, proxifiedCORSRequest(absoluteURL), asset)
}

async function downloadAssets(url, html) {
    // Note: The href properties of all nodes always return the normalized absolute value.
    const stylesheets = Array.from(html.querySelectorAll('link')).filter(x => x.rel === 'stylesheet')
    const scripts = Array.from(html.querySelectorAll('link')).filter(x => x.src) // TODO Ignore inline scripts

    const stylesheetRequests = []
    const scriptRequests = []

    for (const stylesheet of stylesheets) {
        stylesheetRequests.push(downloadAsset(url, stylesheet, 'href'))
    }

    for (const script of scripts) {
        scriptRequests.push(downloadAsset(url, script, 'src'))
    }

    // Normalize promise objects and wait for all to finish
    for (const stylesheet of stylesheetRequests) {
        stylesheet.file = await (await stylesheet.file).text()
    }
    for (const stylesheet of scripts) {
        script.file = await (await script.file).text()
    }

    return new HTML(html, url, stylesheetRequests, scriptRequests)
}

function normalizeAssets(html) {
    // Load CSS
    // html.html.adoptedStyleSheets = []
    for (const stylesheet of html.stylesheets) {
        // This doesn't work because: 
        //   DOMException: Adopted style sheet's constructor document must match the document or shadow root's node document
        // const sheet = new CSSStyleSheet()
        // sheet.replaceSync(stylesheet)
        // html.html.adoptedStyleSheets.push(sheet)

        const newStyle = html.html.createElement('link')
        newStyle.setAttribute('rel', 'stylesheet')
        newStyle.setAttribute('type', 'text/css')
        newStyle.setAttribute('href', 'data:text/css;charset=UTF-8,' + encodeURIComponent(stylesheet.file))
        // const newStyle = html.html.createElement('style');
        // newStyle.textContent = stylesheet
        console.log('appending style to ', html.html.head, " -> ", stylesheet.file)
        html.html.head.appendChild(newStyle);

        stylesheet.node.remove()
    }

    // Load JavaScripts
    for (const script of html.scripts) {
        const scriptElement = html.createElement('script')
        scriptElement.textContent = script.file

        // Append the <script> element to the document (e.g., <head> or <body>)
        html.html.head.appendChild(scriptElement)
        script.node.remove()
    }

    normalizeLinks(html.html, html.url)
}

function normalizeLinks(html, url) {
    console.log("Normalizing links...")
    const links = html.querySelectorAll('a')
    for (const link of links) {
        if (link.href) {
            link.setAttribute('href', relativizeLink(link.getAttribute('href'), url))
        }
    }
}

function removeUselessShit(html) {
    const doc = html.html

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

function replacePage(html) {
    console.log('Replacing page...')

    normalizeAssets(html)
    removeUselessShit(html)

    // Load the page itself
    document.replaceChild(
        document.importNode(html.html.documentElement, true),
        document.documentElement
    )
    // document.querySelector('html').replaceWith(html)
}

function isJavadocsPage(html) {
    return html.querySelector('body').classList.contains('class-declaration-page');
}

const audio = new Audio('../Around the Horizon.mp3')
async function playBackgroundMusic() {
    audio.loop = true
    try {
        await audio.play()
    } catch (error) {
        // Mostly because user disabled autoplay.
        console.warn("Failed to play audio: ", error)
    }

    const audioButton = document.querySelector('#audio-control')
    const audioButtonImg = audioButton.querySelector('img')
    audioButton.addEventListener("click", () => {
        if (audio.paused) {
            audio.play()
            audioButtonImg.src = 'images/audio.png'
        } else {
            audio.pause()
            audioButtonImg.src = 'images/no-audio.png'
        }
    });
}

export async function load(url, api) {
    if (url === 'reload') {
        reloadServer(false)
        return
    }

    const html = await downloadPage(url)
    if (!isJavadocsPage(html)) {
        const err = "The specified URL doesn't point to a javadoc page."
        if (!api) showError(err)
        return err
    }

    replacePage(await downloadAssets(url, html))
    audio.pause();
    console.log('Javadocs page loaded.')
    return true
}

async function reloadServer(locallyOnly) {
    console.log("Reloading...")
    if (!locallyOnly) {
        const answer = await fetch('/reload', { method: 'POST' })
        console.log("Reload answer: ", answer)
    }
    window.location.reload(true) // Ctrl + F5
}

async function addDevControls() {
    const request = await fetch('/is_dev', { method: 'GET' })
    const answer = await request.text()
    if (answer === "yes") {
        console.log("Initiating Dev Controls...")
        const reloadBtn = document.getElementById('reload-button')
        reloadBtn.style.display = 'inline-flex'
        reloadBtn.addEventListener("click", () => reloadServer(true))
    }
}

export function runModule() {
    playBackgroundMusic()
    addDevControls()
}