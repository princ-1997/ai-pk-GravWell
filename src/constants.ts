import type { GameConfig } from './types';

export const DEFAULT_CONFIG: GameConfig = {
  seed: 9001,
  totalTicks: 200,
  playerCount: 1,
  shipsPerPlayer: 3,
  fuelStart: 30,
  maxThrust: 1,
  conditionMax: 10,
  predictionTicks: 5,
  arenaSize: 100,
  gravityConstant: 0.003,
  gravitySoftening: 0.002,
  sunCount: 4,
  zoneBaseRadius: 10,
};

export const MAX_PLAYERS = 4;

export const LEADERBOARD_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const LEADERBOARD_ROUNDS = 5;

export const PLAYER_COLORS = [
  '#4488FF', // P1 - blue
  '#FF4444', // P2 - red
  '#44FF44', // P3 - green
  '#FFDD44', // P4 - yellow
];

export const THEME = {
  bg: '#0a0a0a',
  gold: '#FFD700',
  goldDim: '#B8960C',
  goldBright: '#FFE44D',
  text: '#FFD700',
  textDim: '#8B7500',
  panelBg: '#111111',
  panelBorder: '#333300',
  sunCore: '#FFD700',
  sunGlow: '#FF8C00',
  sunCorona: '#FF6600',
  // Per-sun color palettes — all within warm yellow/orange/amber color space
  sunPalettes: [
    { core: '#FFFBE6', glow: '#FFA500', corona: '#FF6600', outer: '#CC4400' }, // Orange
    { core: '#FFF8E0', glow: '#FFD700', corona: '#FFAA00', outer: '#CC8800' }, // Gold
    { core: '#FFF0E0', glow: '#FF8C00', corona: '#FF5500', outer: '#BB3300' }, // Deep amber
    { core: '#FFFAE8', glow: '#FFCC33', corona: '#FF9922', outer: '#CC7711' }, // Warm yellow
  ],
  zoneLine: '#FFFFFF',
  zoneFill: 'rgba(255, 255, 255, 0.05)',
};
