# Repository instructions

## Creating and revising Untitled Jumping Game levels

These instructions apply to built-in levels and to local level collections created
or edited as part of work in this repository.

Before designing a layout or changing a level:

1. Read [Making a fun jumping level](docs/jumping-level-design.md). Use it as the
   design brief, including its route, teaching, graffiti, display placement,
   chain-reaction, and playtesting guidance. Respect its distinction between
   requirements and design defaults, together with the user's current direction.
2. Read the relevant sections of [Jumping level files](docs/jumping-levels.md) for
   the JSON schema, available authoring features, validation, and collection
   management. Levels are runtime JSON assets; do not embed authored maps in code.
3. Read [Jumping game contacts](docs/jumping-physics.md) for the movement and
   mechanism rules your layout relies on. Check the implementation and regression
   tests when a capability or interaction is uncertain. Do not invent unsupported
   mechanics or add physics exceptions solely to make a particular level work.
4. Inspect representative existing level JSON in
   [the built-in collection](public/levels/jumping/) and any local collection
   relevant to the request. Use the design spec's references to find useful
   patterns, then adapt them to the level's central idea. Local examples may be
   outside Git; do not assume they are repository assets or overwrite them as
   disposable fixtures.

While authoring, establish a clear central idea, intended and alternative routes,
and considered recovery. Place wall hints, coin meters, and clocks deliberately.
Use the spec's review checklist before calling the level complete.

Validate files with the repository's level tools (`npm run levels:check` for
built-ins), and playtest required interactions from a fresh start using normal
controls. Check intended routes, advertised alternatives, and recovery. Establish
medal times from completed runs. Distinguish file validation and automated route
checks from an actual review of readability and enjoyment; report any playtesting
that remains unverified. Preserve regression coverage for bugs found along the
way.

When level-design decisions establish a new lasting principle, update the design
spec so future authors can use it. Keep detailed guidance in the linked docs
rather than maintaining a separate, conflicting rule set here.
