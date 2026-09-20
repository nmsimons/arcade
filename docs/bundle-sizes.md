# Route loading measurement

Production build, September 19, 2026, Node 24.21.0, Vite 7.3.0. Decimal kB; JS only.
Post-split figures are the review-fix snapshot at `e0395cd`; rerun the script below
for subsequent gameplay changes.
Before splitting (`72d2c2e`, rebuilt on Node 24): **611.55 kB / 192.56 kB gzip**,
downloaded by every route. The original review recorded 601.80 / 189.02; gzip
also varies slightly with Node's compression library.

| Route chunk | Raw kB | Gzip kB |
|---|---:|---:|
| Selector + shared React/router | 235.94 | 75.59 |
| Hard Vacuum | 227.74 | 78.26 |
| Hello World | 3.17 | 1.40 |
| Final Approach | 16.57 | 4.97 |
| No Exit | 19.83 | 5.25 |
| Sling Load | 30.34 | 9.80 |
| Bumper Ball | 32.44 | 10.59 |
| Urban Fire | 43.27 | 11.85 |

The selector downloads no game implementation (61% less raw JS). A direct Hard
Vacuum visit downloads the shared entry and Hard Vacuum, not six unrelated games.
React/router remain shared rather than duplicated. Minor import wrappers add
overhead to the aggregate size; this optimizes per-visit transfer, not total code.

Reproduce: `npm run build` then `node scripts/report-bundles.mjs`. The build emits
`dist/.vite/manifest.json`. Production browser tests assert network isolation,
all seven direct URLs and compatibility redirects, exits, Back/Forward and focus,
announced loading, and recovery after an aborted chunk request. Reload obtains
the current asset manifest after a deployment invalidates a cached chunk URL.
