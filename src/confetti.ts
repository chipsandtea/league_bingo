interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vRot: number;
  color: string;
  alpha: number;
  decay: number;
  diamond: boolean;
}

const HEXTECH_PALETTE = [
  '#C8AA6E', // Brushed Hextech Gold
  '#F0E6D2', // Bright Champagne Gold
  '#0AC8B9', // Hextech Magic Cyan
  '#38BDF8', // BLG Electric Cyan-Blue
  '#F59E0B', // Gen.G Tiger Amber-Gold
];

let activeRafId: number | null = null;

export function launchHextechBurst(
  canvas: HTMLCanvasElement,
  intensity: 'bingo' | 'streak' | 'pentakill' = 'bingo',
): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (activeRafId !== null) {
    cancelAnimationFrame(activeRafId);
    activeRafId = null;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const count =
    intensity === 'pentakill' ? 130 : intensity === 'streak' ? 85 : 60;

  const particles: Particle[] = [];
  const originX = width * 0.5;
  const originY = Math.min(height * 0.36, 320);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed =
      (intensity === 'pentakill' ? 5 : 3.5) +
      Math.random() * (intensity === 'pentakill' ? 9.5 : 7);
    particles.push({
      x: originX + (Math.random() - 0.5) * 80,
      y: originY + (Math.random() - 0.5) * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3.2,
      size: 4 + Math.random() * 5.5,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.22,
      color: HEXTECH_PALETTE[i % HEXTECH_PALETTE.length],
      alpha: 1,
      decay: 0.011 + Math.random() * 0.011,
      diamond: i % 3 !== 0,
    });
  }

  const tick = (): void => {
    ctx.clearRect(0, 0, width, height);
    let alive = 0;

    for (const p of particles) {
      if (p.alpha <= 0) continue;
      alive++;

      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.17; // gravity
      p.vx *= 0.988; // air drag
      p.rotation += p.vRot;
      p.alpha -= p.decay;

      if (p.alpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      if (p.diamond) {
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.65, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size * 0.65, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-p.size * 0.6, -p.size * 0.3, p.size * 1.2, p.size * 0.6);
      }

      ctx.restore();
    }

    if (alive > 0) {
      activeRafId = requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, width, height);
      activeRafId = null;
    }
  };

  activeRafId = requestAnimationFrame(tick);
}
