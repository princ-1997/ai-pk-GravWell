export { INITIAL_ELO } from '../constants';
const K = 32;

function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

/**
 * Compute pairwise Elo deltas for an N-way match.
 *
 * @param elos   Current ratings for each bot, in bot-index order.
 * @param rank   Bot indices sorted by avg score (best first).
 * @param avgScores  Final averaged score for each bot.
 * @returns Delta Elo array (same index order as elos/avgScores). Applied by caller.
 */
export function applyMatchElo(
  elos: number[],
  rank: number[],
  avgScores: number[]
): number[] {
  const n = elos.length;
  const deltas = new Array(n).fill(0);

  // All unique pairs
  for (let ai = 0; ai < n; ai++) {
    for (let bi = ai + 1; bi < n; bi++) {
      const a = ai;
      const b = bi;
      const ea = expectedScore(elos[a], elos[b]);
      const eb = 1 - ea;

      let resultA: number;
      if (avgScores[a] > avgScores[b]) {
        resultA = 1;
      } else if (avgScores[a] < avgScores[b]) {
        resultA = 0;
      } else {
        resultA = 0.5;
      }

      deltas[a] += K * (resultA - ea);
      deltas[b] += K * ((1 - resultA) - eb);
    }
  }

  return deltas;
}

/**
 * Given avg scores and rank, tally W/L/D for each bot against all opponents.
 * Returns { wins, losses, draws } accumulated across all pairs.
 */
export function tallyRecords(
  avgScores: number[]
): Array<{ wins: number; losses: number; draws: number }> {
  const n = avgScores.length;
  const records = Array.from({ length: n }, () => ({ wins: 0, losses: 0, draws: 0 }));

  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (avgScores[a] > avgScores[b]) {
        records[a].wins++;
        records[b].losses++;
      } else if (avgScores[a] < avgScores[b]) {
        records[a].losses++;
        records[b].wins++;
      } else {
        records[a].draws++;
        records[b].draws++;
      }
    }
  }

  return records;
}
