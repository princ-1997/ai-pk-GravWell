import type { TickRecord, Sun } from '../types';
import { THEME, PLAYER_COLORS } from '../constants';
import { renderStarfield, initStarfield } from './starfield';
import { renderSun } from './sun-renderer';
import { renderShip, renderTrails, type TrailStore } from './ship-renderer';
import { renderZone } from './zone-renderer';
import { ParticleSystem } from './effects';

export class GameRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private starfieldCanvas: OffscreenCanvas | null = null;
  private padding = 20;

  // Trail data: stores last N positions per ship
  trails: TrailStore = {};

  // Particle system for explosions
  private particles = new ParticleSystem();

  // Track which ships were alive last frame to detect crashes
  private prevAlive: Record<string, boolean> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /**
   * Map game coordinates [0, arenaSize] to canvas pixels.
   */
  gameToCanvas(gx: number, gy: number): { cx: number; cy: number } {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const size = Math.min(w, h) - this.padding * 2;
    const offsetX = (w - size) / 2 - this.padding;
    const offsetY = (h - size) / 2 - this.padding;
    return {
      cx: this.padding + offsetX + (gx / 100) * size,
      cy: this.padding + offsetY + (gy / 100) * size,
    };
  }

  /**
   * Scale a game-space distance to canvas pixels.
   */
  scaleToCanvas(gameDistance: number): number {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const size = Math.min(w, h) - this.padding * 2;
    return (gameDistance / 100) * size;
  }

  /**
   * Initialize/resize the canvas to fill its container.
   */
  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Regenerate starfield for new size
    this.starfieldCanvas = initStarfield(Math.floor(w), Math.floor(h));
  }

  /**
   * Clear trails and particles (e.g., on new simulation).
   */
  clearTrails(): void {
    this.trails = {};
    this.particles.clear();
    this.prevAlive = {};
  }

  /**
   * Render a single frame from a TickRecord.
   */
  renderFrame(tickRecord: TickRecord, suns: ReadonlyArray<Sun>): void {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const ctx = this.ctx;

    // 1. Clear background
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);

    // 2. Starfield
    if (this.starfieldCanvas) {
      renderStarfield(ctx, this.starfieldCanvas);
    }

    // 3. Suns
    for (let i = 0; i < suns.length; i++) {
      const sun = suns[i];
      const { cx, cy } = this.gameToCanvas(sun.x, sun.y);
      const r = this.scaleToCanvas(sun.radius);
      renderSun(ctx, cx, cy, r, sun.mass, i);
    }

    // 4. Scoring zone
    const { cx: zx, cy: zy } = this.gameToCanvas(tickRecord.zone.x, tickRecord.zone.y);
    const zr = this.scaleToCanvas(tickRecord.zone.radius);
    renderZone(ctx, zx, zy, zr);

    // 5. Detect crashes and update trails
    for (const shipData of tickRecord.ships) {
      const playerIdx = parseInt(shipData.id.charAt(1)) - 1;
      const color = PLAYER_COLORS[playerIdx % PLAYER_COLORS.length];

      // Trigger explosion when a ship transitions from alive → dead
      if (this.prevAlive[shipData.id] === true && !shipData.alive) {
        const { cx, cy } = this.gameToCanvas(shipData.x, shipData.y);
        this.particles.explode(cx, cy, color, 25);
      }
      this.prevAlive[shipData.id] = shipData.alive;

      if (!shipData.alive && !this.trails[shipData.id]) continue;
      if (!this.trails[shipData.id]) {
        this.trails[shipData.id] = [];
      }
      if (shipData.alive) {
        const { cx, cy } = this.gameToCanvas(shipData.x, shipData.y);
        this.trails[shipData.id].push({ x: cx, y: cy });
        if (this.trails[shipData.id].length > 100) {
          this.trails[shipData.id].shift();
        }
      }
    }

    // 6. Render trails
    for (const shipData of tickRecord.ships) {
      const trail = this.trails[shipData.id];
      if (!trail || trail.length < 2) continue;
      const playerIdx = parseInt(shipData.id.charAt(1)) - 1;
      const color = PLAYER_COLORS[playerIdx % PLAYER_COLORS.length];
      renderTrails(ctx, trail, color);
    }

    // 7. Render ships
    for (const shipData of tickRecord.ships) {
      if (!shipData.alive) continue;
      const { cx, cy } = this.gameToCanvas(shipData.x, shipData.y);
      const playerIdx = parseInt(shipData.id.charAt(1)) - 1;
      const color = PLAYER_COLORS[playerIdx % PLAYER_COLORS.length];
      renderShip(ctx, cx, cy, color);
    }

    // 7b. Render particles (explosions)
    this.particles.render(ctx);

    // 8. Tick/score overlay on canvas
    ctx.fillStyle = THEME.gold;
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Tick: ${tickRecord.tick}/200`, 8, h - 8);
    ctx.textAlign = 'right';
    const scoreText = tickRecord.scores.map((s, i) => `P${i + 1}: ${s}`).join('  ');
    ctx.fillText(scoreText, w - 8, h - 8);
  }

  /**
   * Render the initial state (suns and zone, no ships yet).
   */
  renderInitial(suns: ReadonlyArray<Sun>, zone: { x: number; y: number; radius: number }): void {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const ctx = this.ctx;

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, w, h);

    if (this.starfieldCanvas) {
      renderStarfield(ctx, this.starfieldCanvas);
    }

    for (let i = 0; i < suns.length; i++) {
      const sun = suns[i];
      const { cx, cy } = this.gameToCanvas(sun.x, sun.y);
      const r = this.scaleToCanvas(sun.radius);
      renderSun(ctx, cx, cy, r, sun.mass, i);
    }

    const { cx: zx, cy: zy } = this.gameToCanvas(zone.x, zone.y);
    const zr = this.scaleToCanvas(zone.radius);
    renderZone(ctx, zx, zy, zr);
  }
}
