/**
 * Generate a starfield on an offscreen canvas.
 * Cached and blitted each frame for performance.
 */
export function initStarfield(width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  // Dark background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Scatter stars
  const starCount = 250;
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const brightness = 0.2 + Math.random() * 0.8;
    const size = 0.5 + Math.random() * 1.5;

    ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

/**
 * Blit the cached starfield onto the main canvas.
 */
export function renderStarfield(
  ctx: CanvasRenderingContext2D,
  starfield: OffscreenCanvas
): void {
  ctx.drawImage(starfield, 0, 0);
}
