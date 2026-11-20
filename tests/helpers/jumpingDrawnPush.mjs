// The drawn push starts from the pose actually drawn and forms over about a tenth of a second
// (docs/jumping-physics.md, "Every drawn push starts from the pose actually drawn"). Its palms sit on their
// working contact once it has formed: the stance is ready, the push has fully taken hold, and no handover offset
// is still coming across. Before that the hands are travelling there; tests/jumping-push-engage.test.mjs keeps
// that travel free of single-frame jumps.
export function drawnPushFormed(p) {
  const pushing = p.pushing
  return !!pushing && (pushing.ready ?? 0) >= 1 && pushing.amount >= 1 && !pushing.shift
}
