# Route loading measurement

Production build, September 19, 2026, Vite 7.3.0. Decimal kB; JavaScript only.
Before splitting (after correctness refactors): **611.55 kB / 191.52 kB gzip**,
downloaded by every route. Review baseline was 601.80 / 189.02.

| Route chunk | Raw kB | Gzip kB |
|---|---:|---:|
| Selector + shared React/router | 235.94 | 75.45 |
| Hard Vacuum | 227.03 | 77.41 |
| Hello World | 3.17 | 1.39 |
| Final Approach | 16.57 | 4.93 |
| No Exit | 19.83 | 5.24 |
| Sling Load | 30.34 | 9.73 |
| Bumper Ball | 32.44 | 10.48 |
| Urban Fire | 43.27 | 11.76 |

The selector downloads no game implementation (61% less raw JS). A direct Hard
Vacuum visit downloads the shared entry and Hard Vacuum, not six unrelated games.
React/router remain shared rather than duplicated. Minor import wrappers add
overhead to the aggregate size; this optimizes per-visit transfer, not total code.

Reproduce: `npm run build` then `node scripts/report-bundles.mjs`. The build emits
`dist/.vite/manifest.json`. Production browser tests assert network isolation,
all seven direct URLs and compatibility redirects, exits, Back/Forward and focus,
announced loading, and recovery after an aborted chunk request. Reload obtains
the current asset manifest after a deployment invalidates a cached chunk URL.
