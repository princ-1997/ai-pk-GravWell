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
  ctx.shadowBlur = 8;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bright core
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Render a ship's trail as a fading polyline.
 */
export function renderTrails(
  ctx: CanvasRenderingContext2D,
  trail: Array<{ x: number; y: number }>,
  color: string
): void {
  if (trail.length < 2) return;

  for (let i = 1; i < trail.length; i++) {
    const alpha = (i / trail.length) * 0.6;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
