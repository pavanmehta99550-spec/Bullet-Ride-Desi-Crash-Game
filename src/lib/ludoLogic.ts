// Mathematical representation of standard 15x15 Ludo Board

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export interface GridCoord {
  r: number; // Row (0-14)
  c: number; // Col (0-14)
}

// Clockwise 52 outer track steps starting from Red Start (6, 1)
export const TRACK_CELLS: GridCoord[] = [
  /* 0 - Red Start (Safe) */ { r: 6, c: 1 },
  /* 1 */ { r: 6, c: 2 },
  /* 2 */ { r: 6, c: 3 },
  /* 3 */ { r: 6, c: 4 },
  /* 4 */ { r: 6, c: 5 },
  /* 5 */ { r: 5, c: 6 },
  /* 6 */ { r: 4, c: 6 },
  /* 7 */ { r: 3, c: 6 },
  /* 8 - Safe Star */ { r: 2, c: 6 },
  /* 9 */ { r: 1, c: 6 },
  /* 10 */ { r: 0, c: 6 },
  /* 11 */ { r: 0, c: 7 },
  /* 12 */ { r: 0, c: 8 },
  /* 13 - Green Start (Safe) */ { r: 1, c: 8 },
  /* 14 */ { r: 2, c: 8 },
  /* 15 */ { r: 3, c: 8 },
  /* 16 */ { r: 4, c: 8 },
  /* 17 */ { r: 5, c: 8 },
  /* 18 */ { r: 6, c: 9 },
  /* 19 */ { r: 6, c: 10 },
  /* 20 */ { r: 6, c: 11 },
  /* 21 - Safe Star */ { r: 6, c: 12 },
  /* 22 */ { r: 6, c: 13 },
  /* 23 */ { r: 6, c: 14 },
  /* 24 */ { r: 7, c: 14 },
  /* 25 */ { r: 8, c: 14 },
  /* 26 - Yellow Start (Safe) */ { r: 8, c: 13 },
  /* 27 */ { r: 8, c: 12 },
  /* 28 */ { r: 8, c: 11 },
  /* 29 */ { r: 8, c: 10 },
  /* 30 */ { r: 8, c: 9 },
  /* 31 */ { r: 9, c: 8 },
  /* 32 */ { r: 10, c: 8 },
  /* 33 */ { r: 11, c: 8 },
  /* 34 - Safe Star */ { r: 12, c: 8 },
  /* 35 */ { r: 13, c: 8 },
  /* 36 */ { r: 14, c: 8 },
  /* 37 */ { r: 14, c: 7 },
  /* 38 */ { r: 14, c: 6 },
  /* 39 - Blue Start (Safe) */ { r: 13, c: 6 },
  /* 40 */ { r: 12, c: 6 },
  /* 41 */ { r: 11, c: 6 },
  /* 42 */ { r: 10, c: 6 },
  /* 43 */ { r: 9, c: 6 },
  /* 44 */ { r: 8, c: 5 },
  /* 45 */ { r: 8, c: 4 },
  /* 46 */ { r: 8, c: 3 },
  /* 47 - Safe Star */ { r: 8, c: 2 },
  /* 48 */ { r: 8, c: 1 },
  /* 49 */ { r: 8, c: 0 },
  /* 50 */ { r: 7, c: 0 },
  /* 51 */ { r: 6, c: 0 }
];

// Star Safe indices on the 52-cell track
export const SAFE_TRACK_INDICES = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);

// Starting offsets on TRACK_CELLS
export const COLOR_START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39
};

// 5 Home Run steps for each player
export const HOME_RUN_CELLS: Record<LudoColor, GridCoord[]> = {
  red: [
    { r: 7, c: 1 },
    { r: 7, c: 2 },
    { r: 7, c: 3 },
    { r: 7, c: 4 },
    { r: 7, c: 5 }
  ],
  green: [
    { r: 1, c: 7 },
    { r: 2, c: 7 },
    { r: 3, c: 7 },
    { r: 4, c: 7 },
    { r: 5, c: 7 }
  ],
  yellow: [
    { r: 7, c: 13 },
    { r: 7, c: 12 },
    { r: 7, c: 11 },
    { r: 7, c: 10 },
    { r: 7, c: 9 }
  ],
  blue: [
    { r: 13, c: 7 },
    { r: 12, c: 7 },
    { r: 11, c: 7 },
    { r: 10, c: 7 },
    { r: 9, c: 7 }
  ]
};

// Center Goal coordinate (7, 7)
export const CENTER_GOAL: Record<LudoColor, GridCoord> = {
  red: { r: 7, c: 6.2 },
  green: { r: 6.2, c: 7 },
  yellow: { r: 7, c: 7.8 },
  blue: { r: 7.8, c: 7 }
};

