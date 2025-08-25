async function simpleProxyRequest(base, url) {
    const encoded = encodeURIComponent(url)
    return fetch(base + encoded)
}

const corsproxy_io = url => simpleProxyRequest('https://corsproxy.io?url=', url) // https://corsproxy.io/
const htmldriven = url => simpleProxyRequest('https://cors-proxy.htmldriven.com?url=', url) // https://cors-proxy.htmldriven.com/
const thingproxy = url => simpleProxyRequest('https://thingproxy.freeboard.io/fetch/', url) // https://github.com/Freeboard/thingproxy
const whateverorigin = url => simpleProxyRequest('https://whateverorigin.org/get?url=', url) // https://whateverorigin.org/
const alloworigin = url => simpleProxyRequest('http://alloworigin.com/get?url=', url) // https://github.com/Eiledon/alloworigin
// https://developer.puter.com/tutorials/cors-free-fetch-api/ - Requires an entire library.
// Paid const justcors = url => simpleProxyRequest('https://justcors.com/.../', url) // https://justcors.com/

// https://cors.sh/
const CORSProxies = [corsproxy_io, htmldriven, thingproxy, whateverorigin, alloworigin]

export async function corsFetch(url) {
    for (const proxy of CORSProxies) {
        console.log(`[${proxy.name}] Downloading ${url}`)
        try {
            return await proxy(url)
        } catch (error) {
            console.warn(`[${proxy.name}] Failed to download ${url}:`, error)
        }
    }
}