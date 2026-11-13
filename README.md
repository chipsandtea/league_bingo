# Gen.G vs BLG • Worlds Finals Watch-Party Bingo

A zero-backend Best-of-5 watch-party Bingo webapp built with **Vite + Vanilla TypeScript** for GitHub Pages.

## Features
- **Crash & Tab-Close Safe (`localStorage` + Backup Links):** Every square toggle and Game 1–5 board is saved automatically in your browser. Closing the tab or refreshing restores your exact cards, checked squares, streaks, and scores. Use **Backup / Move Link** to move your boards to another browser or device while keeping the main site URL clean for sharing with friends.
- **Best-of-5 Series Game Switcher (`Game 1` – `Game 5`):** Each game of the series gets its own uniquely shuffled 5×5 card (24 prompts drawn from the 25-prompt pool + Center `FREE` space).
- **Cross-Game Bingo Streaks & High-Score System:**
  - **+25 pts** per checked prompt square
  - **+200 pts** for your first Bingo in a game, **+250 pts** for each combo line in the same game
  - **+500 pts** Pentakill bonus for clearing all 25 squares on a card
  - **🔥 Consecutive-Game Bingo Streaks:** Reaching Bingo in back-to-back games awards **+150 pts** (2G), **+300 pts** (3G), **+450 pts** (4G), and **+600 pts** (5G)
  - **Series Scorecard & Calibrated Rank Tiers:** Climb from `Iron` (1) → `Bronze` (175) → `Silver` (375) → `Gold` (625) → `Platinum` (900) → `Emerald` (1,200) → `Diamond` (1,500) → `Master` (1,800) → `Grandmaster` (2,050) → `Challenger` (2,300+) and copy formatted Discord summaries.

## Editing Prompts (`public/prompts.json`)
Edit [`public/prompts.json`](./public/prompts.json) directly on GitHub or locally:
- **Fixing a typo mid-series:** Keep `"eventId"` and prompt order unchanged—active cards will pick up updated text without losing checked boxes.
- **Starting a new watch party:** Change `"eventId"` (e.g., `"lck-finals-v1"`) so returning visitors automatically receive fresh Game 1–5 cards.

## Local Development
```bash
npm install
npm run dev
```

## Deploying to GitHub Pages
1. Push to the `main` branch on GitHub (`https://github.com/chipsandtea/league_bingo`).
2. In your GitHub repository, open **Settings → Pages**, and under **Build and deployment → Source**, select **GitHub Actions**.
3. Every push to `main` (including direct edits to `public/prompts.json` on GitHub.com) automatically builds and deploys via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).
