# Asteroids (React + TypeScript + Vite)

An Asteroids-style browser game built with React, TypeScript, Vite, and Tailwind CSS.

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- ESLint

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
  App.tsx        # Main application component
  main.tsx       # Application entry point
  index.css      # Tailwind directives + global styles
  components/    # Reusable UI components
public/          # Static assets
```

## Deployment (Azure Static Web Apps)

This repo includes a GitHub Actions workflow for Azure Static Web Apps deployment.

- Workflow: [.github/workflows/azure-static-web-apps-ambitious-stone-04a8a9c10.yml](.github/workflows/azure-static-web-apps-ambitious-stone-04a8a9c10.yml)
- Build output: `dist/`
- Required secret: `AZURE_STATIC_WEB_APPS_API_TOKEN_AMBITIOUS_STONE_04A8A9C10`

Pushes to `main` deploy automatically; pull requests create preview environments.
