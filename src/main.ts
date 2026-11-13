import './style.css';
import defaultPrompts from '../public/prompts.json';
import {
  CENTER_INDEX,
  evaluateSeriesScore,
  formatGameShareText,
  formatSeriesScorecardText,
  FREE_MASK,
  getCellText,
  GRID_SIZE,
  isCellMarked,
  SCORE_RULES,
  TOTAL_CELLS,
} from './bingo';
import { launchHextechBurst } from './confetti';
import {
  createGameCard,
  encodeRestoreUrl,
  ensureGameCard,
  loadOrCreateState,
  saveState,
} from './state';
import {
  GAME_NUMBERS,
  type GameNumber,
  type PromptsConfig,
  type SeriesBingoState,
} from './types';

function mustGetEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required DOM element #${id}`);
  }
  return el as T;
}

async function fetchPromptsConfig(): Promise<PromptsConfig> {
  try {
    const res = await fetch('./prompts.json', { cache: 'no-cache' });
    if (!res.ok) return defaultPrompts;
    const raw = (await res.json()) as Partial<PromptsConfig>;
    if (
      typeof raw.eventId === 'string' &&
      Array.isArray(raw.prompts) &&
      raw.prompts.length > 0 &&
      raw.prompts.every((p) => typeof p === 'string' && p.trim().length > 0)
    ) {
      return {
        eventId: raw.eventId.trim(),
        title: raw.title?.trim() || defaultPrompts.title,
        subtitle: raw.subtitle?.trim() || defaultPrompts.subtitle,
        freeSpace: raw.freeSpace?.trim() || defaultPrompts.freeSpace,
        prompts: raw.prompts.map((p) => p.trim()),
      };
    }
  } catch {
    // Fall back to bundled public/prompts.json if offline
  }
  return defaultPrompts;
}

function getPromptLengthBucket(text: string): 'short' | 'medium' | 'long' {
  if (text.length >= 46) return 'long';
  if (text.length >= 32) return 'medium';
  return 'short';
}

function installDialogLightDismissFallback(): void {
  if ('closedBy' in HTMLDialogElement.prototype) return;

  const isOutside = (e: PointerEvent, dialog: HTMLDialogElement): boolean => {
    const r = dialog.getBoundingClientRect();
    return (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    );
  };

  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[closedby="any"]')) {
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = e.target === dialog && isOutside(e, dialog);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (e.target === dialog && pressedOutside && isOutside(e, dialog)) {
        dialog.close();
      }
      pressedOutside = false;
    });
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface CellRefs {
  root: HTMLElement;
  label: HTMLSpanElement;
}

