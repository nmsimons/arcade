# Hard Vacuum (React + TypeScript + Vite)

A small retro-style browser arcade: a full-screen game selector that launches several canvas-based mini-games (each with its own keyboard controls and Web Audio sound effects).

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- ESLint

## Included Games

- **Hard Vacuum** — ship combat, laser and harpoon mechanics, and a ten-map cavern progression
- **Final Approach** — land gently on the pad (difficulty selectable)
- **No Exit** — arena shooter with force-field bounces
- **Urban Fire** — top-down combat with tanks + helicopters
- **Bumper Ball** — physics soccer-ish bumper cars (1P/2P)
- **Sling Load** — helicopter sling-load delivery / survival
- **Hello World** — vector display “HELLO WORLD” screen

## Controls

**Arcade menu**

- Up/Down (or W/S): select a game
- Enter/Space: launch

**Hard Vacuum**

- Arrows / WASD: move & rotate
- Space: shoot
- F: harpoon (toggle reel)
- A: attractor beam
- P: pause

**Final Approach**

- Arrows / WASD: rotate + thrust
- P: pause
- Menu: Left/Right changes difficulty

**No Exit**

- Arrows / WASD: rotate + thrust
- Space: fire (max 3 shots)
- P: pause

**Urban Fire**

- Arrows / WASD: move
- Space: fire (max 2 shots)

**Bumper Ball**

- 1P: Arrow Keys to move
- 2P: WASD + Arrows
- P or Esc: pause/resume

**Sling Load**

- Arrows / WASD: thrust
- Space: hook / release
- X: rotor on/off
- Shift: stabilize (damping)
- P: pause

**Hello World**

- Escape / Enter / Space: exit

Note: browsers often require a user gesture (key press/click) before audio can start.

## Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Vite will print the local URL (typically http://localhost:5173).

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Type-check + production build to dist/
npm run preview  # Preview the production build locally
npm run lint     # Run ESLint
```

## Project Structure

```text
src/
  App.tsx        # Arcade menu + game launcher
  main.tsx       # Application entry point
  index.css      # Tailwind directives + global styles
  components/    # Reusable UI components
  games/         # Canvas games (one component per game)
public/          # Static assets
```

## Adding a Game

1. Create a new component in `src/games/` that accepts `{ onExit: () => void }`.
2. Import it in `src/App.tsx` and add it to:
   - the `GameId` union
   - the `GAMES` list (for menu order)
   - the render switch that returns the game component

## Deployment (Azure Static Web Apps)

This repo includes a GitHub Actions workflow for Azure Static Web Apps deployment.

- Workflow: [.github/workflows/azure-static-web-apps-ambitious-stone-04a8a9c10.yml](.github/workflows/azure-static-web-apps-ambitious-stone-04a8a9c10.yml)
- Build output: `dist/`
- Required secret: `AZURE_STATIC_WEB_APPS_API_TOKEN_AMBITIOUS_STONE_04A8A9C10`

Pushes to `main` deploy automatically; pull requests create preview environments.
