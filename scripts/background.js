/** Interactive background with floating circles + autonomous slow drift + click ripples + mouse interaction + mouse connections **/
export function runModule() {
    const canvas = document.querySelector('canvas.celestial-globes');
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
        const r = rand(6, 56) * DPR;
        return {
            // Position
            x: rand(0, w), y: rand(0, h),

            // radius
            r,

            // Velocity
            vx: rand(-.06, .06) * DPR, vy: rand(-.06, .06) * DPR,

            // Color
            alpha: rand(.08, 0.8),
            hue: rand(180, 320),

            // Fuck is this?
            nx: rand(0, 6.28), ny: rand(0, 6.28),

            // Distance that the circles are attracted
            f: rand(0.18, 0.45),

            lastRippleTarget: null
        };
    }

    function addRipple(x, y) {
        ripples.push(
            {
                x: x * DPR, y: y * DPR,
                r: 0, // radius

                // Color
                alpha: 0.6,
                hue: rand(180, 320),

                isPointInside: function (x, y) {
                    const distance = Math.sqrt(
                        Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2)
                    );
                    return distance <= this.r;
                }
            }
        );
    }

    function getInteractingRipple(x, y) {
        return ripples.find(ripple => ripple.isPointInside(x, y))
    }

    function getDirectionUnitVector(x, y, x2, y2) {
        const dx = x2 - x;
        const dy = y2 - y;
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        return magnitude > 0 ? {
            x: dx / magnitude,
            y: dy / magnitude
        } : { x: 0, y: 0 };
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
            // Autonomous slow drift
            const t = now * 0.001 * c.f;
            c.vx += Math.cos(t + c.nx) * 3 * dt * DPR;
            c.vy += Math.sin(t * 1.1 + c.ny) * 3 * dt * DPR;

            // Responsive attraction to mouse
            const interactingRipple = getInteractingRipple(c.x, c.y)
            let isInsideRipple = !!interactingRipple
            if (mouse.active || isInsideRipple) {
                const sourceX = isInsideRipple ? interactingRipple.x : mouse.x
                const sourceY = isInsideRipple ? interactingRipple.y : mouse.y

                let sourceDirX, sourceDirY

                if (isInsideRipple) {
                    const vector = getDirectionUnitVector(sourceX, sourceY, c.x, c.y)
                    sourceDirX = vector.x
                    sourceDirY = vector.y
                } else {
                    sourceDirX = mouse.vx
                    sourceDirY = mouse.vy
                }

                const dx = (sourceX * DPR - c.x); const dy = (sourceY * DPR - c.y);
                const dist = Math.hypot(dx, dy) + 0.0001;
                const radius = 360 * DPR;
                const influence = Math.max(0, 1 - dist / radius); // Direction can be modified here with negative sign
                let follow = (0.8 / (c.r / (10 * DPR))) * influence; // smaller circles react faster

                if (isInsideRipple) follow = -follow * 5

                c.vx += (dx / dist) * follow * 24 * dt; // reduced seek
                c.vy += (dy / dist) * follow * 24 * dt;
                // Wake from mouse velocity (softer)
                c.vx += sourceDirX * influence * 0.012 * dt;
                c.vy += sourceDirY * influence * 0.012 * dt;
            }

            // Clamp speed and apply damping
            const maxSpeed = (isInsideRipple ? 1000 : 0.5) * DPR; // hard cap for both passive and attraction speed
            const speed = Math.hypot(c.vx, c.vy);
            if (speed > maxSpeed) {
                const s = maxSpeed / speed;
                c.vx *= s; c.vy *= s;
            }

            // Be affected by one ripple at a time.
            if (isInsideRipple && c.lastRippleTarget !== interactingRipple) {
                if (c.alphaStep !== null && c.alphaStep !== undefined) {
                    if (c.alphaStep < 0) c.alphaStep = -c.alphaStep;
                } else {
                    c.alphaStep = 0
                }
                c.lastRippleTarget = interactingRipple
            }

            if (c.alphaStep !== null && c.alphaStep !== undefined) {
                if (c.alphaStep < 0) {
                    c.alphaStep += 0.01
                    if (c.alphaStep >= 0) c.alphaStep = null
                } else {
                    if (c.alpha + c.alphaStep >= 1) c.alphaStep = -c.alphaStep
                    else c.alphaStep += 0.01
                }
            }

            // motion + friction + soft bounds
            c.x += c.vx; c.y += c.vy;
            c.vx *= 0.98; c.vy *= 0.98; // stronger damping
            if (c.x < -50) { c.x = -50; c.vx *= -1; }
            if (c.x > w + 50) { c.x = w + 50; c.vx *= -1; }
            if (c.y < -50) { c.y = -50; c.vy *= -1; }
            if (c.y > h + 50) { c.y = h + 50; c.vy *= -1; }

            // Draw circle
            const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
            grad.addColorStop(0, `hsla(${c.hue}, 80%, 60%, ${c.alpha + Math.abs(c.alphaStep || 0)})`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Network-like connections from circles to mouse
        if (mouse.active) {
            const mx = mouse.x * DPR, my = mouse.y * DPR;
            const connectR = 200 * DPR;
            for (const c of circles) {
                const dx = mx - c.x; const dy = my - c.y; const d = Math.hypot(dx, dy);
                if (d < connectR) {
                    const t = 1 - d / connectR; // 0..1
                    const alpha = Math.pow(t, 2) * 0.65; // stronger when close
                    ctx.beginPath();
                    ctx.moveTo(c.x, c.y);
                    ctx.lineTo(mx, my);
                    ctx.strokeStyle = `hsla(${c.hue}, 80%, 60%, ${alpha.toFixed(3)})`;
                    ctx.lineWidth = Math.max(0.5, 1.2 * DPR * (t));
                    ctx.stroke();
                }
            }
        }

        // Left-click Ripples
        for (let i = ripples.length - 1; i >= 0; i--) {
            const rp = ripples[i];
            rp.r += (220 * DPR) * dt; // Expansion rate
            rp.alpha *= Math.pow(0.92, (dt * 60));
            if (rp.alpha < 0.02) { ripples.splice(i, 1); continue; }
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
            ctx.strokeStyle = `hsla(${rp.hue}, 95%, 70%, ${rp.alpha})`;
            ctx.lineWidth = 5 * DPR; // Circle line width
            ctx.stroke();
        }

        requestAnimationFrame(step);
    }

    window.addEventListener('resize', () => { resize(); init(); });
    window.addEventListener('mousemove', (e) => {
        mouse.active = true;
        mouse.x = e.clientX;
        mouse.y = e.clientY;

        if (mouse.lastX != null) {
            mouse.vx = (e.clientX - mouse.lastX) * DPR;
            mouse.vy = (e.clientY - mouse.lastY) * DPR;
        }

        mouse.lastX = e.clientX;
        mouse.lastY = e.clientY;
    });
    // mouseout is better than mouseleave in this case
    window.addEventListener('mouseout', () => { mouse.active = false; mouse.x = mouse.y = -9999; });

    // Left-click anywhere that's not the search to create ripple
    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // left only
        if (e.target.closest('#search-wrap') || e.target.closest('#contextMenu')) return;
        addRipple(e.clientX, e.clientY);
    });

    resize(); init(); last = performance.now(); requestAnimationFrame(step);
}