// 4 Yard/Base token slots for each color (in row, col coordinates within the 6x6 base)
export const BASE_TOKEN_COORDS: Record<LudoColor, GridCoord[]> = {
  red: [
    { r: 1.5, c: 1.5 },
    { r: 1.5, c: 3.5 },
    { r: 3.5, c: 1.5 },
    { r: 3.5, c: 3.5 }
  ],
  green: [
    { r: 1.5, c: 10.5 },
    { r: 1.5, c: 12.5 },
    { r: 3.5, c: 10.5 },
    { r: 3.5, c: 12.5 }
  ],
  yellow: [
    { r: 10.5, c: 10.5 },
    { r: 10.5, c: 12.5 },
    { r: 12.5, c: 10.5 },
    { r: 12.5, c: 12.5 }
  ],
  blue: [
    { r: 10.5, c: 1.5 },
    { r: 10.5, c: 3.5 },
    { r: 12.5, c: 1.5 },
    { r: 12.5, c: 3.5 }
  ]
};

export interface LudoToken {
  id: number; // 0, 1, 2, 3
  color: LudoColor;
  step: number; // -1 = In Yard, 0 = At Start, 1..50 = Main Track, 51..55 = Home Run, 56 = Reached Home Goal
}

export const STEP_IN_YARD = -1;
export const STEP_START = 0;
export const STEP_HOME_RUN_START = 51;
export const STEP_GOAL = 56;

// Convert a token's step into its global 0..51 track index if on main track
export function getGlobalTrackIndex(color: LudoColor, step: number): number | null {
  if (step < 0 || step > 50) return null;
  const startOffset = COLOR_START_OFFSET[color];
  return (startOffset + step) % 52;
}

// Get the visual (r, c) coordinate for rendering
export function getTokenCoord(token: LudoToken): GridCoord {
  if (token.step === STEP_IN_YARD) {
    return BASE_TOKEN_COORDS[token.color][token.id];
  }
  if (token.step >= STEP_START && token.step <= 50) {
    const trackIdx = getGlobalTrackIndex(token.color, token.step)!;
    return TRACK_CELLS[trackIdx];
  }
  if (token.step >= STEP_HOME_RUN_START && token.step < STEP_GOAL) {
    const homeRunIndex = token.step - STEP_HOME_RUN_START;
    return HOME_RUN_CELLS[token.color][homeRunIndex];
  }
  return CENTER_GOAL[token.color];
}

// Check if a token can move given a dice roll
export function canTokenMove(token: LudoToken, roll: number): boolean {
  if (token.step === STEP_GOAL) return false;
  
  if (token.step === STEP_IN_YARD) {
    // Only a roll of 6 brings a token out
    return roll === 6;
  }
  
  // Can move forward up to exactly STEP_GOAL (56)
  return token.step + roll <= STEP_GOAL;
}

// Calculate the next step of a token
export function calculateNextStep(token: LudoToken, roll: number): number {
  if (token.step === STEP_IN_YARD) {
    return roll === 6 ? STEP_START : STEP_IN_YARD;
  }
  return token.step + roll;
}

export const COLOR_CONFIG: Record<LudoColor, {
  name: string;
  hindiName: string;
  hex: string;
  glow: string;
  bgGrad: string;
  accent: string;
  border: string;
  baseBg: string;
}> = {
  red: {
    name: 'Red',
    hindiName: 'लाल (Red)',
    hex: '#E52521',
    glow: 'rgba(229, 37, 33, 0.6)',
    bgGrad: 'from-[#E52521] to-[#B71C1C]',
    accent: '#FF5252',
    border: '#B71C1C',
    baseBg: '#E52521'
  },
  green: {
    name: 'Green',
    hindiName: 'हरा (Green)',
    hex: '#00A651',
    glow: 'rgba(0, 166, 81, 0.6)',
    bgGrad: 'from-[#00A651] to-[#007A3D]',
    accent: '#2ECC71',
    border: '#007A3D',
    baseBg: '#00A651'
  },
  yellow: {
    name: 'Yellow',
    hindiName: 'पीला (Yellow)',
    hex: '#FFC000',
    glow: 'rgba(255, 192, 0, 0.6)',
    bgGrad: 'from-[#FFC000] to-[#E6A800]',
    accent: '#FFE066',
    border: '#CC9600',
    baseBg: '#FFC000'
  },
  blue: {
    name: 'Blue',
    hindiName: 'नीला (Blue)',
    hex: '#0070BA',
    glow: 'rgba(0, 112, 186, 0.6)',
    bgGrad: 'from-[#0070BA] to-[#004B87]',
    accent: '#38B6FF',
    border: '#004B87',
    baseBg: '#0070BA'
  }
};
