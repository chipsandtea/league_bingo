import { evaluateBoard, FREE_MASK, FULL_BOARD_MASK } from './bingo';
import {
  GAME_NUMBERS,
  type GameCardState,
  type GameNumber,
  type PromptsConfig,
  type SeriesBingoState,
} from './types';

const STORAGE_KEY = 'league_bingo_state_v1';
const RESTORE_HASH_PREFIX = '#restore=';
const PROMPTS_PER_CARD = 24;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRandomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    // Avoid 0 so truthy checks stay straightforward
    return (arr[0] >>> 0) || 0x9e3779b9;
  }
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

export function hashString36(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function drawShuffledIndices(poolLength: number, seed: number): number[] {
  const safePoolLength = Math.max(1, poolLength);
  const pool: number[] = [];

  // Fill until we have at least 24 candidate indices (normally poolLength is 25+)
  while (pool.length < Math.max(safePoolLength, PROMPTS_PER_CARD)) {
    for (let i = 0; i < safePoolLength; i++) {
      pool.push(i);
    }
  }

  const rng = mulberry32(seed);
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  return pool.slice(0, PROMPTS_PER_CARD);
}

export function createGameCard(poolLength: number, seed?: number): GameCardState {
  const actualSeed = (seed !== undefined ? seed >>> 0 : generateRandomSeed()) || 1;
  return {
    seed: actualSeed,
    promptIndices: drawShuffledIndices(poolLength, actualSeed),
    marksMask: FREE_MASK,
    celebratedLines: 0,
    celebratedBlackout: false,
  };
}

export function createFreshSeriesState(config: PromptsConfig): SeriesBingoState {
  const poolLength = config.prompts.length;
  return {
    version: 1,
    eventId: config.eventId,
    poolLength,
    activeGame: 1,
    celebratedStreak: 0,
    games: {
      1: createGameCard(poolLength),
    },
  };
}

export function ensureGameCard(
  state: SeriesBingoState,
  game: GameNumber,
): GameCardState {
  let existing = state.games[game];
  if (!existing) {
    existing = createGameCard(state.poolLength);
    state.games[game] = existing;
  }
  return existing;
}

function isValidGameNumber(val: unknown): val is GameNumber {
  return val === 1 || val === 2 || val === 3 || val === 4 || val === 5;
}

function sanitizeCardState(
  raw: unknown,
  poolLength: number,
): GameCardState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.seed !== 'number' || !Number.isFinite(obj.seed)) return null;
  if (typeof obj.marksMask !== 'number' || !Number.isFinite(obj.marksMask)) {
    return null;
  }

  const seed = (obj.seed >>> 0) || 1;
  let promptIndices: number[];

  if (
    Array.isArray(obj.promptIndices) &&
    obj.promptIndices.length === PROMPTS_PER_CARD &&
    obj.promptIndices.every(
      (idx) => typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < poolLength,
    )
  ) {
    promptIndices = obj.promptIndices as number[];
  } else {
    promptIndices = drawShuffledIndices(poolLength, seed);
  }

  const marksMask = ((obj.marksMask | FREE_MASK) & FULL_BOARD_MASK) >>> 0;
  const evalNow = evaluateBoard(marksMask);

  const celebratedLines =
    typeof obj.celebratedLines === 'number' && Number.isFinite(obj.celebratedLines)
      ? Math.max(0, Math.min(12, Math.floor(obj.celebratedLines)))
      : evalNow.lineCount;

  const celebratedBlackout =
    typeof obj.celebratedBlackout === 'boolean'
      ? obj.celebratedBlackout
      : evalNow.isBlackout;

  return {
    seed,
    promptIndices,
    marksMask,
    celebratedLines,
    celebratedBlackout,
  };
}

function sanitizeSeriesState(
  raw: unknown,
  config: PromptsConfig,
): SeriesBingoState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return null;
  if (obj.eventId !== config.eventId) return null;

  const poolLength = config.prompts.length;
  const activeGame = isValidGameNumber(obj.activeGame) ? obj.activeGame : 1;
  const celebratedStreak =
    typeof obj.celebratedStreak === 'number' && Number.isFinite(obj.celebratedStreak)
      ? Math.max(0, Math.min(5, Math.floor(obj.celebratedStreak)))
      : 0;

  const games: Partial<Record<GameNumber, GameCardState>> = {};
  if (obj.games && typeof obj.games === 'object') {
    const rawGames = obj.games as Record<string, unknown>;
    for (const g of GAME_NUMBERS) {
      const sanitized = sanitizeCardState(rawGames[String(g)], poolLength);
      if (sanitized) {
        games[g] = sanitized;
      }
    }
  }

  const state: SeriesBingoState = {
    version: 1,
    eventId: config.eventId,
    poolLength,
    activeGame,
    celebratedStreak,
    games,
  };

  ensureGameCard(state, state.activeGame);
  return state;
}