async function boot(): Promise<void> {
  installDialogLightDismissFallback();

  const config = await fetchPromptsConfig();
  const { state: initialState, restoredFromUrl, storageAvailable } =
    loadOrCreateState(config);
  const state: SeriesBingoState = initialState;

  // Cached DOM References
  const titleEl = mustGetEl<HTMLHeadingElement>('main-title');
  const subtitleEl = mustGetEl<HTMLElement>('event-subtitle');
  const hudGameLabel = mustGetEl<HTMLElement>('hud-game-label');
  const hudGamePoints = mustGetEl<HTMLElement>('hud-game-points');
  const hudStreakCard = mustGetEl<HTMLElement>('hud-streak-card');
  const hudStreakValue = mustGetEl<HTMLElement>('hud-streak-value');
  const hudStreakSub = mustGetEl<HTMLElement>('hud-streak-sub');
  const hudSeriesPoints = mustGetEl<HTMLElement>('hud-series-points');
  const hudRankPill = mustGetEl<HTMLElement>('hud-rank-pill');
  const btnHudScorecard = mustGetEl<HTMLButtonElement>('btn-hud-scorecard');

  const tablistEl = mustGetEl<HTMLElement>('game-tablist');
  const tabRefs = new Map<GameNumber, { btn: HTMLButtonElement; meta: HTMLElement }>(
    GAME_NUMBERS.map((g) => [
      g,
      {
        btn: mustGetEl<HTMLButtonElement>(`tab-game-${g}`),
        meta: mustGetEl<HTMLElement>(`tab-meta-${g}`),
      },
    ]),
  );

  const gamePanelEl = mustGetEl<HTMLElement>('game-panel');
  const milestoneBannerEl = mustGetEl<HTMLElement>('milestone-banner');
  const milestoneTextEl = mustGetEl<HTMLElement>('milestone-text');
  const bingoGridEl = mustGetEl<HTMLElement>('bingo-grid');
  const feedbackBarEl = mustGetEl<HTMLElement>('feedback-bar');
  const feedbackTextEl = mustGetEl<HTMLElement>('feedback-text');
  const saveStatusEl = mustGetEl<HTMLElement>('save-status');
  const saveStatusTextEl = mustGetEl<HTMLElement>('save-status-text');
  const srAnnouncerEl = mustGetEl<HTMLElement>('sr-announcer');
  const confettiCanvas = mustGetEl<HTMLCanvasElement>('confetti-canvas');

  const btnCopyGame = mustGetEl<HTMLButtonElement>('btn-copy-game');
  const btnCopyGameLabel = mustGetEl<HTMLElement>('btn-copy-game-label');
  const btnOpenScorecard = mustGetEl<HTMLButtonElement>('btn-open-scorecard');
  const btnBackupLink = mustGetEl<HTMLButtonElement>('btn-backup-link');
  const btnClearMarks = mustGetEl<HTMLButtonElement>('btn-clear-marks');
  const btnNewCard = mustGetEl<HTMLButtonElement>('btn-new-card');

  // Dialogs
  const confirmDialog = mustGetEl<HTMLDialogElement>('confirm-dialog');
  const confirmTitleEl = mustGetEl<HTMLElement>('confirm-dialog-title');
  const confirmDescEl = mustGetEl<HTMLElement>('confirm-dialog-desc');
  const confirmSubmitBtn = mustGetEl<HTMLButtonElement>('confirm-dialog-submit');

  const previewDialog = mustGetEl<HTMLDialogElement>('preview-dialog');
  const previewCoordsEl = mustGetEl<HTMLElement>('preview-dialog-coords');
  const previewTitleEl = mustGetEl<HTMLElement>('preview-dialog-title');
  const previewStatusEl = mustGetEl<HTMLElement>('preview-dialog-status');
  const previewToggleBtn = mustGetEl<HTMLButtonElement>('preview-dialog-toggle');

  const scorecardDialog = mustGetEl<HTMLDialogElement>('scorecard-dialog');
  const scTotalPoints = mustGetEl<HTMLElement>('sc-total-points');
  const scNextTier = mustGetEl<HTMLElement>('sc-next-tier');
  const scRankName = mustGetEl<HTMLElement>('sc-rank-name');
  const scBestStreak = mustGetEl<HTMLElement>('sc-best-streak');
  const scTotalBingos = mustGetEl<HTMLElement>('sc-total-bingos');
  const scTableBody = mustGetEl<HTMLElement>('sc-table-body');
  const scCopyFeedback = mustGetEl<HTMLElement>('sc-copy-feedback');
  const btnCopyScorecard = mustGetEl<HTMLButtonElement>('btn-copy-scorecard');

  titleEl.textContent = config.title;
  subtitleEl.textContent = config.subtitle;
  document.title = `${config.title} • Gen.G vs BLG`;

  if (!storageAvailable) {
    saveStatusEl.classList.add('is-warning');
    saveStatusTextEl.textContent =
      'Private browsing detected — use "Backup / Move Link" before closing the tab.';
  }

  // Build persistent 25-cell DOM once so toggles keep keyboard focus & smooth CSS transitions
  const cellRefs: CellRefs[] = [];
  for (let idx = 0; idx < TOTAL_CELLS; idx++) {
    const label = document.createElement('span');
    label.className = 'cell-text';

    if (idx === CENTER_INDEX) {
      const freeCell = document.createElement('div');
      freeCell.className = 'bingo-cell is-free is-marked';
      freeCell.dataset.index = String(idx);
      freeCell.setAttribute('role', 'note');

      const gem = document.createElement('span');
      gem.className = 'free-gem';
      gem.setAttribute('aria-hidden', 'true');
      gem.textContent = '❖';

      freeCell.append(gem, label);
      bingoGridEl.appendChild(freeCell);
      cellRefs.push({ root: freeCell, label });
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bingo-cell';
      btn.dataset.index = String(idx);
      btn.setAttribute('aria-pressed', 'false');
      btn.appendChild(label);
      bingoGridEl.appendChild(btn);
      cellRefs.push({ root: btn, label });
    }
  }

  let feedbackTimer: number | null = null;
  let pendingConfirmAction: 'clear' | 'shuffle' | null = null;
  let inspectedCellIndex: number | null = null;

  function announceAndShowFeedback(message: string): void {
    feedbackTextEl.textContent = message;
    feedbackBarEl.hidden = false;
    srAnnouncerEl.textContent = message;
    if (feedbackTimer !== null) {
      window.clearTimeout(feedbackTimer);
    }
    feedbackTimer = window.setTimeout(() => {
      feedbackBarEl.hidden = true;
    }, 4500);
  }

  function persistAndRender(triggerCelebrations: boolean): void {
    const card = ensureGameCard(state, state.activeGame);
    const summary = evaluateSeriesScore(state);
    const activeBreakdown = summary.perGame[state.activeGame];
    const { evaluation } = activeBreakdown;

    let burstType: 'bingo' | 'streak' | 'pentakill' | null = null;
    let streakAnnouncement = '';

    if (triggerCelebrations) {
      if (evaluation.isBlackout && !card.celebratedBlackout) {
        burstType = 'pentakill';
        card.celebratedBlackout = true;
      } else if (evaluation.lineCount > card.celebratedLines) {
        burstType = 'bingo';
      }

      card.celebratedLines = Math.max(card.celebratedLines, evaluation.lineCount);

      if (
        activeBreakdown.streakCount >= 2 &&
        activeBreakdown.streakCount > state.celebratedStreak
      ) {
        state.celebratedStreak = activeBreakdown.streakCount;
        if (burstType !== 'pentakill') {
          burstType = 'streak';
        }
        streakAnnouncement = ` 🔥 ${activeBreakdown.streakCount}-GAME BINGO STREAK (+${activeBreakdown.streakBonusPoints} pts)!`;
      }
    } else {
      // Re-arm celebrations cleanly if user unchecked an accidental tap
      card.celebratedLines = Math.min(card.celebratedLines, evaluation.lineCount);
      if (!evaluation.isBlackout) {
        card.celebratedBlackout = false;
      }
      state.celebratedStreak = Math.min(state.celebratedStreak, summary.bestStreak);
    }

    saveState(state);

    // Update HUD
    hudGameLabel.textContent = `Game ${state.activeGame} Pts`;
    hudGamePoints.textContent = activeBreakdown.totalGamePoints.toLocaleString();
    hudSeriesPoints.textContent = summary.totalPoints.toLocaleString();
    hudRankPill.dataset.tier = summary.rank.tierKey;
    hudRankPill.textContent = `${summary.rank.name} • Scorecard`;

    if (summary.activeStreak >= 1) {
      hudStreakCard.classList.add('is-hot');
      hudStreakValue.textContent = `🔥 ${summary.activeStreak}G`;
      if (summary.isStreakCarryover) {
        hudStreakSub.textContent = `G${state.activeGame} Bingo → +${summary.nextStreakPotentialBonus} pts`;
      } else if (activeBreakdown.streakBonusPoints > 0) {
        hudStreakSub.textContent = `+${activeBreakdown.streakBonusPoints} streak bonus!`;
      } else if (state.activeGame < 5) {
        hudStreakSub.textContent = `G${state.activeGame + 1} Bingo → +${SCORE_RULES.STREAK_STEP_BONUS} pts`;
      } else {
        hudStreakSub.textContent = `Best: ${summary.bestStreak}G`;
      }
    } else {
      hudStreakCard.classList.remove('is-hot');
      hudStreakValue.textContent = '0G';
      hudStreakSub.textContent =
        summary.bestStreak > 0
          ? `Best streak: ${summary.bestStreak}G`
          : 'Bingo consecutively!';
    }

    // Update Game 1-5 Tabs
    for (const g of GAME_NUMBERS) {
      const ref = tabRefs.get(g)!;
      const gs = summary.perGame[g];
      const isSelected = g === state.activeGame;

      ref.btn.setAttribute('aria-selected', String(isSelected));
      ref.btn.tabIndex = isSelected ? 0 : -1;
      ref.btn.classList.toggle('has-progress', gs.hasMarks && !gs.evaluation.hasBingo);
      ref.btn.classList.toggle('has-bingo', gs.evaluation.hasBingo);

      if (gs.isBlackout) {
        ref.meta.textContent = `★ PENTA • ${gs.totalGamePoints}`;
      } else if (gs.lineCount > 0) {
        ref.meta.textContent = `★ BINGO • ${gs.totalGamePoints}`;
      } else if (gs.hasMarks) {
        ref.meta.textContent = `• ${gs.checkedPromptsCount}/24`;
      } else {
        ref.meta.textContent = '—';
      }
    }

    gamePanelEl.setAttribute('aria-labelledby', `tab-game-${state.activeGame}`);
    btnCopyGameLabel.textContent = `Copy Game ${state.activeGame} Grid`;

    // Update Milestone Banner
    if (evaluation.hasBingo) {
      milestoneBannerEl.classList.add('is-bingo');
      const lineWord = evaluation.lineCount === 1 ? '1 Line' : `${evaluation.lineCount} Lines`;
      const streakTag =
        activeBreakdown.streakCount >= 2
          ? ` • 🔥 ${activeBreakdown.streakCount}G Streak (+${activeBreakdown.streakBonusPoints} pts)`
          : '';
      const continueHint = evaluation.isBlackout
        ? ' • Full 25/25 Card Cleared!'
        : ' • Keep checking for extra combo lines!';
      milestoneTextEl.textContent = `🏆 ${evaluation.milestoneLabel} (${lineWord})${streakTag}${continueHint}`;
    } else {
      milestoneBannerEl.classList.remove('is-bingo');
      milestoneTextEl.textContent = `Game ${state.activeGame}: ${evaluation.checkedPromptsCount}/24 events marked • Get 5 in a row for Bingo (+${SCORE_RULES.FIRST_BINGO} pts)`;
    }

    // Update persistent 5x5 cells in place
    for (let idx = 0; idx < TOTAL_CELLS; idx++) {
      const { root, label } = cellRefs[idx];
      const text = getCellText(idx, card, config);
      const marked = isCellMarked(card.marksMask, idx);
      const winning = evaluation.winningCells.has(idx);

      label.textContent = text;
      root.dataset.len = getPromptLengthBucket(text);
      root.classList.toggle('is-winning', winning);

      if (idx === CENTER_INDEX) {
        root.setAttribute('aria-label', `${text} (Center Free Space, automatically marked)`);
      } else {
        root.setAttribute('aria-pressed', String(marked));
      }
    }

    if (burstType) {
      launchHextechBurst(confettiCanvas, burstType);
      srAnnouncerEl.textContent = `${evaluation.milestoneLabel} achieved in Game ${state.activeGame}!${streakAnnouncement}`;
    }
  }

  // Delegated Square Interactions (tap/keyboard toggle + press-and-hold/right-click inspect)
  let holdTimer: number | null = null;
  let holdStartX = 0;
  let holdStartY = 0;
  let suppressNextClick = false;

  function clearHoldTimer(): void {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function getPlayableCellIndex(target: EventTarget | null): number | null {
    if (!(target instanceof HTMLElement)) return null;
    const btn = target.closest<HTMLButtonElement>('button.bingo-cell');
    if (!btn) return null;
    const idx = Number.parseInt(btn.dataset.index ?? '', 10);
    return Number.isInteger(idx) && idx !== CENTER_INDEX ? idx : null;
  }

  bingoGridEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const cellIdx = getPlayableCellIndex(e.target);
    if (cellIdx === null) return;

    suppressNextClick = false;
    holdStartX = e.clientX;
    holdStartY = e.clientY;
    clearHoldTimer();
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      suppressNextClick = true;
      navigator.vibrate?.(12);
      openSquareInspector(cellIdx);
    }, 430);
  });

  bingoGridEl.addEventListener('pointermove', (e) => {
    if (holdTimer !== null && Math.hypot(e.clientX - holdStartX, e.clientY - holdStartY) > 10) {
      clearHoldTimer();
    }
  });

  bingoGridEl.addEventListener('pointerup', clearHoldTimer);
  bingoGridEl.addEventListener('pointercancel', clearHoldTimer);

  bingoGridEl.addEventListener('contextmenu', (e) => {
    const cellIdx = getPlayableCellIndex(e.target);
    if (cellIdx === null) return;
    e.preventDefault();
    clearHoldTimer();
    if (!previewDialog.open) {
      openSquareInspector(cellIdx);
    }
  });

  bingoGridEl.addEventListener('click', (e) => {
    const cellIdx = getPlayableCellIndex(e.target);
    if (cellIdx === null) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    toggleCell(cellIdx);
  });

  function toggleCell(cellIndex: number): void {
    if (cellIndex === CENTER_INDEX) return;
    const card = ensureGameCard(state, state.activeGame);
    const bit = 1 << cellIndex;
    const wasMarked = (card.marksMask & bit) !== 0;
    card.marksMask = ((card.marksMask ^ bit) | FREE_MASK) >>> 0;
    persistAndRender(!wasMarked);
  }

  function openSquareInspector(cellIndex: number): void {
    inspectedCellIndex = cellIndex;
    const card = ensureGameCard(state, state.activeGame);
    const row = Math.floor(cellIndex / GRID_SIZE) + 1;
    const col = (cellIndex % GRID_SIZE) + 1;
    const marked = isCellMarked(card.marksMask, cellIndex);

    previewCoordsEl.textContent = `Game ${state.activeGame} • Row ${row}, Column ${col}`;
    previewTitleEl.textContent = getCellText(cellIndex, card, config);
    previewStatusEl.textContent = marked
      ? `✓ Checked (+${SCORE_RULES.PER_SQUARE} pts)`
      : 'Unchecked';
    previewToggleBtn.textContent = marked ? 'Unmark Square' : 'Mark Square';

    previewDialog.returnValue = '';
    previewDialog.showModal();
  }

  previewDialog.addEventListener('close', () => {
    const action = previewDialog.returnValue;
    previewDialog.returnValue = '';
    if (action === 'toggle' && inspectedCellIndex !== null) {
      toggleCell(inspectedCellIndex);
    }
    inspectedCellIndex = null;
  });

  function switchGameTab(game: GameNumber, focusTab = false): void {
    state.activeGame = game;
    ensureGameCard(state, game);
    persistAndRender(false);

    const selectedTab = tabRefs.get(game)!.btn;
    selectedTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focusTab) {
      selectedTab.focus();
    }
  }

  tablistEl.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
    if (!target) return;
    const num = Number.parseInt(target.dataset.game ?? '', 10) as GameNumber;
    if (GAME_NUMBERS.includes(num) && num !== state.activeGame) {
      switchGameTab(num, false);
    }
  });

  tablistEl.addEventListener('keydown', (e) => {
    const currentIndex = GAME_NUMBERS.indexOf(state.activeGame);
    let nextIndex = -1;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % GAME_NUMBERS.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + GAME_NUMBERS.length) % GAME_NUMBERS.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = GAME_NUMBERS.length - 1;
    }

    if (nextIndex !== -1) {
      e.preventDefault();
      switchGameTab(GAME_NUMBERS[nextIndex], true);
    }
  });

  // Confirmation Dialog (Clear Marks / New Shuffled Card)
  btnClearMarks.addEventListener('click', () => {
    pendingConfirmAction = 'clear';
    confirmTitleEl.textContent = `Clear Game ${state.activeGame} Marks?`;
    confirmDescEl.textContent = `This will uncheck all marked prompts on your Game ${state.activeGame} card while keeping the same square layout. Other games in the Bo5 will not be changed.`;
    confirmSubmitBtn.textContent = 'Clear Marks';
    confirmDialog.returnValue = '';
    confirmDialog.showModal();
  });

  btnNewCard.addEventListener('click', () => {
    pendingConfirmAction = 'shuffle';
    confirmTitleEl.textContent = `Shuffle New Game ${state.activeGame} Card?`;
    confirmDescEl.textContent = `This will deal a fresh random 5×5 layout and reset checked squares for Game ${state.activeGame} only. Other games in the Bo5 will stay intact.`;
    confirmSubmitBtn.textContent = 'Deal New Card';
    confirmDialog.returnValue = '';
    confirmDialog.showModal();
  });

  confirmDialog.addEventListener('close', () => {
    const choice = confirmDialog.returnValue;
    confirmDialog.returnValue = '';

    if (choice === 'confirm' && pendingConfirmAction) {
      if (pendingConfirmAction === 'clear') {
        const card = ensureGameCard(state, state.activeGame);
        card.marksMask = FREE_MASK;
        card.celebratedLines = 0;
        card.celebratedBlackout = false;
        persistAndRender(false);
        announceAndShowFeedback(`Cleared marks on Game ${state.activeGame}.`);
      } else {
        state.games[state.activeGame] = createGameCard(state.poolLength);
        persistAndRender(false);
        announceAndShowFeedback(`Shuffled a brand-new card for Game ${state.activeGame}!`);
      }
    }

    pendingConfirmAction = null;
  });

  btnCopyGame.addEventListener('click', async () => {
    const card = ensureGameCard(state, state.activeGame);
    const summary = evaluateSeriesScore(state);
    const ok = await copyTextToClipboard(
      formatGameShareText(state.activeGame, card, config, summary),
    );
    announceAndShowFeedback(
      ok
        ? `Copied Game ${state.activeGame} emoji grid — paste it in Discord!`
        : 'Could not access clipboard automatically.',
    );
  });

  btnBackupLink.addEventListener('click', async () => {
    const ok = await copyTextToClipboard(encodeRestoreUrl(state));
    announceAndShowFeedback(
      ok
        ? 'Copied personal Backup / Move Link! Open it in another browser or device to transfer all 5 games.'
        : 'Could not copy link automatically.',
    );
  });

  function openScorecardModal(): void {
    const summary = evaluateSeriesScore(state);
    scTotalPoints.textContent = `${summary.totalPoints.toLocaleString()} PTS`;
    scRankName.textContent = summary.rank.name;
    scBestStreak.textContent = `${summary.bestStreak} ${summary.bestStreak === 1 ? 'Game' : 'Games'}`;
    scTotalBingos.textContent = String(summary.totalBingos);

    if (summary.rank.nextTierName && summary.rank.nextTierMinPoints !== null) {
      const diff = summary.rank.nextTierMinPoints - summary.totalPoints;
      scNextTier.textContent = `${diff.toLocaleString()} pts to ${summary.rank.nextTierName}`;
    } else {
      scNextTier.textContent = 'Top Challenger Rank Reached!';
    }

    scTableBody.replaceChildren();
    for (const g of GAME_NUMBERS) {
      const gs = summary.perGame[g];
      const tr = document.createElement('tr');
      if (g === state.activeGame) {
        tr.classList.add('is-active-row');
      }

      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = `Game ${g}`;

      const tdChecked = document.createElement('td');
      tdChecked.textContent = gs.hasMarks || gs.lineCount > 0 ? `${gs.checkedPromptsCount}/24` : '—';

      const tdBingos = document.createElement('td');
      tdBingos.textContent = gs.isBlackout
        ? 'Pentakill (12)'
        : gs.lineCount > 0
          ? `${gs.lineCount} ${gs.lineCount === 1 ? 'Line' : 'Lines'}`
          : '—';

      const tdStreak = document.createElement('td');
      tdStreak.textContent =
        gs.streakCount >= 2
          ? `🔥 ${gs.streakCount}G (+${gs.streakBonusPoints})`
          : gs.streakCount === 1
            ? '🔥 1G'
            : '—';

      const tdPts = document.createElement('td');
      tdPts.className = 'num-col';
      tdPts.textContent = gs.totalGamePoints.toLocaleString();

      tr.append(th, tdChecked, tdBingos, tdStreak, tdPts);
      scTableBody.appendChild(tr);
    }

    scCopyFeedback.hidden = true;
    scorecardDialog.returnValue = '';
    scorecardDialog.showModal();
  }

  btnOpenScorecard.addEventListener('click', openScorecardModal);
  btnHudScorecard.addEventListener('click', openScorecardModal);

  btnCopyScorecard.addEventListener('click', async () => {
    const summary = evaluateSeriesScore(state);
    const ok = await copyTextToClipboard(formatSeriesScorecardText(config, summary));
    scCopyFeedback.textContent = ok
      ? '✓ Copied Series High Score card — paste in chat to compare scores!'
      : 'Could not access clipboard automatically.';
    scCopyFeedback.hidden = false;
    srAnnouncerEl.textContent = scCopyFeedback.textContent;
  });

  persistAndRender(false);

  if (restoredFromUrl) {
    announceAndShowFeedback('Restored your series boards and scores from backup link!');
  }
}

void boot();
