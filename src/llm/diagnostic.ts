import type { SimulationResult, GameConfig } from '../types';

export interface DiagnosticReport {
  game: string;
  reportType: string;
  seed: number;
  totalTicks: number;
  ticksSimulated: number;
  positiveScore: number;
  bestShipScore: number;
  shipsAlive: number;
  shipsCrashed: number;
  totalFuelUsed: number;
  avgFuelPerShip: number;
  totalTicksInZone: number;
  perShip: Array<{
    id: string;
    alive: boolean;
    crashedTick: number | null;
    crashedInto: string | null;
    fuelRemaining: number;
    ticksInZone: number;
  }>;
  summary: string;
}

/**
 * Generate a diagnostic report from simulation results.
 */
export function generateDiagnostic(
  result: SimulationResult,
  config: GameConfig
): DiagnosticReport {
  const totalScore = result.finalScores.reduce((a, b) => a + b, 0);
  const shipsAlive = result.shipStats.filter(s => s.alive).length;
  const shipsCrashed = result.shipStats.filter(s => !s.alive).length;
  const totalFuelUsed = result.shipStats.reduce(
    (sum, s) => sum + (config.fuelStart - s.fuelRemaining), 0
  );
  const totalTicksInZone = result.shipStats.reduce((sum, s) => sum + s.ticksInZone, 0);

  let summary = '';
  if (totalScore === 0) {
    summary = 'No points scored. Ships may have crashed early or never reached the scoring zone.';
  } else if (totalScore < 50) {
    summary = `Low score (${totalScore}). Ships reached the zone occasionally but struggled to stay in it.`;
  } else if (totalScore < 150) {
    summary = `Moderate score (${totalScore}). Good zone tracking but room for improvement.`;
  } else {
    summary = `Strong score (${totalScore}). Effective zone tracking and fuel management.`;
  }

  if (shipsCrashed > 0) {
    summary += ` ${shipsCrashed} ship(s) crashed into suns.`;
  }

  return {
    game: 'Gravwell GPT',
    reportType: 'compact_post_run_bot_improvement_diagnostic',
    seed: config.seed,
    totalTicks: config.totalTicks,
    ticksSimulated: result.ticks.length,
    positiveScore: totalScore,
    bestShipScore: Math.max(...result.shipStats.map(s => s.ticksInZone)),
    shipsAlive,
    shipsCrashed,
    totalFuelUsed,
    avgFuelPerShip: totalFuelUsed / config.shipsPerPlayer,
    totalTicksInZone,
    perShip: result.shipStats,
    summary,
  };
}

/**
 * Generate a diagnostic report for a specific player from multi-player simulation results.
 */
export function generatePlayerDiagnostic(
  result: SimulationResult,
  config: GameConfig,
  playerId: number
): DiagnosticReport {
  const prefix = `P${playerId + 1}`;
  const playerShips = result.shipStats.filter(s => s.id.startsWith(prefix));
  const playerScore = result.finalScores[playerId];

  const shipsAlive = playerShips.filter(s => s.alive).length;
  const shipsCrashed = playerShips.filter(s => !s.alive).length;
  const totalFuelUsed = playerShips.reduce(
    (sum, s) => sum + (config.fuelStart - s.fuelRemaining), 0
  );
  const totalTicksInZone = playerShips.reduce((sum, s) => sum + s.ticksInZone, 0);

  let summary = '';
  if (playerScore === 0) {
    summary = 'No points scored. Ships may have crashed early or never reached the scoring zone.';
  } else if (playerScore < 50) {
    summary = `Low score (${playerScore}). Ships reached the zone occasionally but struggled to stay in it.`;
  } else if (playerScore < 150) {
    summary = `Moderate score (${playerScore}). Good zone tracking but room for improvement.`;
  } else {
    summary = `Strong score (${playerScore}). Effective zone tracking and fuel management.`;
  }

  if (shipsCrashed > 0) {
    summary += ` ${shipsCrashed} ship(s) crashed into suns.`;
  }

  return {
    game: 'Gravwell GPT',
    reportType: 'compact_post_run_bot_improvement_diagnostic',
    seed: config.seed,
    totalTicks: config.totalTicks,
    ticksSimulated: result.ticks.length,
    positiveScore: playerScore,
    bestShipScore: playerShips.length > 0 ? Math.max(...playerShips.map(s => s.ticksInZone)) : 0,
    shipsAlive,
    shipsCrashed,
    totalFuelUsed,
    avgFuelPerShip: totalFuelUsed / config.shipsPerPlayer,
    totalTicksInZone,
    perShip: playerShips,
    summary,
  };
}
