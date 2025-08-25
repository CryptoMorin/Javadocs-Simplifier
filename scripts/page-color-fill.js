import { createEnum } from "./enum.js";

export class WavyCircle {
    static Phase = createEnum(
        'InitialExpansion', 'Pause', 'Shrinkage', 'FinalExpansion', 'StaticFill'
    )

    // Static map to track active animations per canvas
    static activeAnimations = new Map();

    constructor(canvas, fillColor, settings = {}) {
        // Cancel any existing animation on this canvas
        if (WavyCircle.activeAnimations.has(canvas)) {
            const { animationFrameId, phaseTimeout } = WavyCircle.activeAnimations.get(canvas)
            cancelAnimationFrame(animationFrameId);
            if (phaseTimeout) clearTimeout(phaseTimeout)
            WavyCircle.activeAnimations.delete(canvas);
        }

        // Default settings
        this.settings = {
            // Controls the maximum amplitude (in pixels) of the wave effect on the circle's edge.
            // Higher values create more pronounced waves, making the circle appear more dynamic.
            waveAmplitude: 15,

            // Determines the number of waves around the circle's circumference.
            // Higher values create more frequent waves, increasing visual complexity.
            waveFrequency: 15,

            // Controls the speed at which waves move around the circle (in radians per millisecond).
            // Higher values make waves oscillate faster, creating a more dynamic animation.
            waveSpeed: {
                InitialExpansion: 0.005,
                Pause: 0.005,
                Shrinkage: 0.008,
                FinalExpansion: 0.013,
                StaticFill: 0.005
            },

            // Defines the duration (in milliseconds) for each animation phase.
            durations: {
                // Duration of the InitialExpansion phase, where the circle grows from radius 0 to radius.InitialExpansion.
                InitialExpansion: 1000,
                // Duration of the Pause phase, where the circle remains static at radius.Pause.
                Pause: 800,
                // Duration of the Shrinkage phase, where the circle shrinks from radius.Pause to radius.Shrinkage.
                Shrinkage: 300,
                // Duration of the FinalExpansion phase, where the circle expands from radius.Shrinkage to radius.FinalExpansion.
                FinalExpansion: 400,
                // Duration of the StaticFill phase, where the canvas is filled with a solid color.
                StaticFill: 200,
                // Duration of the final fade-out transition, where the canvas background fades from fillColor to transparent.
                ScreenClear: 1000
            },

            // Specifies the target radius for each phase as a ratio of the maximum canvas radius (sqrt(canvas.width^2 + canvas.height^2)).
            radius: {
                InitialExpansion: 0.3,
                Pause: 0.3,
                Shrinkage: 0.25,
                FinalExpansion: 1.0,
                StaticFill: 1.0
            },

            // Controls the speed of the pulse effect (in radians per millisecond), which adds a secondary oscillation to the waves.
            // Higher values make the pulse effect faster, creating subtle variations in wave amplitude.
            pulseSpeed: 0.01,

            // Determines the amplitude (in pixels) of the pulse effect, which modulates the wave amplitude.
            // Higher values increase the variation in wave size, enhancing the dynamic effect.
            pulseAmplitude: 5,

            // Sets the fill color of the circle and the final canvas background during StaticFill.
            // Accepts hex, RGB, or other valid CSS color formats.
            fillColor: fillColor ?? '#ffffffff',

            // Initial and final opacity of the circle at the start of the animation (when radius is small).
            // Ranges from 0 (transparent) to 1 (opaque).
            startAlpha: 0.4, endAlpha: 1.0,

            // XY-coordinates of the circle's center (in pixels). 
            // If null, defaults to the canvas center (canvas.width / 2).
            startX: null, startY: null,

            debug: false,
            onFillPhase: null,
        };

        // Merge provided settings with defaults
        Object.assign(this.settings, settings);

        this.phase = WavyCircle.Phase.InitialExpansion;
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
        this.phaseStartTime = null;
        this.totalElapsed = 0;
        this.unadjustedTotalElapsed = 0;
        this.lastTimestamp = null;
        this.totalDuration = this.sumDurationsUntil(WavyCircle.Phase.StaticFill, true);
        this.animationIds = { animationFrameId: null, phaseTimeout: null };
        this.isFillPhase = false; // Track fade-out state
        // Create offscreen canvas for double buffering
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');

        // Initialize canvas and event listeners
        this.resizeCanvas();
        // Clear canvas and reset styles
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.style.backgroundColor = 'transparent';
        this.canvas.style.transition = '';
        this.ctx.imageSmoothingEnabled = true;
        this.offscreenCtx.imageSmoothingEnabled = true;

        // Update resize handler to maintain clean state
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    debug(...data) {
        if (!this.settings.debug) return;
        console.log(...data)
    }

    sumDurationsUntil(phase, inclusive = false) {
        if (!phase)
            throw new Error("Provided phase is null: " + phase);

        let stopCalculating = false;
        return Object.entries(this.settings.durations)
            .reduce((accumulator, [entryPhase, phaseDuration]) => {
                if (stopCalculating) return accumulator;
                if (phase.name === entryPhase) {
                    stopCalculating = true;
                    return accumulator + (inclusive ? phaseDuration : 0);
                }
                return accumulator + phaseDuration;
            }, 0);
    }

    getDurationOf(phase) {
        if (!phase) return 0;
        return this.settings.durations[phase.name] || 0;
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.offscreenCanvas.width = this.canvas.width;
        this.offscreenCanvas.height = this.canvas.height;
        this.settings.startX = this.settings.startX !== null ? this.settings.startX : this.canvas.width / 2;
        this.settings.startY = this.settings.startY !== null ? this.settings.startY : this.canvas.height / 2;
        // Clear canvas on resize
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    easeInQuad(t) {
        return t * t;
    }

    drawWave(timestamp) {
        if (!this.lastTimestamp) this.lastTimestamp = timestamp;
        const frameDelta = timestamp - this.lastTimestamp;
        this.unadjustedTotalElapsed += frameDelta;
        this.lastTimestamp = timestamp;

        if (!this.phaseStartTime) this.phaseStartTime = timestamp;
        const elapsed = timestamp - this.phaseStartTime;
        const phaseDuration = this.getDurationOf(this.phase);

        // Track total elapsed time, but adjust for Pause phase
        let totalElapsed = this.totalElapsed + elapsed;
        let progress;

        if (this.phase === WavyCircle.Phase.Pause) {
            const pauseStartProgress = this.sumDurationsUntil(WavyCircle.Phase.Pause) / this.totalDuration;
            progress = Math.min(pauseStartProgress, 1);
        } else if (this.phase === WavyCircle.Phase.Shrinkage) {
            const pauseDuration = this.getDurationOf(WavyCircle.Phase.Pause);
            totalElapsed = this.totalElapsed + elapsed - pauseDuration;
            progress = Math.min(totalElapsed / this.totalDuration, 1);
        } else {
            progress = Math.min(totalElapsed / this.totalDuration, 1);
        }

        // Apply easing to progress for smoother transitions
        const easedProgress = this.phase ? this.easeInOutQuad(progress) : progress;

        // Debugging output with null check
        this.debug(
            this.phase ? this.phase.name : "Animation Ended",
            "Progress:", progress,
            "EasedProgress:", easedProgress,
            "PhaseDuration:", phaseDuration,
            "TotalDuration:", this.totalDuration,
            "TotalElapsed:", totalElapsed,
            "IsFading:", this.isFillPhase
        );

        // Only clear and draw if not in fade-out phase
        if (!this.isFillPhase) {
            // Clear offscreen canvas
            this.offscreenCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Calculate radius
            const maxRadius = Math.sqrt(this.canvas.width ** 2 + this.canvas.height ** 2);
            let radius;
            const phaseProgress = phaseDuration > 0 ? Math.min(elapsed / phaseDuration, 1) : 1;
            const easedPhaseProgress = this.easeInOutQuad(phaseProgress);

            if (this.phase === WavyCircle.Phase.InitialExpansion) {
                const startRadius = 0;
                const endRadius = maxRadius * this.settings.radius.InitialExpansion;
                radius = startRadius + (endRadius - startRadius) * easedPhaseProgress;
            } else if (this.phase === WavyCircle.Phase.Pause) {
                radius = maxRadius * this.settings.radius.Pause;
            } else if (this.phase === WavyCircle.Phase.Shrinkage) {
                const startRadius = maxRadius * this.settings.radius.Pause;
                const endRadius = maxRadius * this.settings.radius.Shrinkage;
                radius = startRadius + (endRadius - startRadius) * easedPhaseProgress;
            } else if (this.phase === WavyCircle.Phase.FinalExpansion) {
                const startRadius = maxRadius * this.settings.radius.Shrinkage;
                const endRadius = maxRadius * this.settings.radius.FinalExpansion;
                radius = startRadius + (endRadius - startRadius) * easedPhaseProgress;
            } else if (this.phase === WavyCircle.Phase.StaticFill) {
                radius = maxRadius * this.settings.radius.StaticFill;
            } else {
                radius = maxRadius;
            }

            // Calculate alpha based on radius
            const minRadius = 0;
            const maxPossibleRadius = maxRadius * Math.max(
                this.settings.radius.InitialExpansion,
                this.settings.radius.Pause,
                this.settings.radius.Shrinkage,
                this.settings.radius.FinalExpansion,
                this.settings.radius.StaticFill
            );
            const radiusProgress = Math.min((radius - minRadius) / (maxPossibleRadius - minRadius), 1);
            const easedRadiusProgress = this.easeInOutQuad(radiusProgress);
            const alphaRange = this.settings.endAlpha - this.settings.startAlpha;
            const currentAlpha = this.settings.startAlpha + (alphaRange * easedRadiusProgress);

            // Scale wave and pulse amplitudes during InitialExpansion for smooth start
            let effectiveWaveAmplitude = this.settings.waveAmplitude;
            let effectivePulseAmplitude = this.settings.pulseAmplitude;
            if (this.phase === WavyCircle.Phase.InitialExpansion) {
                const targetRadius = maxRadius * this.settings.radius.InitialExpansion;
                const amplitudeScale = Math.min(radius / (targetRadius * 0.1), 1); // Scale up to full amplitude at 10% of target
                effectiveWaveAmplitude *= amplitudeScale;
                effectivePulseAmplitude *= amplitudeScale;
            }

            // Draw on offscreen canvas
            if (this.phase === WavyCircle.Phase.StaticFill || !this.phase) {
                this.offscreenCtx.fillStyle = this.settings.fillColor;
                this.offscreenCtx.globalAlpha = currentAlpha;
                this.offscreenCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            } else {
                this.offscreenCtx.beginPath();
                const steps = 360;
                const angleStep = (Math.PI * 2) / steps;
                for (let i = 0; i <= steps; i++) {
                    const angle = i * angleStep;
                    const pulse = Math.sin(this.unadjustedTotalElapsed * this.settings.pulseSpeed + angle * this.settings.waveFrequency) * effectivePulseAmplitude;
                    //const wave = Math.sin(angle * this.settings.waveFrequency + this.unadjustedTotalElapsed * this.settings.waveSpeed) * (effectiveWaveAmplitude + pulse);

                    // Get waveSpeed for current and next phase
                    const currentWaveSpeed = this.settings.waveSpeed[this.phase.name] ?? 0.005;
                    const nextPhase = this.phase.next ? this.phase.next() : null;
                    const nextWaveSpeed = nextPhase ? (this.settings.waveSpeed[nextPhase.name] ?? 0.005) : 0; // Transition to 0 for end
                    // Interpolate waveSpeed using ease-in based on phase progress
                    const waveSpeed = currentWaveSpeed + (nextWaveSpeed - currentWaveSpeed) * this.easeInQuad(phaseProgress);
                    const wave = Math.sin(angle * this.settings.waveFrequency + this.unadjustedTotalElapsed * waveSpeed) * (effectiveWaveAmplitude + pulse);

                    const r = radius + wave;
                    const x = this.settings.startX + r * Math.cos(angle);
                    const y = this.settings.startY + r * Math.sin(angle);

                    if (i === 0) this.offscreenCtx.moveTo(x, y);
                    else this.offscreenCtx.lineTo(x, y);
                }
                this.offscreenCtx.closePath();
                this.offscreenCtx.fillStyle = this.settings.fillColor;
                this.offscreenCtx.globalAlpha = currentAlpha;
                this.offscreenCtx.fill();
            }
            this.offscreenCtx.globalAlpha = 1.0;

            // Copy offscreen canvas to main canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(this.offscreenCanvas, 0, 0);
        }

        // Handle phase transitions AFTER drawing to prevent jumps
        if (elapsed >= phaseDuration && this.phase) {
            this.totalElapsed += elapsed;
            if (this.phase === WavyCircle.Phase.Pause) {
                this.totalElapsed -= this.getDurationOf(WavyCircle.Phase.Pause);
            }
            this.phase = this.phase.next();
            this.phaseStartTime = timestamp;
        }

        // Continue animation or start fade-out
        if (this.phase && this.phase !== WavyCircle.Phase.StaticFill) {
            this.animationIds.animationFrameId = requestAnimationFrame((ts) => this.drawWave(ts));
        } else if (!this.isFillPhase) {
            this.isFillPhase = true;
            this.debug("Starting fade-out, ScreenClear duration:", this.settings.durations.ScreenClear, this.canvas.style);
            this.settings.onFillPhase?.()
            this.canvas.style.backgroundColor = this.settings.fillColor;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            this.animationIds.phaseTimeout = setTimeout(() => {
                this.debug("Fade-out starting...")
                this.canvas.style.transition = `background-color ${this.settings.durations.ScreenClear / 1000}s ease-in-out`;
                this.canvas.style.backgroundColor = 'transparent';
                this.animationIds.phaseTimeout = setTimeout(() => {
                    this.debug("Fade-out complete ", this.canvas.style);
                    WavyCircle.activeAnimations.delete(this.canvas);
                }, this.settings.durations.ScreenClear);
            }, this.settings.durations.StaticFill);
        }
    }

    run() {
        this.animationIds.animationFrameId = requestAnimationFrame((ts) => this.drawWave(ts));
        WavyCircle.activeAnimations.set(this.canvas, this.animationIds);
    }
}