import { load } from "./javadocs-loader.js"

function error(msg, url, timestamp, endpoint) {
    const data = { message: msg, url,timestamp, endpoint }
    window.location.href = "../api/error?" + new URLSearchParams(data).toString();
}

function localError(msg, url) {
    error(msg, url, new Date().toISOString(), window.location.pathname)
}

export function handleError() {
    const params = new URLSearchParams(window.location.search);
    const byId = (id) => document.getElementById(id);

    byId('retry').addEventListener('click', () => {
        const retryParams = new URLSearchParams({ url: params.get('url') });
        window.location.href = params.get('endpoint') + '?' + retryParams.toString()
    });
    byId('go-back').addEventListener('click', () => {
        if (history.length > 1) {
            history.back()
        } else {
            window.location.href = '/'
        }
    });

    // Runtime templating helper
    const replace = (selector, key, fallback) => {
        const el = document.querySelector(selector);
        const val = params.get(key);
        if (el && val) el.textContent = val;
        else if (el && fallback) el.textContent = fallback;
    };

    replace('#error-description', 'message');
    replace('#requested-url', 'url');
    replace('#timestamp', "timestamp");
    replace('#endpoint', 'endpoint');
}

function findWebsiteQuery() {
    const urlParams = new URLSearchParams(window.location.search);
    const url = urlParams.get('url');
    if (url) {
        console.log("Using the predefined URL: " + url)
        return url
    } else {
        return null
    }
}

export async function runModule() {
    const queried = findWebsiteQuery()
    if (queried) {
        const p = document.createElement('p')
        p.textContent = "Loading " + queried + "..."
        document.body.appendChild(p)

        const error = await load(queried, true)
        if (error !== true) {
            localError(error, queried)
            return false
        }
        return true
    } else {
        localError("No 'url' parameter provided.")
        return false
    }
}