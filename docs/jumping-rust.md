# LAB Rust investigation archive

The October 13 decision is to keep LAB in JavaScript. The measured native rope
and alternate physics-engine trials did not justify their maintenance cost for
mixed scenes. The current app has no Rust build, Wasm asset, native adapter,
Rapier dependency or experimental solver flags.

The complete investigations, their source, binaries, regression tests, build
provenance and original reproduction instructions are preserved at commit
`321d047`.
Use a separate checkout at that commit to reproduce an archived experiment.
Its original `docs/jumping-rust.md` and `docs/jumping-stress.md` describe the
native builds and comparison modes available there. Do not apply those old
commands to the cleaned branch.

The [performance history](jumping-performance.md) and raw reports remain for
reference. The accepted implementation change is the exact JavaScript prop
collision cache. The current [stress tools](jumping-stress.md) measure the
JavaScript engine and compare that cache against the original Matter queries.
