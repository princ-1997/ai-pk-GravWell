import type { GameConfig } from './types';

export const DEFAULT_CONFIG: GameConfig = {
  seed: 9001,
  totalTicks: 200,
  playerCount: 1,
  shipsPerPlayer: 3,
  fuelStart: 30,
  maxThrust: 1,
  conditionMax: 10,
  predictionTicks: 20,
  arenaSize: 100,
  gravityConstant: 0.003,
  gravitySoftening: 0.002,
  sunCount: 4,
  zoneBaseRadius: 10,
};

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
  zoneLine: '#FFFFFF',
  zoneFill: 'rgba(255, 255, 255, 0.05)',
};
