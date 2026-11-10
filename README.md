# Construction Site Survivors

**▶ Play it live: https://stiffi136.github.io/construction-survivors-game/**

A Survivors-like (in the vein of Vampire Survivors) set on an endless construction site at night. You only move; your tools attack automatically. Survive a 15-minute shift and take down the final boss. Built with TypeScript, three.js, and Vite, and designed for phones first.

## Features

- Auto-attacking weapons: 13 weapons with 8 levels each and 8 evolutions
- 13 passive items, level-up cards, and chests with rewards
- 4 playable characters, each with a starting weapon, strengths, and weaknesses
- 7 enemy types, elite variants, and 3 bosses; timed events such as cone swarms and barrel rain
- Procedural ground with zones, plus props from the sprite sheets
- Persistent meta progression (coins, Site Yard upgrades, unlocks) stored in `localStorage`
- Two languages (EN/DE), switchable in the game
- Sound synthesized at runtime; no audio files
- Single-file build: `dist/index.html`

The full design is in [docs/game-design.md](docs/game-design.md). It is a design document, so some parts (marked with phases) may be ahead of the implementation.

## Controls

**Keyboard**
- Move: `WASD` or arrow keys
- Pause: `Esc` or `P`
- Level-up cards: number keys `1`–`5`

**Touch**
- A floating joystick appears wherever you put your thumb on the playfield; drag to move
- Tap cards and buttons in the menus
- The game pauses automatically when the app goes to the background

## Tech stack

- TypeScript
- three.js (rendering)
- Vite with `vite-plugin-singlefile` (single-file build)
- sharp / pngjs (sprite extraction tools)

## Setup

Requires Node.js (the CI uses Node 24).

```bash
npm ci            # install dependencies
npm run dev       # start the dev server
npm run build     # type-check, then build dist/index.html
npm run typecheck # TypeScript check only
```

`npm run preview` serves the production build locally.

## Project structure

```
src/             Game source code
  core/          Input, audio, utilities, spatial hash
  game/          Game logic: weapons, enemies, passives, characters, spawner, meta progression
  render/        Sprite batching, ground rendering, texture helpers
  ui/            HUD, menus, styles
  dev/           Development helpers (simulation, hit tests)
  atlas.ts       Sprite atlas loading
  main.ts        Entry point
public/sprites/  Sprite sheets (PNG + JSON frame data)
  atlas.*        Characters, enemies, weapons, items, effects
  props.*        Construction-site props (vehicles, barriers, signs, material, decoration)
  terrain.*      Ground tiles
tools/           Node scripts that cut the source sprite sheets into the sheets above
docs/            Design documentation (game-design.md)
.github/workflows/deploy.yml   GitHub Pages deployment
```

The sprite sheets are embedded into the build through a Vite plugin (`vite.config.mts`), so `dist/index.html` is self-contained.

### Sprite tools

The scripts in `tools/` extract sprites from the original sheets and write the PNG and JSON files:

```bash
node tools/extract-atlas.mjs   [source.png]   # -> public/sprites/atlas.{png,json}
node tools/extract-props.mjs   [source.png]   # -> public/sprites/props.{png,json}
node tools/extract-terrain.mjs [source.png]   # -> public/sprites/terrain.{png,json}
```

`tools/extract.js` and `tools/preview.js` are older helpers for an earlier concept sheet and write to `assets/sprites/` and `preview/`. Pass the path to the source image as the argument if the default path does not exist on your machine.

## Languages

The game is available in English and German. English is the default. You can switch the language with the language buttons in the main menu and in the settings. The change applies immediately, and the choice is saved in `localStorage` (key `bs_lang`). If `localStorage` is unavailable, the game falls back to English. The texts live in `src/i18n/` (`en.ts`, `de.ts`).

## Deployment

The game is deployed to GitHub Pages by GitHub Actions (`.github/workflows/deploy.yml`). On every push to `main` (or manually via "Run workflow"), the workflow runs `npm ci` and `npm run build` and publishes `dist/`.

One-time setup: in the repository settings, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
