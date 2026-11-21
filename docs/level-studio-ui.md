# Level studio UI

The panels, toolbars, inspector, library and dialogs around the Level studio canvas
use [shadcn/ui](https://ui.shadcn.com) components. The canvas and its editing
interaction do not.

## Setup

- `components.json` configures the shadcn CLI (style `radix-nova`, Lucide icons).
  Add a component with `npx shadcn@latest add <name>`; it lands in
  `src/components/ui/` and imports `cn` from `src/lib/utils.ts` through the `@/`
  alias (`tsconfig.app.json` paths and `vite.config.ts`).
- `src/games/jumping/studio.css`, imported by `src/index.css`, maps the shadcn
  tokens (`--background`, `--primary`, `--border`, …) onto the game palette in
  `theme.css`. The tokens are defined only on `.studio-ui` (the studio root), so
  shadcn utilities resolve nowhere else. It also carries the data-attribute
  variants shadcn components use (vendored from the `shadcn` package's
  `tailwind.css`); add new ones there if a newly added component needs them.
  If the CLI writes `:root` variables or `@import "shadcn/tailwind.css"` into
  that file, move the variables under `.studio-ui` and drop the import.
- The game's older global rules (`.jumping-game button`, `.jumping-ui button`,
  `.jumping-game kbd`) skip elements with a `data-slot` attribute, which every
  shadcn component sets. Raw buttons elsewhere in the game keep their old look.
- `builder.css` lays out the panels and styles what components do not: the
  inspector rhythm, dialog shells, the help diagrams and the canvas overlays.

## What stays custom, and why

Keyboard and controller navigation (`builderNavigation.ts`,
`useBuilderController.ts`) move focus between real `button`, `input`, `textarea`
and `summary` elements, open lists through a focused `role=combobox`, and detect
modals as `dialog[open]` inside the studio root. So:

- `BuilderSelect` keeps its own listbox instead of Radix Select, which would move
  focus into a portal outside the studio. It wears shadcn Select styling.
- Inspector and Help tabs keep their hand-written ARIA tabs (stable ids, and the
  controller restores a panel by clicking its tab), styled like shadcn Tabs.
- Library, Help and the controller keyboard stay native `<dialog>` elements
  opened with `showModal()`, with shadcn-styled contents.
- Inspector sections stay `<details>`/`<summary>`.

Checkboxes are shadcn `Checkbox` (a `button role=checkbox`) wrapped in a `<label>`
by `CheckField` (`StudioFields.tsx`), so the caption is still the accessible name
and clicking it toggles the box. `Field` stacks a caption over its control;
`InspectorButton` is the inspector's full-width action.

Shared level-file dialogs (`SaveFailureDialog`, `FileActionDialog`) and
`DeleteLevelButton` are also used by the game's level menu, so they keep the
game's styling; the library styles its delete button in `builder.css`.
