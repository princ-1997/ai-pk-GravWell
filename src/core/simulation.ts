import type {
  ArenaData,
  DecideFunction,
  GameConfig,
  Ship,
  SimulationResult,
  TickRecord,
  Vec2,
} from '../types';
import { generateArena } from './arena';
import { buildContext } from './context';
import { calculateGravity, checkSunCollision, clampThrust, isInArena, isInZone, verletStep } from './physics';
import { getZonePredictions, getZoneRadius } from './zone';

export class Simulation {
  config: GameConfig;
  arena: ArenaData;
  ships: Ship[] = [];
  scores: number[] = [];
  tick = 0;
  ticks: TickRecord[] = [];
  shipStats: SimulationResult['shipStats'] = [];

  constructor(config: GameConfig) {
    this.config = config;
    this.arena = generateArena(config);
    this.reset();
  }

  reset(): void {
    this.tick = 0;
    this.ticks = [];
    this.ships = [];
    this.scores = new Array(this.config.playerCount).fill(0);

    // Create ships from arena start positions
    let posIdx = 0;
    for (let p = 0; p < this.config.playerCount; p++) {
      for (let s = 0; s < this.config.shipsPerPlayer; s++) {
        const pos = this.arena.shipStartPositions[posIdx++];
        this.ships.push({
          id: `P${p + 1}S${s + 1}`,
          playerId: p,
          x: pos.x,
          y: pos.y,
          previousX: pos.x - pos.vx,
          previousY: pos.y - pos.vy,
          vx: pos.vx,
          vy: pos.vy,
          fuel: this.config.fuelStart,
          alive: true,
          condition: this.config.conditionMax,
        });
      }
    }

    // Initialize ship stats
    this.shipStats = this.ships.map(ship => ({
      id: ship.id,
      alive: true,
      crashedTick: null,
      crashedInto: null,
      fuelRemaining: this.config.fuelStart,
      ticksInZone: 0,
    }));
  }

  /**
   * Get current zone state.
   */
  getZone(): { x: number; y: number; radius: number } {
    const pos = this.arena.zonePath[Math.min(this.tick, this.arena.zonePath.length - 1)];
    const radius = getZoneRadius(this.tick, this.config.totalTicks, this.config.zoneBaseRadius);
    return { x: pos.x, y: pos.y, radius };
  }

  /**
   * Run a single tick of the simulation.
   * @param deciders - Array of decide functions, one per player
   */
  stepTick(deciders: Array<DecideFunction | null>): void {
    if (this.tick >= this.config.totalTicks) return;

    const zone = this.getZone();
    const predictions = getZonePredictions(
      this.tick,
      this.config.predictionTicks,
      this.arena.zonePath,
      this.config.totalTicks,
      this.config.zoneBaseRadius
    );

    const shipThrusts: Vec2[] = [];

    // For each alive ship, get thrust from decide()
    for (const ship of this.ships) {
      if (!ship.alive) {
        shipThrusts.push({ x: 0, y: 0 });
        continue;
      }

      const decider = deciders[ship.playerId] || null;
      let rawThrust: Vec2 = { x: 0, y: 0 };

      if (decider && ship.fuel > 0) {
        try {
          const ctx = buildContext(
            ship,
            this.ships,
            this.arena.suns,
            zone,
            predictions,
            this.tick,
            this.config.totalTicks,
            this.config.seed
          );
          const result = decider(ctx);
          if (result && typeof result.x === 'number' && typeof result.y === 'number' &&
              isFinite(result.x) && isFinite(result.y)) {
            rawThrust = { x: result.x, y: result.y };
          }
        } catch {
          // decide() threw an error - no thrust
          rawThrust = { x: 0, y: 0 };
        }
      }

      // Clamp thrust and consume fuel
      const { thrust: clamped, magnitude: thrustMag } = clampThrust(rawThrust, this.config.maxThrust);
      if (ship.fuel >= thrustMag) {
        ship.fuel -= thrustMag;
        shipThrusts.push(clamped);
      } else if (ship.fuel > 0) {
        // Partial fuel: scale thrust to remaining fuel
        const scale = ship.fuel / thrustMag;
        ship.fuel = 0;
        shipThrusts.push({ x: clamped.x * scale, y: clamped.y * scale });
      } else {
        shipThrusts.push({ x: 0, y: 0 });
      }
    }

    // Apply physics and check collisions
    for (let i = 0; i < this.ships.length; i++) {
      const ship = this.ships[i];
      if (!ship.alive) continue;

      const gravity = calculateGravity(
        ship,
        this.arena.suns,
        this.config.gravityConstant,
        this.config.gravitySoftening
      );

      verletStep(ship, gravity, shipThrusts[i]);

      // Check sun collision
      const hitSun = checkSunCollision(ship, this.arena.suns);
      if (hitSun) {
        ship.alive = false;
        const stat = this.shipStats.find(s => s.id === ship.id)!;
        stat.alive = false;
        stat.crashedTick = this.tick;
        stat.crashedInto = `Sun${hitSun.id}`;
        continue;
      }

      // Check scoring
      if (isInArena(ship, this.config.arenaSize) && isInZone(ship, zone)) {
        this.scores[ship.playerId]++;
        const stat = this.shipStats.find(s => s.id === ship.id)!;
        stat.ticksInZone++;
      }
    }

    // Record tick
    this.ticks.push({
      tick: this.tick,
      ships: this.ships.map((ship, i) => ({
        id: ship.id,
        x: ship.x,
        y: ship.y,
        vx: ship.vx,
        vy: ship.vy,
        fuel: ship.fuel,
        alive: ship.alive,
        thrustX: shipThrusts[i].x,
        thrustY: shipThrusts[i].y,
      })),
      zone: { ...zone },
      scores: [...this.scores],
    });

    this.tick++;
  }

  /**
   * Run the full simulation to completion.
   */
  runToCompletion(deciders: Array<DecideFunction | null>): SimulationResult {
    while (this.tick < this.config.totalTicks) {
      this.stepTick(deciders);
    }

    // Update final stats
    for (const stat of this.shipStats) {
      const ship = this.ships.find(s => s.id === stat.id)!;
      stat.fuelRemaining = ship.fuel;
      stat.alive = ship.alive;
    }

    return {
      ticks: this.ticks,
      finalScores: [...this.scores],
      shipStats: this.shipStats,
    };
  }
}