export function isLocalStorageAvailable(): boolean {
  try {
    const probeKey = '__league_bingo_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

export function saveState(state: SeriesBingoState): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function encodeRestoreUrl(state: SeriesBingoState): string {
  const eventHash = hashString36(state.eventId);
  const gameSegments: string[] = [];

  for (const g of GAME_NUMBERS) {
    const card = state.games[g];
    if (!card) continue;
    const seed36 = (card.seed >>> 0).toString(36);
    const mask36 = ((card.marksMask | FREE_MASK) & FULL_BOARD_MASK).toString(36);
    gameSegments.push(`${g}.${seed36}.${mask36}`);
  }

  const token = `1~${eventHash}~${state.activeGame}~${gameSegments.join('_')}`;
  const url = new URL(window.location.href);
  url.hash = `restore=${token}`;
  return url.toString();
}

export function decodeRestoreHash(
  hash: string,
  config: PromptsConfig,
): SeriesBingoState | null {
  if (!hash.startsWith(RESTORE_HASH_PREFIX)) return null;
  const token = decodeURIComponent(hash.slice(RESTORE_HASH_PREFIX.length)).trim();
  const parts = token.split('~');
  if (parts.length !== 4 || parts[0] !== '1') return null;

  const [, eventHash, activeStr, gamesStr] = parts;
  if (eventHash !== hashString36(config.eventId)) {
    return null;
  }

  const activeNum = Number.parseInt(activeStr, 10);
  const activeGame: GameNumber = isValidGameNumber(activeNum) ? activeNum : 1;
  const poolLength = config.prompts.length;
  const games: Partial<Record<GameNumber, GameCardState>> = {};

  if (gamesStr) {
    for (const seg of gamesStr.split('_')) {
      const segParts = seg.split('.');
      if (segParts.length !== 3) continue;
      const gNum = Number.parseInt(segParts[0], 10);
      const seed = Number.parseInt(segParts[1], 36);
      const mask = Number.parseInt(segParts[2], 36);

      if (!isValidGameNumber(gNum)) continue;
      if (!Number.isFinite(seed) || !Number.isFinite(mask)) continue;

      const normalizedMask = ((mask | FREE_MASK) & FULL_BOARD_MASK) >>> 0;
      const evalBoard = evaluateBoard(normalizedMask);
      const cleanSeed = (seed >>> 0) || 1;

      games[gNum] = {
        seed: cleanSeed,
        promptIndices: drawShuffledIndices(poolLength, cleanSeed),
        marksMask: normalizedMask,
        celebratedLines: evalBoard.lineCount,
        celebratedBlackout: evalBoard.isBlackout,
      };
    }
  }

  // Compute current streak so restoring doesn't immediately re-blast streak confetti
  let runningStreak = 0;
  let maxStreak = 0;
  for (const g of GAME_NUMBERS) {
    const c = games[g];
    if (c && evaluateBoard(c.marksMask).lineCount >= 1) {
      runningStreak += 1;
      if (runningStreak > maxStreak) maxStreak = runningStreak;
    } else {
      runningStreak = 0;
    }
  }

  const restored: SeriesBingoState = {
    version: 1,
    eventId: config.eventId,
    poolLength,
    activeGame,
    celebratedStreak: maxStreak,
    games,
  };

  ensureGameCard(restored, restored.activeGame);
  return restored;
}

export interface LoadStateResult {
  state: SeriesBingoState;
  restoredFromUrl: boolean;
  storageAvailable: boolean;
}

export function loadOrCreateState(config: PromptsConfig): LoadStateResult {
  const storageAvailable = isLocalStorageAvailable();

  // 1. Check if user opened an explicit #restore=... transfer link
  const fromHash = decodeRestoreHash(window.location.hash, config);
  if (fromHash) {
    saveState(fromHash);
    // Strip #restore=... from the address bar so sharing the URL gives friends fresh cards
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', cleanUrl);
    return {
      state: fromHash,
      restoredFromUrl: true,
      storageAvailable,
    };
  }

  // 2. Otherwise restore from localStorage if available and matching eventId
  if (storageAvailable) {
    try {
      const rawJson = window.localStorage.getItem(STORAGE_KEY);
      if (rawJson) {
        const parsed: unknown = JSON.parse(rawJson);
        const sanitized = sanitizeSeriesState(parsed, config);
        if (sanitized) {
          return {
            state: sanitized,
            restoredFromUrl: false,
            storageAvailable,
          };
        }
      }
    } catch {
      // Fall through to fresh state if JSON was corrupted
    }
  }

  // 3. Initialize a brand-new series state and save immediately
  const fresh = createFreshSeriesState(config);
  saveState(fresh);
  return {
    state: fresh,
    restoredFromUrl: false,
    storageAvailable,
  };
}
