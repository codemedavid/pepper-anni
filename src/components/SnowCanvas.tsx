import { useEffect, useRef } from 'react';

/**
 * Falling sakura-petal canvas — the signature ambient layer of the
 * Snow Snow / Frosted-Ice theme. Pointer-events disabled, fixed full-screen,
 * and respects `prefers-reduced-motion`.
 */
const PETAL_COLORS = ['#ff6fa5', '#e84d7f', '#d6457e', '#ffa6c9', '#c2304a', '#ff8fb8'];
const DENSITY = 0.55;

interface Petal {
  x: number;
  y: number;
  s: number;
  d: number;
  sway: number;
  sw: number;
  rot: number;
  rs: number;
  flip: number;
  o: number;
  c: string;
}

const SnowCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let petals: Petal[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;

    const build = () => {
      const target = Math.round((width / 26) * DENSITY);
      petals = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        s: Math.random() * 5 + 5,
        d: Math.random() * 0.5 + 0.25,
        sway: Math.random() * Math.PI * 2,
        sw: Math.random() * 0.5 + 0.2,
        rot: Math.random() * Math.PI * 2,
        rs: (Math.random() - 0.5) * 0.04,
        flip: Math.random() * 0.6 + 0.7,
        o: Math.random() * 0.4 + 0.5,
        c: PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0],
      }));
    };

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      build();
    };

    const drawPetal = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(p.flip * Math.sin(p.sway * 0.5), 1);
      ctx.globalAlpha = p.o;
      ctx.fillStyle = p.c;
      const s = p.s;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.85, -s * 0.7, s * 0.7, s * 0.55, 0, s);
      ctx.bezierCurveTo(-s * 0.7, s * 0.55, -s * 0.85, -s * 0.7, 0, -s);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, p.o + 0.25);
      ctx.strokeStyle = 'rgba(232,196,122,.85)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.globalAlpha = p.o * 0.4;
      ctx.fillStyle = 'rgba(240,214,149,.6)';
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.2, s * 0.16, s * 0.38, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of petals) {
        drawPetal(p);
        p.y += p.d * 1.1;
        p.sway += p.sw * 0.03;
        p.x += Math.sin(p.sway) * 0.7;
        p.rot += p.rs;
        if (p.y > height + 12) {
          p.y = -12;
          p.x = Math.random() * width;
        }
        if (p.x > width + 12) p.x = -12;
        if (p.x < -12) p.x = width + 12;
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);

    if (!reduce) {
      draw();
    }

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
    />
  );
};

export default SnowCanvas;
