import { THEME } from '../constants';

/**
 * Render a sun with glowing corona effect.
 * Uses multiple shadow layers for the glow.
 */
export function renderSun(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  mass: number
): void {
  // Minimum visual radius for small suns
  const visualRadius = Math.max(radius, 4);

  // Outer glow layers (3 layers, decreasing intensity)
  const glowLayers = [
    { blur: visualRadius * 8, alpha: 0.06, color: '#FF4400', scale: 3.0 },
    { blur: visualRadius * 5, alpha: 0.1, color: THEME.sunCorona, scale: 2.2 },
    { blur: visualRadius * 3, alpha: 0.15, color: THEME.sunGlow, scale: 1.6 },
  ];

  for (const layer of glowLayers) {
    ctx.save();
    ctx.globalAlpha = layer.alpha;
    ctx.shadowBlur = layer.blur;
    ctx.shadowColor = layer.color;
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.arc(cx, cy, visualRadius * layer.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Inner glow
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, visualRadius * 1.2);
  gradient.addColorStop(0, '#FFFFFF');
  gradient.addColorStop(0.3, THEME.sunCore);
  gradient.addColorStop(0.7, THEME.sunGlow);
  gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, visualRadius * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Core circle
  ctx.fillStyle = THEME.sunCore;
  ctx.beginPath();
  ctx.arc(cx, cy, visualRadius * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Bright white center
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, visualRadius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
