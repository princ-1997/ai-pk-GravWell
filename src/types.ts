export interface Vec2 {
  x: number;
  y: number;
}

export interface Sun {
  id: number;
  x: number;
  y: number;
  mass: number;
  radius: number;
}

export interface Ship {
  id: string;        // e.g. "P1S1"
  playerId: number;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  fuel: number;
  alive: boolean;
  condition: number;
}

export interface Zone {
  x: number;
  y: number;
  radius: number;
}

export interface ZonePrediction {
  tick: number;
  x: number;
  y: number;
}

export interface DecideContext {
  ship: Readonly<{
    id: string;
    playerId: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    fuel: number;
    alive: boolean;
    condition: number;
  }>;
  otherShips: ReadonlyArray<Readonly<{
    id: string;
    playerId: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    fuel: number;
    alive: boolean;
  }>>;
  suns: ReadonlyArray<Readonly<Sun>>;
  zone: Readonly<Zone>;
  prediction: ReadonlyArray<Readonly<ZonePrediction>>;
  radius: number;
  tick: number;
  totalTicks: number;
  seed: number;
  // Helper functions
  distanceTo(a: Vec2, b: Vec2): number;
  nearestSun(ship: Vec2): Sun;
  nearestSunDist(ship: Vec2): number;
  push(from: Vec2, to: Vec2, strength: number): Vec2;
  nearestAlly(): { id: string; x: number; y: number; vx: number; vy: number } | null;
}

export type DecideFunction = (ctx: DecideContext) => Vec2;

export interface GameConfig {
  seed: number;
  totalTicks: number;
  playerCount: number;
  shipsPerPlayer: number;
  fuelStart: number;
  maxThrust: number;
  conditionMax: number;
  predictionTicks: number;
  arenaSize: number;
  gravityConstant: number;
  gravitySoftening: number;
  sunCount: number;
  zoneBaseRadius: number;
}

export interface TickRecord {
  tick: number;
  ships: Array<{
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    fuel: number;
    alive: boolean;
    thrustX: number;
    thrustY: number;
  }>;
  zone: { x: number; y: number; radius: number };
  scores: number[];
}

export interface SimulationResult {
  ticks: TickRecord[];
  finalScores: number[];
  shipStats: Array<{
    id: string;
    alive: boolean;
    crashedTick: number | null;
    crashedInto: string | null;
    fuelRemaining: number;
    ticksInZone: number;
  }>;
}

export interface ArenaData {
  suns: Sun[];
  zonePath: Vec2[];
  shipStartPositions: Array<{ x: number; y: number; vx: number; vy: number }>;
}

export interface BotEntry {
  playerId: number;
  modelName: string;
  code: string;
  decideFunction: DecideFunction | null;
}
