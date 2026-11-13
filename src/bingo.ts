import {
  GAME_NUMBERS,
  type BoardEvaluation,
  type GameCardState,
  type GameNumber,
  type GameScoreBreakdown,
  type PromptsConfig,
  type RankTier,
  type SeriesBingoState,
  type SeriesScoreSummary,
} from './types';

export const GRID_SIZE = 5;
export const TOTAL_CELLS = 25;
export const CENTER_INDEX = 12;
export const FREE_MASK = 1 << CENTER_INDEX;
export const FULL_BOARD_MASK = (1 << TOTAL_CELLS) - 1; // 0x1ffffff

export const SCORE_RULES = {
  PER_SQUARE: 25,
  FIRST_BINGO: 200,
  EXTRA_BINGO: 250,
  BLACKOUT_BONUS: 500,
  STREAK_STEP_BONUS: 150,
} as const;

export const WINNING_LINES: readonly (readonly number[])[] = [
  // Rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  // Columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  // Diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

interface TierSpec {
  name: string;
  tierKey: string;
  minPoints: number;
}

export const RANK_TIERS: readonly TierSpec[] = [
  { name: 'Unranked', tierKey: 'unranked', minPoints: 0 },
  { name: 'Iron', tierKey: 'iron', minPoints: 1 },
  { name: 'Bronze', tierKey: 'bronze', minPoints: 175 },
  { name: 'Silver', tierKey: 'silver', minPoints: 375 },
  { name: 'Gold', tierKey: 'gold', minPoints: 625 },
  { name: 'Platinum', tierKey: 'platinum', minPoints: 900 },
  { name: 'Emerald', tierKey: 'emerald', minPoints: 1200 },
  { name: 'Diamond', tierKey: 'diamond', minPoints: 1500 },
  { name: 'Master', tierKey: 'master', minPoints: 1800 },
  { name: 'Grandmaster', tierKey: 'grandmaster', minPoints: 2050 },
  { name: 'Challenger', tierKey: 'challenger', minPoints: 2300 },
];

export function getRankTier(points: number): RankTier {
  let matchedIndex = 0;
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (points >= RANK_TIERS[i].minPoints) {
      matchedIndex = i;
      break;
    }
  }
  const current = RANK_TIERS[matchedIndex];
  const next = matchedIndex + 1 < RANK_TIERS.length ? RANK_TIERS[matchedIndex + 1] : null;
  return {
    name: current.name,
    tierKey: current.tierKey,
    minPoints: current.minPoints,
    nextTierName: next ? next.name : null,
    nextTierMinPoints: next ? next.minPoints : null,
  };
}

export function isCellMarked(marksMask: number, cellIndex: number): boolean {
  if (cellIndex === CENTER_INDEX) return true;
  return (marksMask & (1 << cellIndex)) !== 0;
}

export function cellIndexToPromptSlot(cellIndex: number): number | null {
  if (cellIndex === CENTER_INDEX) return null;
  return cellIndex < CENTER_INDEX ? cellIndex : cellIndex - 1;
}

export function getCellText(
  cellIndex: number,
  card: GameCardState,
  config: PromptsConfig,
): string {
  const slot = cellIndexToPromptSlot(cellIndex);
  if (slot === null) {
    return config.freeSpace || 'FREE';
  }
  const promptIdx = card.promptIndices[slot];
  return config.prompts[promptIdx] ?? `Prompt ${slot + 1}`;
}

export function countCheckedPrompts(marksMask: number): number {
  let n = (marksMask & FULL_BOARD_MASK) & ~FREE_MASK;
  let count = 0;
  while (n !== 0) {
    n &= n - 1;
    count++;
  }
  return count;
}

export function evaluateBoard(marksMask: number): BoardEvaluation {
  const normalizedMask = (marksMask | FREE_MASK) & FULL_BOARD_MASK;
  const winningLines: (readonly number[])[] = [];
  const winningCells = new Set<number>();

  for (const line of WINNING_LINES) {
    if (line.every((idx) => (normalizedMask & (1 << idx)) !== 0)) {
      winningLines.push(line);
      for (const idx of line) {
        winningCells.add(idx);
      }
    }
  }

  const checkedPromptsCount = countCheckedPrompts(normalizedMask);
  const lineCount = winningLines.length;
  const isBlackout = normalizedMask === FULL_BOARD_MASK;

  let milestoneLabel = '';
  if (isBlackout) {
    milestoneLabel = 'PENTAKILL! (BLACKOUT)';
  } else if (lineCount === 1) {
    milestoneLabel = 'BINGO!';
  } else if (lineCount === 2) {
    milestoneLabel = 'DOUBLE BINGO!';
  } else if (lineCount === 3) {
    milestoneLabel = 'TRIPLE BINGO!';
  } else if (lineCount === 4) {
    milestoneLabel = 'QUADRA BINGO!';
  } else if (lineCount >= 5) {
    milestoneLabel = `${lineCount}x MULTI-BINGO!`;
  }

  return {
    winningLines,
    winningCells,
    checkedPromptsCount,
    lineCount,
    isBlackout,
    hasBingo: lineCount > 0,
    milestoneLabel,
  };
}

