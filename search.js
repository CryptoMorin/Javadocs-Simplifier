import { load } from "./javadocs-loader.js";

/** Interactive background with floating circles + autonomous slow drift + click ripples + mouse interaction + mouse connections **/
function interactive() {
    const canvas = document.getElementById('bg');
    const ctx = canvas.getContext('2d');
    let DPR = Math.min(window.devicePixelRatio || 1, 2);
    const circles = [];
    const ripples = [];
    let w, h;
    const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, lastX: null, lastY: null };

    function resize() {
        w = canvas.width = Math.floor(window.innerWidth * DPR);
        h = canvas.height = Math.floor(window.innerHeight * DPR);
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
    }

    function rand(a, b) { return Math.random() * (b - a) + a; }

    function makeCircle() {
        const r = rand(6, 26) * DPR;
        return {
            x: rand(0, w), y: rand(0, h), r,
            vx: rand(-.06, .06) * DPR, vy: rand(-.06, .06) * DPR, // slower base motion
            hue: rand(180, 320), alpha: rand(.08, .22),
            nx: rand(0, 6.28), ny: rand(0, 6.28), f: rand(0.18, 0.45) // lower frequency
        };
    }

    function addRipple(x, y) {
        ripples.push({ x: x * DPR, y: y * DPR, r: 0, alpha: 0.6, hue: rand(180, 320) });
    }

    function init() {
        circles.length = 0; ripples.length = 0;
        const count = Math.min(160, Math.floor((window.innerWidth * window.innerHeight) / 10000));
        for (let i = 0; i < count; i++) circles.push(makeCircle());
    }

    let last = performance.now();
    function step(now) {
        const dt = Math.min(0.033, (now - last) / 1000); // clamp dt
        last = now;
        ctx.clearRect(0, 0, w, h);

        for (const c of circles) {
            // Autonomous slow drift (gentle forces)
            const t = now * 0.001 * c.f;
            c.vx += Math.cos(t + c.nx) * 3 * dt * DPR; // much lower amplitude
            c.vy += Math.sin(t * 1.1 + c.ny) * 3 * dt * DPR;

            // Responsive attraction to mouse (softer)
            if (mouse.active) {
                const dx = (mouse.x * DPR - c.x); const dy = (mouse.y * DPR - c.y);
                const dist = Math.hypot(dx, dy) + 0.0001;
                const radius = 360 * DPR;
                const influence = Math.max(0, 1 - dist / radius);
                const follow = (0.8 / (c.r / (10 * DPR))) * influence; // smaller circles react more
                c.vx += (dx / dist) * follow * 24 * dt; // reduced seek
                c.vy += (dy / dist) * follow * 24 * dt;
                // Wake from mouse velocity (softer)
                c.vx += mouse.vx * influence * 0.012 * dt;
                c.vy += mouse.vy * influence * 0.012 * dt;
            }

            // Clamp speed and apply damping
            const maxSpeed = 0.5 * DPR; // hard cap
            const speed = Math.hypot(c.vx, c.vy);
            if (speed > maxSpeed) {
                const s = maxSpeed / speed; c.vx *= s; c.vy *= s;
            }

            // motion + friction + soft bounds
            c.x += c.vx; c.y += c.vy;
            c.vx *= 0.98; c.vy *= 0.98; // stronger damping
            if (c.x < -50) { c.x = -50; c.vx *= -1; }
            if (c.x > w + 50) { c.x = w + 50; c.vx *= -1; }
            if (c.y < -50) { c.y = -50; c.vy *= -1; }
            if (c.y > h + 50) { c.y = h + 50; c.vy *= -1; }

            // draw circle
            const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
            grad.addColorStop(0, `hsla(${c.hue}, 80%, 60%, ${c.alpha})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
        }

        // Network-like connections from circles to mouse
        if (mouse.active) {
            const mx = mouse.x * DPR, my = mouse.y * DPR;
            const connectR = 200 * DPR;
            for (const c of circles) {
                const dx = mx - c.x; const dy = my - c.y; const d = Math.hypot(dx, dy);
                if (d < connectR) {
                    const t = 1 - d / connectR; // 0..1
                    const alpha = Math.pow(t, 2) * 0.35; // stronger when close
                    ctx.beginPath();
                    ctx.moveTo(c.x, c.y);
                    ctx.lineTo(mx, my);
                    ctx.strokeStyle = `rgba(148,163,184, ${alpha.toFixed(3)})`;
                    ctx.lineWidth = Math.max(0.5, 1.2 * DPR * (t));
                    ctx.stroke();
                }
            }
        }

        // ripples
        for (let i = ripples.length - 1; i >= 0; i--) {
            const rp = ripples[i];
            rp.r += (220 * DPR) * dt; // slightly slower expansion
            rp.alpha *= Math.pow(0.92, (dt * 60));
            if (rp.alpha < 0.02) { ripples.splice(i, 1); continue; }
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
            ctx.strokeStyle = `hsla(${rp.hue}, 95%, 70%, ${rp.alpha})`;
            ctx.lineWidth = 2 * DPR;
            ctx.stroke();
        }

        requestAnimationFrame(step);
    }

    window.addEventListener('resize', () => { resize(); init(); });
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
        if (mouse.lastX != null) { mouse.vx = (e.clientX - mouse.lastX) * DPR; mouse.vy = (e.clientY - mouse.lastY) * DPR; }
        mouse.lastX = e.clientX; mouse.lastY = e.clientY;
    });
    window.addEventListener('mouseleave', () => { mouse.active = false; mouse.x = mouse.y = -9999; });

    // Left-click anywhere that's not the search to create ripple
    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // left only
        if (e.target.closest('#search-wrap') || e.target.closest('#contextMenu')) return;
        addRipple(e.clientX, e.clientY);
    });

    resize(); init(); last = performance.now(); requestAnimationFrame(step);
}

// Will clear error when msg is null
export function showError(msg) {
    const wrap = document.getElementById('search-wrap');
    const errorEl = document.getElementById('error');
    if (errorEl) {
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

/** Search interactions: keep disabled even after finish + smooth progress that stays visible + funny loading messages + empty-input error **/
function searchInt() {
    const input = document.getElementById('query');
    const btn = document.getElementById('go');
    const wrap = document.getElementById('search-wrap');
    const progress = document.getElementById('progress');
    const bar = document.getElementById('bar');

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

    // Prevent any pointer interaction on the search area while running
    wrap.addEventListener('pointerdown', (e) => {
        if (running) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    function startMessages() {
        msgIndex = 0; msgShown = 0;
        showLoadMessage(funny[msgIndex++])
        msgShown++;

        msgTimer = setInterval(() => {
            if (msgShown >= msgMax || msgIndex >= funny.length) {
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
        running = false; if (rafId) cancelAnimationFrame(rafId);
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

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    input.addEventListener('input', clearError);
};

/** Custom context menu shown when right-clicking anywhere that's NOT the search bar **/
function contextMenu() {
    const menu = document.getElementById('contextMenu');

    function showAt(x, y) {
        const pad = 8; const vw = window.innerWidth, vh = window.innerHeight;
        menu.style.display = 'block';
        const rect = menu.getBoundingClientRect();
        const left = Math.min(x, vw - rect.width - pad);
        const top = Math.min(y, vh - rect.height - pad);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }
    function hide() { menu.style.display = 'none'; }

    document.addEventListener('contextmenu', (e) => {
        const insideSearch = !!e.target.closest('#search-wrap');
        if (!insideSearch) {
            e.preventDefault();
            showAt(e.clientX, e.clientY);
        } else {
            hide();
        }
    });

    document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target)) hide(); });
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

window.onload = () => {
    interactive();
    searchInt();
    contextMenu();
}