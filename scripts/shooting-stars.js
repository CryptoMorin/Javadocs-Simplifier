const canvas = document.querySelector('canvas.shooting-star')
const ctx = canvas.getContext('2d', { alpha: true })

const particleCounts = 120
const showMotionTrail = true

// retina scaling
function resize() {
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale drawing calls automatically
}
window.addEventListener('resize', resize);
resize();

// utility
function rand(min, max) { return Math.random() * (max - min) + min; }
function chance(p) { return Math.random() < p; }

// Particle class
class Particle {
    constructor(width, height) {
        this.reset(width, height);
    }

    reset(width, height) {
        this.x = rand(0, width);
        this.y = rand(0, height);
        const speed = rand(0.12, 1.0);
        const angle = rand(0, Math.PI * 2);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed * 0.7;
        this.baseR = rand(0.8, 3.4);        // base radius
        this.r = this.baseR;
        this.colorH = Math.floor(rand(160, 310)); // hue range - you can change
        this.colorS = rand(60, 95);
        this.colorL = rand(40, 70);
        this.glowTimer = rand(0, 8);        // seconds until next glow start
        this.glowDuration = rand(0.12, 0.9); // seconds of glow
        this.glowElapsed = 0;               // time into glow (seconds)
        this.isGlowing = false;
        // a per-particle "idle flicker" to create gentle breathing even when not glowing
        this.breathPhase = rand(0, Math.PI * 2);
        this.breathSpeed = rand(0.5, 1.7);
    }

    update(dt, width, height) {
        // movement
        this.x += this.vx * dt * 60; // scale velocity to be framerate-friendly
        this.y += this.vy * dt * 60;

        // wrap around edges gently
        if (this.x < -10) this.x = width + 10;
        if (this.x > width + 10) this.x = -10;
        if (this.y < -10) this.y = height + 10;
        if (this.y > height + 10) this.y = -10;

        // breathing (small radius oscillation)
        this.r = this.baseR + Math.sin((performance.now() / 1000) * this.breathSpeed + this.breathPhase) * (this.baseR * 0.12);

        // glow timing (measured in seconds)
        if (!this.isGlowing) {
            this.glowTimer -= dt;
            if (this.glowTimer <= 0) {
                // start glow
                this.isGlowing = true;
                this.glowElapsed = 0;
                // randomize how bright/long this glow is
                this.glowDuration = rand(0.08, 1.1);
                // set next glow time (after current glow finishes)
                this.nextGlowGap = rand(1.1, 8.0);
            }
        } else {
            this.glowElapsed += dt;
            if (this.glowElapsed >= this.glowDuration) {
                // end glow
                this.isGlowing = false;
                this.glowTimer = this.nextGlowGap || rand(0.5, 6.0);
                this.glowElapsed = 0;
            }
        }
    }

    draw(ctx) {
        // color
        const h = this.colorH;
        const s = this.colorS + '%';
        const l = this.colorL + '%';

        // glow strength - 0..1
        let glowStrength = 0;
        if (this.isGlowing) {
            // ease in/out for glow
            const t = Math.min(1, this.glowElapsed / Math.max(0.0001, this.glowDuration));
            // use smootherstep-like curve
            const eased = t * t * (3 - 2 * t);
            glowStrength = 0.9 * (1 - Math.abs(2 * eased - 1)); // peaks mid-duration
        }

        // draw core with additive blending
        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; // additive makes glow pop
        // shadow creates the soft halo. shadowBlur uses device pixels (scaled by ctx transform)
        const baseShadow = 6 + this.baseR * 3;
        const glowShadow = baseShadow + glowStrength * 40;
        ctx.shadowBlur = glowStrength > 0 ? glowShadow : baseShadow;
        ctx.shadowColor = `hsla(${h}, ${s}, ${l}, ${0.9 * (0.45 + glowStrength * 0.7)})`;

        // fill style: slight transparency for blending
        ctx.fillStyle = `hsla(${h}, ${s}, ${l}, ${0.75 + glowStrength * 0.25})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + glowStrength * (this.baseR * 3 + 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // optional subtle outer ring to emphasize glow moment
        if (glowStrength > 0.15) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.lineWidth = 1 + glowStrength * 2;
            ctx.strokeStyle = `hsla(${h}, ${s}, ${l}, ${0.06 + glowStrength * 0.22})`;
            ctx.arc(this.x, this.y, this.r + 6 + glowStrength * 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// particle system
let particles = [];
let last = performance.now();
let width = canvas.width / (window.devicePixelRatio || 1);
let height = canvas.height / (window.devicePixelRatio || 1);

function initParticles(n) {
    width = canvas.width / (window.devicePixelRatio || 1);
    height = canvas.height / (window.devicePixelRatio || 1);
    particles = [];

    for (let i = 0; i < n; i++) 
        particles.push(new Particle(width, height));
}

// pointer interaction: attract particles on move/click
const pointer = { x: null, y: null, down: false };
window.addEventListener('mouseleave', () => { pointer.x = null; pointer.y = null; });
window.addEventListener('mousedown', () => { pointer.down = true; });
window.addEventListener('mouseup', () => { pointer.down = false; });
window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left);
    pointer.y = (e.clientY - rect.top);
});

// animation loop
function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // clamp dt to avoid big jumps
    last = now;
    // painting background
    if (showMotionTrail) {
        // translucent fill to create trailing effect
        ctx.fillStyle = 'rgba(5,6,10,0.18)';
        ctx.fillRect(0, 0, canvas.width, canvas.height) // Removing this line creates an OSU-like lightsaber effect.
    } else {
        // full clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // update and draw
    const nTarget = particleCounts
    if (particles.length !== nTarget) {
        // smooth addition/removal
        if (particles.length < nTarget) {
            const add = nTarget - particles.length;
            for (let i = 0; i < add; i++) particles.push(new Particle(width, height));
        } else {
            particles.length = nTarget;
        }
    }

    // apply pointer attraction/repel
    for (let p of particles) {
        // attraction when mouse down, gentle pull otherwise slight repulsion
        if (pointer.x !== null && pointer.y !== null) {
            const dx = pointer.x - p.x;
            const dy = pointer.y - p.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 > 0) {
                const dist = Math.sqrt(dist2);
                const force = Math.min(150 / dist2, 0.8); // scale
                const fx = dx / dist * force;
                const fy = dy / dist * force;
                // when mouse down, attract more strongly
                if (pointer.down) {
                    p.vx += fx * 0.9 * dt * 60;
                    p.vy += fy * 0.9 * dt * 60;
                    // slightly trigger glow when the particle encounters pointer
                    if (dist < 40 && !p.isGlowing && chance(0.06)) {
                        p.isGlowing = true;
                        p.glowElapsed = 0;
                        p.glowDuration = rand(0.08, 0.6);
                    }
                } else {
                    // gentle swirling / perturbation
                    p.vx += fx * 0.12 * dt * 60;
                    p.vy += fy * 0.12 * dt * 60;
                }
            }
        }

        p.update(dt, width, height);
        p.draw(ctx);
    }

    requestAnimationFrame(frame);
}

initParticles(particleCounts)
requestAnimationFrame(frame);