export function evaluateSeriesScore(state: SeriesBingoState): SeriesScoreSummary {
  const perGame = {} as Record<GameNumber, GameScoreBreakdown>;
  let runningStreak = 0;
  let bestStreak = 0;
  let totalPoints = 0;
  let totalBingos = 0;

  for (const game of GAME_NUMBERS) {
    const card = state.games[game];
    const evaluation = evaluateBoard(card ? card.marksMask : FREE_MASK);
    const { checkedPromptsCount, lineCount, isBlackout } = evaluation;

    const squarePoints = checkedPromptsCount * SCORE_RULES.PER_SQUARE;
    const linePoints =
      lineCount === 0
        ? 0
        : SCORE_RULES.FIRST_BINGO + (lineCount - 1) * SCORE_RULES.EXTRA_BINGO;
    const blackoutPoints = isBlackout ? SCORE_RULES.BLACKOUT_BONUS : 0;

    if (lineCount >= 1) {
      runningStreak += 1;
      if (runningStreak > bestStreak) {
        bestStreak = runningStreak;
      }
    } else {
      runningStreak = 0;
    }

    const streakCount = lineCount >= 1 ? runningStreak : 0;
    const streakBonusPoints =
      streakCount >= 2 ? (streakCount - 1) * SCORE_RULES.STREAK_STEP_BONUS : 0;
    const totalGamePoints =
      squarePoints + linePoints + blackoutPoints + streakBonusPoints;

    totalPoints += totalGamePoints;
    totalBingos += lineCount;

    perGame[game] = {
      game,
      hasMarks: checkedPromptsCount > 0,
      checkedPromptsCount,
      lineCount,
      isBlackout,
      streakCount,
      streakBonusPoints,
      totalGamePoints,
      evaluation,
    };
  }

  // Live streak display relative to the active game tab
  const currentBreakdown = perGame[state.activeGame];
  let activeStreak = 0;
  let isStreakCarryover = false;
  let nextStreakPotentialBonus = 0;

  if (currentBreakdown.lineCount >= 1) {
    activeStreak = currentBreakdown.streakCount;
    nextStreakPotentialBonus =
      state.activeGame < 5 ? activeStreak * SCORE_RULES.STREAK_STEP_BONUS : 0;
  } else if (state.activeGame > 1) {
    const prevBreakdown = perGame[(state.activeGame - 1) as GameNumber];
    const laterGameStarted = GAME_NUMBERS.some(
      (g) => g > state.activeGame && perGame[g].hasMarks,
    );

    if (prevBreakdown.lineCount >= 1 && !laterGameStarted) {
      activeStreak = prevBreakdown.streakCount;
      isStreakCarryover = true;
      nextStreakPotentialBonus = activeStreak * SCORE_RULES.STREAK_STEP_BONUS;
    }
  }

  return {
    totalPoints,
    rank: getRankTier(totalPoints),
    activeStreak,
    isStreakCarryover,
    nextStreakPotentialBonus,
    bestStreak,
    totalBingos,
    perGame,
  };
}

export function formatGameShareText(
  game: GameNumber,
  card: GameCardState,
  config: PromptsConfig,
  summary: SeriesScoreSummary,
): string {
  const gameScore = summary.perGame[game];
  const { evaluation } = gameScore;
  const statusTag = evaluation.milestoneLabel
    ? `${evaluation.milestoneLabel} • ${gameScore.totalGamePoints} pts`
    : `${evaluation.checkedPromptsCount}/24 Checked • ${gameScore.totalGamePoints} pts`;

  const streakSuffix =
    gameScore.streakCount >= 2 ? ` • 🔥 ${gameScore.streakCount}G Streak` : '';

  const rows: string[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    let rowStr = '';
    for (let c = 0; c < GRID_SIZE; c++) {
      const idx = r * GRID_SIZE + c;
      if (evaluation.winningCells.has(idx)) {
        rowStr += '🟨';
      } else if (isCellMarked(card.marksMask, idx)) {
        rowStr += '🟦';
      } else {
        rowStr += '⬛';
      }
    }
    rows.push(rowStr);
  }

  const lines = [
    `🏆 ${config.title} (Gen.G vs BLG) — Game ${game}`,
    `⭐ ${statusTag}${streakSuffix} | Series: ${summary.totalPoints.toLocaleString()} pts (${summary.rank.name})`,
    ...rows,
  ];

  if (evaluation.winningLines.length > 0) {
    const labels = evaluation.winningLines[0].map((idx) =>
      idx === CENTER_INDEX ? 'FREE' : getCellText(idx, card, config),
    );
    lines.push(`Winning Line: ${labels.join(' • ')}`);
  }

  return lines.join('\n');
}

export function formatSeriesScorecardText(
  config: PromptsConfig,
  summary: SeriesScoreSummary,
): string {
  const header = [
    `🏆 ${config.title} — Gen.G vs BLG Series Scorecard`,
    `👑 Final Score: ${summary.totalPoints.toLocaleString()} PTS (${summary.rank.name})`,
    `🔥 Best Bingo Streak: ${summary.bestStreak} ${summary.bestStreak === 1 ? 'Game' : 'Games'} | 🎯 Total Bingos: ${summary.totalBingos}`,
  ];

  const gameLines: string[] = [];
  for (const g of GAME_NUMBERS) {
    const gs = summary.perGame[g];
    if (!gs.hasMarks && gs.lineCount === 0) continue;

    const badge = gs.isBlackout
      ? 'PENTAKILL!'
      : gs.lineCount > 0
        ? `${gs.evaluation.milestoneLabel} (${gs.lineCount} ${gs.lineCount === 1 ? 'line' : 'lines'})`
        : 'No Bingo';
    const streakText =
      gs.streakCount >= 2
        ? ` • 🔥${gs.streakCount}G (+${gs.streakBonusPoints})`
        : gs.streakCount === 1
          ? ' • 🔥1G'
          : '';
    gameLines.push(
      `• Game ${g}: ${gs.totalGamePoints.toLocaleString()} pts — ${badge}, ${gs.checkedPromptsCount}/24 sq${streakText}`,
    );
  }

  if (gameLines.length === 0) {
    gameLines.push('• No games played yet — ready for Game 1!');
  }

  return [...header, ...gameLines].join('\n');
}
