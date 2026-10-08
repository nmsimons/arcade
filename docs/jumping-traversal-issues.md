# UJG traversal issues

Logged October 7, 2026. [GitHub tracker #39](https://github.com/nmsimons/arcade/issues/39) records the scope and order of 21 detailed implementation and evaluation issues from the [critical traversal review](jumping-traversal-review.md). This index provides direct issue links and dependencies. Each issue includes its evidence status, reproduction or investigation scope, source links, implementation guidance, constraints, and observable success criteria. GitHub is the current status record for each issue.

## Issue inventory

| Issue | Priority | Evidence |
| --- | --- | --- |
| [#40 UJG: make pushing body motion follow support and weight transfer](https://github.com/nmsimons/arcade/issues/40) | High (P1) | Reproduced animation defect |
| [#41 UJG: establish a staggered bracing stance when pushing begins](https://github.com/nmsimons/arcade/issues/41) | High (P1) | Reproduced stance defect |
| [#42 UJG: show pushing effort and resistance in the upper body](https://github.com/nmsimons/arcade/issues/42) | High (P1) | Reproduced visual quality issue |
| [#43 UJG: establish visible palm contact before the object starts moving](https://github.com/nmsimons/arcade/issues/43) | High (P1) | Reproduced contact timing defect |
| [#44 UJG: replace low-object squat shuffling with a supported working gait](https://github.com/nmsimons/arcade/issues/44) | Medium (P2) | Rendered visual quality issue |
| [#45 UJG: keep crouched pushing head and torso outside the object](https://github.com/nmsimons/arcade/issues/45) | High (P1) | Reproduced visible penetration |
| [#46 UJG: resolve visible prone-body clearance beside terrain and objects](https://github.com/nmsimons/arcade/issues/46) | High (P1) | Reproduced visible penetration |
| [#47 UJG: transition moving fall recovery into a supported locomotion pose](https://github.com/nmsimons/arcade/issues/47) | High (P1) | Reproduced support and animation mismatch |
| [#48 UJG: show braking and turning before mirroring a moving run](https://github.com/nmsimons/arcade/issues/48) | Medium (P2) | Reproduced abrupt visual reversal |
| [#49 UJG: allow reconsidering tall automatic steps before commitment](https://github.com/nmsimons/arcade/issues/49) | Medium (P2) | Reproduced loss of player agency |
| [#50 UJG: initialize and settle into a readable relaxed idle stance](https://github.com/nmsimons/arcade/issues/50) | Medium (P2) | Reproduced overlapping idle silhouette |
| [#51 UJG: make Down action priority and lower-then-drop behavior predictable](https://github.com/nmsimons/arcade/issues/51) | Medium (P2) | Confirmed control contract with a discoverability problem |
| [#52 UJG: explain and animate ledge jump-away and fresh-press departures](https://github.com/nmsimons/arcade/issues/52) | Medium (P2) | Reproduced launch orientation and confirmed input semantics |
| [#53 UJG: make water instructions and acceptance tests match actual controls](https://github.com/nmsimons/arcade/issues/53) | Medium (P2) | Confirmed mismatch between labels and motor/bindings |
| [#54 UJG: teach acquisition and solidity rules through clear first encounters](https://github.com/nmsimons/arcade/issues/54) | Medium (P2) | Confirmed rule differences; teaching audit required |
| [#55 UJG: give airborne phases distinct readable athlete poses](https://github.com/nmsimons/arcade/issues/55) | Medium (P2) | Rendered visual quality issue; artistic tuning required |
| [#56 UJG: evaluate and strengthen balance cues during fast steep sliding](https://github.com/nmsimons/arcade/issues/56) | Medium (P2) | Visual evaluation task, not an established physics defect |
| [#57 UJG: validate controller and phone traversal feel with real devices](https://github.com/nmsimons/arcade/issues/57) | Medium (P2) | Outstanding hardware playtesting and parity audit |
| [#58 UJG: verify fast-approach readability and tune framing only where needed](https://github.com/nmsimons/arcade/issues/58) | Medium (P2) | Outstanding visibility/feel evaluation; no proven camera defect |
| [#59 UJG: playtest complete traversal routes and audit medals with current controls](https://github.com/nmsimons/arcade/issues/59) | Medium (P2) | Outstanding route enjoyment/recovery review and current-control timing audit |
| [#60 UJG: resolve the nine unverified traversal browser cases without weakening checks](https://github.com/nmsimons/arcade/issues/60) | Medium (P2) | Observed browser timeouts/loading failure; movement defects not established |

## Implementation order and evaluation

Correct crouched-push and prone clearance and moving recovery first. Build pushing around a supported stance, weight transfer, effort, and visible palm contact; coordinate those issues rather than introducing separate competing gait states. Then address turns, idle, automatic steps, and control teaching. Resolve incomplete browser cases independently and use device, visibility, and complete-route evidence to judge final feel.

Every visual change needs before/after footage at ordinary gameplay scale and an enlarged view, under the same geometry, input, framing, and playback speed. Regression assertions establish contact, motion, and control safety; they do not alone establish natural animation. Preserve responsive controls, fixed limb lengths, actual supporting contacts, momentum, the physical root, and gravity/transport contracts.

Confirmed defects and outstanding evaluations are identified separately in the issue bodies. Hardware feel, camera adequacy, complete-route enjoyment, and current-control medal timing require their specified evidence. Keep those tasks open if that evidence remains unavailable. Follow AGENTS.md and the linked level-design/schema/physics documents before changing authored levels or medal times.

## Dependencies and coordination

| Work | Coordinate with |
| --- | --- |
| Push stance #41 and weight transfer #40 | Share a support-driven presentation state; no conflicting root or gait ownership. Establish the stance before tuning load. |
| Push effort #42, onset #43, and low posture #44 | Use the stance/weight-transfer work and retain final clearance from #45. Contact blend, travel phase, and load are separate concepts. |
| Body clearance #45 and #46 | Share suitable final-geometry checks while retaining distinct crouch/prone postures and existing physics hulls. |
| Recovery #47 and airborne presentation #55 | Preserve #46 clearance and responsive control while changing presentation precedence. |
| Dry turn #48 and ledge departure #52 | Share transient visual orientation without delaying mechanical facing or changing impulses. |
| Tall-step cancellation #49 and Down priority #51 | Document geometry-based commitment and supported cancellation before showing available actions. |
| Water wording #53 and contact teaching #54 | Teach actual bindings and acquisition rules; do not invent propulsion or change solidity. |
| Hardware input #57 and camera #58 | Supply device/viewport evidence for final route and medal evaluation #59. |
| Browser gaps #60 | Investigate independently now; rerun affected cases after relevant movement/animation fixes. |

All child issues are standalone enough for implementation from their body. This table prevents conflicting animation state ownership and identifies where combined before/after evaluation is needed.

