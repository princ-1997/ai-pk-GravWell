import { THEME } from '../constants';

/**
 * Render the scoring zone as a white circle with subtle fill.
 */
export function renderZone(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number
): void {
  // Subtle fill
  ctx.fillStyle = THEME.zoneFill;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // White stroke
  ctx.strokeStyle = THEME.zoneLine;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
