import { load } from "./javadocs-loader.js";

const input = document.getElementById('query');
const btn = document.getElementById('go');
const wrap = document.getElementById('search-wrap');
const progress = document.getElementById('progress');
const bar = document.getElementById('bar');
const exampleText = document.querySelector('.hint code')

const funny = [
    'Reticulating splines…',
    'Compiling witty loading text…',
    'Feeding the hamsters…',
    'Consulting the rubber duck…',
    'Optimizing flux capacitor…',
];

let rafId = null, running = false, pct = 0, last = 0;
let msgTimer = null, msgIndex = 0, msgShown = 0, msgMax = 4;

function disableUI() {
    input.disabled = true; btn.disabled = true; wrap.classList.add('disabled');
}
function enableUI() {
    input.disabled = false; btn.disabled = false; wrap.classList.remove('disabled');
    input.focus();
}

// Will clear error when msg is null
export function showError(msg) {
    const wrap = document.getElementById('search-wrap');
    const errorEl = document.getElementById('error');
    enableUI()
    hideProgress()

    if (msg) {
        errorEl.textContent = msg;
        errorEl.classList.add('show');
        wrap.classList.add('error');
        setTimeout(() => wrap.classList.remove('error'), 500);
    } else {
        errorEl.classList.remove('show');
    }
}

export function clearError() { showError(null) }

export function showLoadMessage(msg) {
    const loadingEl = document.getElementById('loading')
    if (!loadingEl) return // The page might already be loaded.

    loadingEl.classList.add('show')
    loadingEl.textContent = msg
}

export function removeLoadMessages() {
    const loadingEl = document.getElementById('loading')
    if (!loadingEl) return

    loadingEl.classList.remove('show')
}

function startMessages() {
    msgIndex = 0; msgShown = 0;
    showLoadMessage(funny[msgIndex++])
    msgShown++;

    msgTimer = setInterval(() => {
        if (!running || msgShown >= msgMax || msgIndex >= funny.length) {
            clearInterval(msgTimer); msgTimer = null;
            setTimeout(() => removeLoadMessages(), 600);
            return;
        }
        showLoadMessage(funny[msgIndex++]);
        msgShown++;
    }, 900);
}

function loop(ts) {
    if (!running) return;
    if (!last) last = ts; const dt = (ts - last) / 1000; last = ts;
    const target = pct < 80 ? 90 : 97; // glide toward near-complete
    const speed = 3.0; // smoothing factor
    pct = pct + (target - pct) * (1 - Math.exp(-speed * dt));
    bar.style.width = pct.toFixed(2) + '%';
    rafId = requestAnimationFrame(loop);
}

function startProgress() {
    progress.classList.add('show');
    progress.setAttribute('aria-hidden', 'false');
    pct = 0; last = 0; running = true; bar.style.width = '0%';
    rafId = requestAnimationFrame(loop);
    startMessages();
    disableUI();
    return finishProgress;
}

function finishProgress() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);

    const start = performance.now(); const startPct = pct;
    const dur = 500; // ms
    function to100(t) {
        const p = Math.min(1, (t - start) / dur);
        const ease = 1 - Math.pow(1 - p, 2); // easeOutQuad
        const w = startPct + (100 - startPct) * ease;
        bar.style.width = w.toFixed(2) + '%';
        if (p < 1) requestAnimationFrame(to100); else {
            // Do NOT re-enable UI after finishing (per requirement)
            // Progress bar stays visible at 100%; loading messages already stop after a few.
        }
    }
    requestAnimationFrame(to100);
}

function hideProgress() {
    progress.classList.remove('show');
    progress.setAttribute('aria-hidden', 'true');
    running = false
    if (rafId) cancelAnimationFrame(rafId)
}

function doSearch() {
    if (btn.disabled) return; // already running or permanently disabled
    const q = input.value.trim()
    if (!q) {
        showError('Please type something to search.');
        return;
    }
    clearError()
    const done = startProgress()
    // Simulate work; replace with real navigation if desired
    setTimeout(() => { done(); }, 1200 + Math.random() * 900)
    load(q)
}


/** Search interactions: keep disabled even after finish + smooth progress that stays visible + funny loading messages + empty-input error **/
export function runModule() {
    exampleText.addEventListener("click", () => {
        const searchBar = document.getElementById('query')
        searchBar.value = exampleText.textContent
    });

    // Prevent any pointer interaction on the search area while running
    wrap.addEventListener('pointerdown', (e) => {
        if (running) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    input.addEventListener('input', clearError);
}