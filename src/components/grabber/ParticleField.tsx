import { useEffect, useRef } from "react";

type P = { x: number; y: number; vx: number; vy: number; r: number; a: number };

/**
 * Reactive ambient particle field. Canvas-based, DPR-aware, pointer-reactive
 * (particles drift toward and brighten near the cursor). Pauses when the tab is
 * hidden and respects prefers-reduced-motion.
 */
export function ParticleField() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let particles: P[] = [];
    let raf = 0;
    let running = true;
    const pointer = { x: -9999, y: -9999, active: false };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
      h = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
      if (w < 1 || h < 1) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(28, Math.min(90, Math.round((w * h) / 16000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.6 + 0.6,
        a: Math.random() * 0.35 + 0.15,
      }));
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        if (!reduced) {
          if (pointer.active) {
            const dx = pointer.x - p.x;
            const dy = pointer.y - p.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 26000 && d2 > 1) {
              const f = 0.00022;
              p.vx += dx * f;
              p.vy += dy * f;
            }
          }
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;
        }

        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const near = pointer.active ? Math.max(0, 1 - dist / 170) : 0;
        const alpha = Math.min(0.85, p.a + near * 0.55);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + near * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `oklch(0.74 0.17 300 / ${alpha})`;
        ctx.fill();
      }

      // link nearby particles with faint violet threads
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 12000) {
            const o = (1 - d2 / 12000) * 0.14;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `oklch(0.63 0.208 296 / ${o})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      if (running) raf = requestAnimationFrame(draw);
    };

    const startLoop = () => {
      cancelAnimationFrame(raf);
      running = true;
      // Sizes can still be 0 on the first frame under file:// (Electron shows the
      // window after load), so re-measure before the loop takes over.
      if (w < 1 || h < 1) resize();
      raf = requestAnimationFrame(draw);
    };

    resize();
    startLoop();

    const ro = new ResizeObserver(() => {
      resize();
      if (running) startLoop();
    });
    ro.observe(canvas);
    const onWindowResize = () => {
      resize();
      startLoop();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("focus", startLoop);
    window.addEventListener("resize", onWindowResize);

    const onVisibility = () => {
      if (document.visibilityState === "visible") startLoop();
      else {
        running = false;
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("focus", startLoop);
      window.removeEventListener("resize", onWindowResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-70"
    />
  );
}
