import { THEME } from '../constants';

/**
 * Render a sun with glowing corona effect.
 * Each sun gets a unique color palette based on its index.
 */
export function renderSun(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  mass: number,
  sunIndex: number = 0
): void {
  const palette = THEME.sunPalettes[sunIndex % THEME.sunPalettes.length];
  // Minimum visual radius for small suns
  const visualRadius = Math.max(radius, 4);

  // Large soft outer glow (atmospheric haze)
  ctx.save();
  const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, visualRadius * 12);
  outerGlow.addColorStop(0, palette.corona + '40');
  outerGlow.addColorStop(0.3, palette.outer + '20');
  outerGlow.addColorStop(0.7, palette.outer + '08');
  outerGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, visualRadius * 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Mid glow layers
  const glowLayers = [
    { blur: visualRadius * 10, alpha: 0.08, color: palette.outer, scale: 4.0 },
    { blur: visualRadius * 7, alpha: 0.12, color: palette.corona, scale: 3.0 },
    { blur: visualRadius * 4, alpha: 0.18, color: palette.glow, scale: 2.0 },
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

  // Inner radial gradient
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, visualRadius * 1.5);
  gradient.addColorStop(0, '#FFFFFF');
  gradient.addColorStop(0.2, palette.core);
  gradient.addColorStop(0.5, palette.glow);
  gradient.addColorStop(0.8, palette.corona + '80');
  gradient.addColorStop(1, palette.outer + '00');

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, visualRadius * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Core circle
  ctx.fillStyle = palette.glow;
  ctx.beginPath();
  ctx.arc(cx, cy, visualRadius * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Bright white center
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(cx, cy, visualRadius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
