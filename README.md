# DROP 7 MAGIC — Remake v1.0

A complete remake of the Drop 7 clone as a pure static website (HTML + CSS + JS, no build step, no dependencies).
Keeps the retro calculator aesthetic (CaLBoY body, solar panel, mint LCD, seven-segment digits, halftone backdrop).

## Files

```
drop7-remake/
├── index.html          # all screens: title / game / tutorial / game over / help
├── css/style.css       # retro calculator theme
├── js/game.js          # game engine, tutorial, input, persistence
├── js/audio.js         # retro SFX via Web Audio (no audio assets)
└── fonts/              # DSEG7-Classic (OFL-1.1, see DSEG-LICENSE.txt)
```

## Run locally

```bash
cd drop7-remake
python3 -m http.server 8000
# open http://localhost:8000/
```

## Deploy

Any static host works. For Firebase Hosting (mkongio.web.app):

```bash
firebase init hosting          # set public dir to drop7-remake (one time)
firebase deploy --only hosting
```

Or drag the folder into Netlify / Vercel / Cloudflare Pages / GitHub Pages.

## Controls

- **Mouse / touch**: click/tap a column, or drag from the board and release over a column
- **Keyboard**: ← → select column, Space drop, P pause, M mute, H help

## Features

- Classic Drop 7 rules: 7×7 grid, number = row/column disc count pops, chains ×7 pts (multiplier shown in the solar panel in dot-matrix font; **chain ×7** triggers mega badge + LCD flash + full-screen translucent fireworks + combo jingle)
- **Magic balls** (~12% of drops, glowing, each with unique style/sound, consumed on drop — dropping one **ends the level immediately**):
  - **± SHIFT** (purple): adds −3…+3 to *every* numbered ball, set by column (clamped 1–7)
  - **👀 PEEK** (teal): reveals the *hidden numbers* of every blank in the chosen column (slide to peek first)
  - **⟳ CYCLE** (orange): sliding ←/→ cycles *every* ball blank → cracked → numbered → blank (numbered balls hide their value inside); drop locks it in
  - **◉ UNIFY** (magenta): turns *every* numbered ball into one number (pick 1–7 with the column)
- **Blanks have 3 states**: pristine → cracked (amber dashed ring) on first neighboring pop → **reveals its hidden number** on the second
- **Landing ghost preview**: translucent disc shows exactly where the current ball will land
- **Randomized opening board**: each column starts with 0–3 balls in random states (numbered / pristine blank / cracked blank), guaranteed non-empty and no instant pops
- 5 balls per level (+1 bonus ball per chain wave from ×2 onward — first pop earns nothing); board rises + fresh blank row on level up; game over above the top
- Full board clear triggers a fireworks + jingle celebration
- Interactive tutorial (CAL the coach): row pop → column pop → chain → blanks → magic → levels
- Title screen, pause menu, how-to-play, game-over stats, local top-5, timer
- Continue saved game (localStorage), sound toggle, retro bleeps

## QA

Playtested end-to-end in headless Chromium: tutorial scores verified (21/35/84),
free play, keyboard, drag, pause/mute/help, level-up, game over, restart — zero console errors.
