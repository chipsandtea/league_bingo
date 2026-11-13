export type GameNumber = 1 | 2 | 3 | 4 | 5;

export const GAME_NUMBERS: readonly GameNumber[] = [1, 2, 3, 4, 5];

export interface PromptsConfig {
  eventId: string;
  title: string;
  subtitle: string;
  freeSpace: string;
  prompts: string[];
}

export interface GameCardState {
  seed: number;
  promptIndices: number[];
  marksMask: number;
  celebratedLines: number;
  celebratedBlackout: boolean;
}

export interface SeriesBingoState {
  version: 1;
  eventId: string;
  poolLength: number;
  activeGame: GameNumber;
  celebratedStreak: number;
  games: Partial<Record<GameNumber, GameCardState>>;
}

export interface BoardEvaluation {
  winningLines: readonly (readonly number[])[];
  winningCells: Set<number>;
  checkedPromptsCount: number;
  lineCount: number;
  isBlackout: boolean;
  hasBingo: boolean;
  milestoneLabel: string;
}

export interface GameScoreBreakdown {
  game: GameNumber;
  hasMarks: boolean;
  checkedPromptsCount: number;
  lineCount: number;
  isBlackout: boolean;
  streakCount: number;
  streakBonusPoints: number;
  totalGamePoints: number;
  evaluation: BoardEvaluation;
}

export interface RankTier {
  name: string;
  tierKey: string;
  minPoints: number;
  nextTierName: string | null;
  nextTierMinPoints: number | null;
}

export interface SeriesScoreSummary {
  totalPoints: number;
  rank: RankTier;
  activeStreak: number;
  isStreakCarryover: boolean;
  nextStreakPotentialBonus: number;
  bestStreak: number;
  totalBingos: number;
  perGame: Record<GameNumber, GameScoreBreakdown>;
}
