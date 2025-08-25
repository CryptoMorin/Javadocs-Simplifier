let isJarMode = false;
let baseUrl = '';

self.addEventListener('install', event => {
    console.log('Service Worker installing');
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    console.log('Service Worker activating');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
    console.log('Service Worker received message:', event.data);
    if (event.data.type === 'init') {
        isJarMode = event.data.isJarMode;
        baseUrl = event.data.baseUrl;
        event.ports[0].postMessage({ type: 'init-ack' });
    }
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/virtual/')) {
        console.log('Service Worker intercepting fetch:', url.pathname);
        event.respondWith((async () => {
            let path = url.pathname.slice('/virtual/'.length);
            if (!path) path = 'index.html';

            if (isJarMode) {
                const channel = new MessageChannel();
                const client = await clients.get(event.clientId);
                if (!client) {
                    console.error('Service Worker: No client found for', event.clientId);
                    return new Response('No client', { status: 500 });
                }
                client.postMessage({ type: 'get-blob', path }, [channel.port2]);
                return new Promise((resolve, reject) => {
                    channel.port1.onmessage = msg => {
                        if (msg.data.type === 'blob') {
                            if (msg.data.blob) {
                                console.log('Service Worker: Serving blob for', path);
                                resolve(new Response(msg.data.blob, {
                                    headers: { 'Content-Type': msg.data.mime || 'application/octet-stream' }
                                }));
                            } else {
                                console.log('Service Worker: Blob not found for', path);
                                resolve(new Response('Not found', { status: 404 }));
                            }
                        } else {
                            console.error('Service Worker: Invalid blob response', msg.data);
                            reject(new Error('Invalid response'));
                        }
                    };
                });
            } else {
                const targetUrl = baseUrl + path + url.search;
                console.log('Service Worker: Fetching remote URL:', targetUrl);
                try {
                    const response = await fetch(targetUrl, { mode: 'cors' });
                    return response;
                } catch (err) {
                    console.error('Service Worker: Fetch error for', targetUrl, err);
                    return new Response('Fetch error: ' + err.message, { status: 502 });
                }
            }
        })());
    }
});