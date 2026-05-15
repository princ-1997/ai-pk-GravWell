export type TrailStore = Record<string, Array<{ x: number; y: number }>>;

/**
 * Render a ship as a small glowing dot.
 */
export function renderShip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string
): void {
  // Glow effect
  ctx.save();
  ctx.shadowBlur = 10;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bright core
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Render a ship's trail as fading dots (particle trail).
 * Every few positions a dot is drawn, fading from transparent to full opacity.
 */
export function renderTrails(
  ctx: CanvasRenderingContext2D,
  trail: Array<{ x: number; y: number }>,
  color: string
): void {
  if (trail.length < 2) return;

  const len = trail.length;

  for (let i = 0; i < len; i++) {
    // Progress 0..1 from oldest to newest
    const t = i / (len - 1);
    // Alpha: ramp from near-zero to moderate, newest dots are brightest
    const alpha = t * t * 0.7;
    // Dot size: slightly larger toward the head
    const dotRadius = 0.8 + t * 1.0;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(trail[i].x, trail[i].y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
