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
| [#54 UJG: teach acquisition and solidity rules through clear first encounters](https://github.com/nmsimons/arcade/issues/54) | Medium (P2) | First ladder and rope guidance implemented and playtested; force-field and broader first-encounter acceptance remains incomplete |
| [#55 UJG: give airborne phases distinct readable athlete poses](https://github.com/nmsimons/arcade/issues/55) | Medium (P2) | Rendered visual quality issue; artistic tuning required |
| [#56 UJG: evaluate and strengthen balance cues during fast steep sliding](https://github.com/nmsimons/arcade/issues/56) | Medium (P2) | Fast balance, entry/turn/landing continuity, shoe load and steep-face clearance addressed; dynamic and brief-contact acceptance remains incomplete |
| [#57 UJG: validate controller and phone traversal feel with real devices](https://github.com/nmsimons/arcade/issues/57) | Medium (P2) | Outstanding hardware playtesting and parity audit |
| [#58 UJG: verify fast-approach readability and tune framing only where needed](https://github.com/nmsimons/arcade/issues/58) | Medium (P2) | Narrow-screen scale, short-room placement and running-jump preview addressed; broad context/route acceptance remains incomplete |
| [#59 UJG: playtest complete traversal routes and audit medals with current controls](https://github.com/nmsimons/arcade/issues/59) | Medium (P2) | Current-control Gold witnesses for First Leap, A Little Swing and Level Five; collection-wide route, recovery and timing acceptance remains incomplete |
| [#60 UJG: resolve the nine unverified traversal browser cases without weakening checks](https://github.com/nmsimons/arcade/issues/60) | Medium (P2) | Daylight allocation churn reduced; original-deadline and slower-machine acceptance remains incomplete |

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

## First implementation pass

October 7, 2026, on `codex/ujg-traversal-fixes`. This pass begins #40, #41, #42, #45, and #46. It does not establish that their entire visual acceptance matrix is complete.

- **#40:** Pelvis balance follows the actual short step and its planted partner. Chest and head follow with a small lag, and the adjustment is eased and bounded to prevent uphill jerks. A one-second moving-crate sample now varies pelvis Y by 0.864 units and shoulder X by 0.402, compared with 0.011 and 0.0013 before. These measurements establish participation; the complete step still needs visual judgment.
- **#41:** A blocked push takes a small rear-foot step to establish a staggered base instead of leaving both feet almost coincident. The normal fixture settles into a 12-unit anchor separation and retains those anchors during another ten seconds of input.
- **#42:** Body loading now distinguishes hand contact from applied effort and resisted locomotion. The load eases into bent knees and a forward chest. On the same blocked crate, full input lowers the pelvis 3.2 units more than 20% input and advances the chest approximately 0.899 units. Existing static-wall arm reach is preserved.
- **#45:** Crouching lowers the working palms from 43 toward 28 units. The final head clearance runs after palm reach and torso balance. The established motor face is retained, including on tilted objects. Three-second crouched-push checks cover head/spine clearance, fixed limb lengths, and palm contact in both directions.
- **#46:** The existing geometric body and limb clearance is shared with prone flight. Thirty-frame checks cover head, spine, arms, legs, and hand outlines in both directions and gravity frames. Drawing remains read-only and uses the established physical hull.

The [baseline pose sheet](images/jumping-pushing-poses.png), [first-pass pose sheet](images/jumping-pushing-first-pass.png), and loops below use the same fixture inputs, framing, scale, and playback speed. The loop boundary is a replay reset. Low-object squat shuffling (#44) and hands arriving after object motion (#43) remain visible and need their own work.

Baseline:

![Baseline pushing animation](images/jumping-pushing-current.gif)

First pass:

![First-pass pushing animation](images/jumping-pushing-first-pass.gif)

Validation: five new permanent simulation regressions pass, as do five production-browser checks using actual keyboard controls. The full UJG run passes 1,354 of 1,359 checks. Its five existing failures are the unrecorded `Untitled level.jump-level.json` catalog entry, three development-file tests blocked by sandbox permissions, and a Windows symlink-permission failure. All recorded route checks pass. Type checking, lint for changed files, and an isolated production build pass. Built-in and local authored levels were not edited in this pass.

**#47 remains unimplemented.** A moving-recovery prototype removed the long slide but failed continuity checks when movement began 0.05 seconds into recovery: advancing foot targets and the gathering legs produced abrupt knee transitions. It was not retained. The next implementation should coordinate gathering with a stable support handoff, avoid replaying ordinary landing compression as a second squat, and count locomotion separately from landing impact and carrier transport. Test movement introduced at 0.05, 0.3, 0.6, and 0.8 seconds into recovery, alongside held-before-landing input.

Remaining acceptance work for this pass includes broader corners/polygons, ceilings, narrow footing, moving carriers and dynamic solids, and gameplay-scale review of full push transitions. No issue is marked complete on the strength of coordinate ranges alone.

## Second implementation pass

October 7, 2026. This pass implements the core changes for #43, #44, #47, and #50 and expands the clearance work for #45 and #46.

- **Contact onset (#43):** The existing contact/load blend still advances once per solved tick. A separate ready pose establishes prop palms on the first force-bearing frame. An exposed-object approach reach prepares the arms between 72 and 38 units without feeding the motor or prop solver. A body sweep rejects preparation through intervening solids. Fresh 30/80-unit box and ball encounters in both directions, running approaches, release/recontact, and keyboard checks retain fixed palms and responsive physics. In the original 33 ms sample, the object travels 0.880 units and palm error is now below 0.001 units instead of the earlier visible gap.
- **Low props (#44):** The low working posture uses a stronger hip hinge and only three units of additional pelvis dip instead of fifteen. Both support legs participate, the advancing ankle passes its partner, and the working pelvis stays above 23 units. The matched clip makes the difference visible: the short-object figure uses bent working legs rather than staying folded in a full squat. Real crouching retains its distinct low posture.
- **Moving get-up (#47):** Meaningful resolved horizontal travel starts a spring toward the current supported gait. The transition advances from the preceding rig and bounds joint travel in three dimensions to prevent the knee reversal found in the discarded prototype. The seed trace reaches the ordinary support gait in approximately 0.1 seconds while retaining the same 410-unit/second motor and 82-unit travel over 0.2 seconds. The full stationary sequence remains. Tests introduce movement at 0.05, 0.3, 0.6, and 0.8 seconds, cover both directions, crouching, polygon support, mirrored gravity, fresh jumps, and a real moving carrier. Carrier transport never starts the spring. The status reads Recovering during the handoff; running step cues wait for the visible gait. The continuity bound is five local units per 1/120-second step, including depth, during this handoff; ordinary running continues to use the established contact gait.
- **Prone clearance (#46):** Final head/spine and limb clearance now also applies throughout grounded recovery. It folds limbs through depth rather than drawing the knees through the floor. Rendering stays read-only.
- **Idle (#50):** The first playable and preview frames initialize feet from prepared geometry without a simulation tick. Quiet arms have a small asymmetric resting angle, enough for the wrists to clear the torso silhouette at gameplay scale. The ledge-climb endpoint eases into that same rest pose. Unsupported starts retain airborne presentation.
- **Expanded crouched clearance (#45):** A permanent 48-encounter matrix checks head and spine outlines, fixed limb lengths, 30/80/140-unit boxes and balls, initial box tilts, both directions, and a low ceiling. It also checks the final mirrored silhouettes.

The following clips show the reviewed baseline and this pass at 1× and 2.6×, with identical inputs, framing, geometry, and real-time playback. The moving floor ticks expose travel; the loop boundary resets the encounter.

![Baseline pushing and idle transitions](images/jumping-pushes-second-baseline.gif)

![Revised pushing and idle transitions](images/jumping-pushes-second-current.gif)

![Baseline moving and stationary recovery](images/jumping-falls-second-baseline.gif)

![Revised moving and stationary recovery](images/jumping-falls-second-current.gif)

Validation: all 14 traversal presentation regressions pass, including the expanded matrix; 39 combined animation/ledge/presentation checks pass. All seven production-browser motion checks pass. The full UJG run passes 1,338 of 1,343 checks with the same five catalog/permission failures recorded above; all recorded route checks pass. Type checking, changed-file lint, and the isolated production build pass. The initial browser high-fall fixture exceeded its declared level height; it was corrected to a valid high platform departed with normal keyboard input before the final passing run.

The clips support the core visual changes but do not complete every issue's acceptance matrix. Outstanding combined cases include recovery reversals and cramped passages, push transitions on slopes and narrow footing, passive-rest contexts, and the final device and route review. The remaining controls, turning, airborne animation, slide balance, camera, teaching, browser gaps, and route/medal issues still require work. Authored levels and medal times remain unchanged.

## Tall-step cancellation pass

October 7, 2026. The core change for #49 lets opposite movement, Down/lower, or explicit detach reverse a 40/60-unit automatic step along its captured entry curve. Twenty-unit stairs retain their immediate stepping behavior. Commitment requires both final sole contacts on actual grippable top geometry; reaching an elapsed frame alone does not commit the tall pull-up. A completed step hands contact back normally. A new obstruction still goes through the ordinary body sweep and interrupts at the last clear body instead of teleporting to the captured source.

The return restores the captured gait, feet, and push pose. A queued jump launches once when the source is supported; pausing clears it even during a return. Permanent checks cover separate opposite/Down/detach requests at early, middle, and late progress, both directions, both gravity frames, and an object collider entering the return path. The exact rig retraces the entry samples; ordinary gait settling at the source stays within one world unit. All 21 step regressions pass, alongside two production keyboard checks. Type checking, changed-file lint, and diff checks pass.

These matched clips show 40/60-unit steps with reversal requested 0.05, 0.15, or 0.25 seconds after entry, at real-time playback and identical 1×/2.6× framing. The baseline carries every request onto the top. The revised rig visibly returns through the preceding supported reach or step, then resumes movement away. The tall late return plants the hands again while the trailing leg comes back below the lip. The loop boundary resets the encounter.

![Baseline automatic steps despite opposite input](images/jumping-steps-third-baseline.gif)

![Revised automatic steps returning on opposite input](images/jumping-steps-third-current.gif)

The combined live moving-prop interference and full route/device acceptance remain outstanding; this pass does not close #49 or the tracker. In the unchanged isolated browser-gap run (#60), seven of nine cases passed and both small-box/ball squeeze cases still exceeded their 30-second limits. Profiling attributes most of their cost to full-screen emission/ambient image composition. Forcing all canvases onto software rendering reduced the instrumented two-second sample only from 15.0 to 13.9 seconds and was not adopted. The original gameplay traces, assertions, and deadlines remain intact.

## Browser rendering investigation

October 7, 2026. For #60, daylight readability emissions now use conservative artwork bounds for robot indicators/headlights and the exit marker. Empty foot-booster artwork does not force a full layer. Unknown artwork and the night player-contrast pass retain the full composition. The coverage pass collects bounds without painting, then replays the normal artwork into a smaller emission buffer; all ordinary foreground occlusion remains in that replay. Rendering remains separate from simulation and input.

Simply cropping the image-copy rectangle did not help: the browser still read back the full 1280×800 source canvas. Using an actual 537×76 emission buffer in the measured squeeze scene reduced the same instrumented two-second run from 14.824 to 7.484 wall seconds, retaining 125 rendered frames. The expensive final emission composite fell from 4.221 seconds to 0.171 seconds. Ambient composition and other work remain measurable costs. These timings describe this local headless browser, not a promise of a specific gameplay frame rate.

A permanent development-browser comparison verifies every RGBA pixel against the original full-viewport composition across 48 combinations of fractional camera/zoom, resizing, offscreen sources, rotated/mirrored robots, occlusion, EMP, goal/headlight/booster artwork, and day/night mode. Its final run passes with zero differing channels. The 53 targeted lighting/air-booster regressions, type checks, changed-file lint, and isolated production build pass. Testing guidance now distinguishes UJG's 50 ms frame cap from Hard Vacuum's 100 ms batching helper, so future tests cannot silently discard half of UJG's simulation time.

The fresh complete nine-case run passed seven cases; both squeeze cases still exceeded their original limits. No timeout, input duration, animation-sample assertion, or frame cadence was relaxed; #60 remains open pending the original checks and slower-machine repeatability.

## Dry turning and grip departure pass

October 7, 2026. The core animation change for #48 captures the preceding rig while mechanical facing and steering change immediately. Opposed momentum keeps the visible body in its outgoing direction, reduces sprint extension, and transfers through depth toward a supported brake. Once momentum changes, a 0.14-second turn establishes the incoming direction. Repeated input changes continue from the actual preceding pose. Planted shoes retain their motor ankle, facing, heel roll, and toe bend; swing shoes turn normally. Caught ledge, climbable, and step poses retain this presentation snapshot, and an actual gravity-contact turn or restart clears it.

The seed full-speed reversal moves the head approximately 2.816 world units on its first tick, versus the baseline's approximately 16.1. The regression limit is six units for that first tick and eight throughout the ordinary turn matrix, measured in world space at 1/120 second. This permits the normal 3.42-unit root travel and body balance while rejecting the original mirror. It is not a universal teleport/collision bound. A real force-bearing prop contact owns the existing reachable brace immediately; the free turn cannot postpone its palms or drag its support shoes.

The shared handoff also begins #52's ledge jump-away animation. It captures the real hanging rig, clears the released hands around the actual lip, and turns toward the outgoing motion. The outward 260-unit impulse, eager mechanical facing, consumed catch press, and fresh-press departure remain unchanged. Rope gravity turns and inherited momentum retain their separate mechanics.

Five new permanent regressions cover both directions, walk/run/partial input, repeated reversals, neutral stop/turn, three slopes, both gravity frames, unsupported air turns, restart, ledge fresh-press departures, and turns meeting 30/80-unit boxes and balls. They check real planted shoe material, fixed three-dimensional limb lengths, world head continuity, force-bearing palms, head clearance, and released hand outlines. All 65 combined turn, animation, step, ledge, and traversal-presentation checks pass. Two production-browser checks exercise keyboard reversal and deliberate lower-then-jump-away; both pass. The reversal fixture initially encountered its default exit and was corrected to put the exit outside the measured path. Type checks, changed-file lint, and the isolated production build pass.

These clips use the same six encounters, inputs, geometry, framing, and real-time playback at 1× and 2.6×. The flight camera follows the physical root so the airborne rig remains visible. Full-speed braking reads as a shorter supported gait before the figure changes direction; repeated reversals retain the preceding support rather than flipping the whole sprint. The ledge departure unfolds from the grip instead of immediately substituting a backward-facing flight rig. The loop boundary restarts each encounter.

![Baseline dry turning and grip departure](images/jumping-turns-fourth-baseline.gif)

![Revised dry turning and grip departure](images/jumping-turns-fourth-current.gif)

The control teaching, broader catch/departure binding matrix, crowded contact transitions, live route review, and physical-device acceptance remain outstanding. This pass does not close #48, #52, or the tracker. Authored levels and medal times remain unchanged.

## Contextual controls and water wording pass

October 7, 2026. This pass implements the core feedback work for #51 and #53 and the departure teaching for #52. The visible cue distinguishes a clear lip from ordinary crouching using the motor's actual exposed-edge and complete-path check. A blocked lowering path keeps crouch available. Vertical climbable acquisition uses the same exclusions in execution and feedback. Hanging cues distinguish pull-up, outward Jump, explicit detach, and release/repress after a consumed Jump or a deliberate lowering. These cues describe current actions and do not advance simulation or alter input.

The keyboard/controller/touch reference now explains diving, passive ascent, submerged-floor crouching, surface jumping, loose-prop pushing and deliberate grip, and automatic terrain-bank catches. It no longer advertises powered swimming upward or an independently selectable upright bottom hold. Controls help opens at the first binding, with Back fixed below a scrollable instruction area. Visual inspection caught the initial expanded help scrolling straight to Back and hiding the bindings; the corrected layout is verified through PageDown, which uses the same scroll target as controller navigation.

A real reverse-gravity defect emerged during this audit: holding Up to lower from ceiling support immediately queued the following pull-up. It could then repeat the lowering/pull-up cycle. The lowering now consumes that original held Up until release, leaving a stable hang. A fresh Up pulls up; Down or explicit detach can release. Ordinary Down lowering retains its established safe drop lock. A lowering that transfers directly onto a ladder or rope retains that mechanism's descent controls. The action-priority table and this gravity distinction are documented in [Jumping game contacts](jumping-physics.md#vertical-actions-and-departures).

Five permanent regressions cover prediction versus the next Down at clear/blocked/threshold/ceiling cases, read-only feedback, controller lower/hold/release/drop/detach/pull-up on both sides and both gravity frames, touch lowering and separate drop gestures, ladder-versus-rope acquisition priority, and pool-floor crouch followed by ascent through the actual controller translator. Released Down and held Up give identical final water position and velocity. The 166 targeted turn, action, ledge, rope-gravity, water, and step checks pass. The full UJG run passes 1,377 of 1,382 checks with the same five user-catalog/permission failures; all recorded routes pass. Type checks, changed-file lint, diff checks, and the isolated production build pass.

All four production keyboard feedback checks pass: normal lower/held-hang/separate drop, reverse-gravity lower/held-hang/fresh pull-up, blocked-path crouch, and pool-floor crouch/buoyant ascent/help. The water fixture was corrected from an unsupported underwater spawn to a valid floor spawn; the inverted fixture was corrected to start the challenge through a normal input before waiting for field motion. The final help-only rerun also passes after the scrolling fix. Evidence is retained separately in `.tmp/ujg-traversal-fixes/feedback-evidence` and `feedback-help-evidence`, so the targeted rerun does not erase the other screenshots.

![Controls help opening at the first binding](images/jumping-actions-help.png)

![Water explanation after scrolling the instruction area](images/jumping-actions-water-help.png)

![Reverse-gravity safe-hang cue](images/jumping-actions-inverted.png)

The following 390×844 keyboard-layout check verifies that the cue stays inside the viewport and wraps legibly. It is not a physical phone playtest.

![Portrait action cue and camera review evidence](images/jumping-actions-portrait.png)

**New concrete evidence for #58:** This valid 600-unit-high lip fixture shows roughly seventy percent empty space above the level in portrait, while the camera is at its 0.42 minimum zoom. The 62-unit standing hull is only about 26 pixels high at that zoom. `gameCamera` selects challenge zoom using width divided by up to 1,800 world units, then anchors short levels to the viewport bottom. Review a larger narrow-screen scale together with vertical centering of levels shorter than the view. Compare useful approach visibility, wall-text reading, catches, tall route previews, water framing, and inverted support at matched inputs before choosing a fix; changing zoom alone must not hide the necessary next landing. The camera remains unchanged in this pass, and portrait readability is not accepted on the strength of cue bounds alone.

Fresh-player prediction, the remaining catch/departure and water sequences across bindings, real-device feel, and route/enjoyment acceptance are still outstanding. No issue is closed in this pass. Authored levels and medal times remain unchanged.

## Fifth implementation pass: airborne balance and real landing preparation

October 8, 2026. The core change for #55 gives takeoff, apex, descent and sustained fall different upper-body balance. Takeoff opens the elbows ahead of the body; the apex gathers the legs and counterbalances with the rear arm; descent opens the leading elbow; an approaching support sweeps the arms back before impact. The curl near zero vertical speed also requires height above the actual takeoff point. A ball removing falling speed therefore does not become a false jump apex. Arms follow the existing eased air amount slightly later on takeoff and retain descending balance while that amount settles on contact. Applied lift and steering make small adjustments; held input without an actual force creates none.

Landing preparation sweeps the current standing or crouched hull through the next 0.16 seconds of projected motion against the current collision world. It excludes ceilings and unavailable landings behind blocking walls. Preparation fades with approach time and the upward component of the contact normal, so the curved side of a rolling ball does not switch the pose on and off. It remains a read-only presentation query and acquires neither support nor a grip. Free-flight arms clear the actual geometry before the existing push, ledge, wall and slide contact owners establish their grips and balance. Real planted feet and the grounded impact absorption retain their motor contracts.

The selected long-fall interpretation is a **controlled, braced fall**. It retains the existing belly-down transition and impact/recovery mechanics, with one arm open for balance and the other folded below the chest. This matches the continued air steering and real foot thrust without inventing uncontrolled flailing or a new flight mechanic. The hands move toward the existing recovery position as real support approaches. The symmetric glide and a tighter fold were rendered with the same real simulation frame and scales; the tighter fold was rejected because its palms merged with the head silhouette.

![Long-fall variants at the same frame and scales](images/jumping-fall-variants.png)

The following recordings compare the original reviewed commit with this pass at the same inputs, geometry, framing, and normal playback speed. The smaller rig uses 0.72 pixels per world unit, approximately the 1,280-pixel desktop challenge scale; the enlarged detail uses 2.6. Each three-second sequence includes a tap from rest, a hold from rest, a running hold, an airborne brake after a tap, a short drop, and a sustained fall with impact/recovery. The view follows the physical root so the flight rig stays visible; the floor appears as it approaches. Exhaust uses the actual foot-booster renderer. The loop boundary restarts each encounter.

![Original airborne sequences facing right](images/jumping-flights-fifth-baseline.gif)

![Revised airborne sequences facing right](images/jumping-flights-fifth-current.gif)

![Original airborne sequences facing left](images/jumping-flights-fifth-left-baseline.gif)

![Revised airborne sequences facing left](images/jumping-flights-fifth-left-current.gif)

The reviewed frames show a compact apex, a more open descending figure, a rearward arm sweep approaching support, and an asymmetric sustained fall. Takeoff continues immediately; the tap's brief extension blends through its short arc, while the held jump retains its longer extension and force-driven exhaust. The rear arm remains close to the silhouette at the apex at small scales, so the portrait camera's undersized character remains a separate readability problem; numeric arm separation alone does not settle #58.

These 1,280×800 production captures show the held jump near its apex under real keyboard controls, using the game's actual camera and lighting. They supplement the matched rig comparisons above rather than substituting a still frame for a movement review.

![Production keyboard held jump facing right](images/jumping-flight-production-right.png)

![Production keyboard held jump facing left](images/jumping-flight-production-left.png)

Two related transition corrections keep the new dry poses in their proper context. The first simulation tick initializes a missing gait from actual support, preserving an unsupported ready pose instead of blending from imaginary ground. A pool-floor release retains its water contact endpoint rather than letting the new dry apex curl take over that endpoint. The existing pool-floor transition checks exposed and verify that boundary. Wall-brace bones and intermittent ball-contact continuity retain their original assertions.

Permanent coverage replaces the former artistic requirement that both arms reach forward throughout flight with phase-specific assertions and retained limb-length/continuity checks. `tests/jumping-airborne-presentation.test.mjs` additionally covers sixteen actual tap/hold/run/drop trajectories across facing and gravity, real pre-contact preparation, slope and concave support, gaps/ceilings/walls, palm clearance, read-only queries, true jet attachment, applied-force balance and the selected sustained-fall silhouette. `tests/browser/jumpingFlight.spec.mjs` uses real keyboard controls for tap and held jumps in both directions, checks their original height ranges and planted landing, and retains apex and resting screenshots. No player state is injected by those browser cases.

Verification: the complete UJG regression set ran as 1,364 module cases plus the 22 main controller cases: **1,381 passed out of 1,386**, with the same five previously documented catalog/environment failures. The catalog failure is the user's added `Untitled level.jump-level.json` lacking a medal audit entry; the other failures are sandbox Git initialization and Windows symlink permissions. The accepted module log is `.tmp/ujg-traversal-fixes/full-flight-accepted-ujg.log`; the 22 controller results are in `flight-main-model.log`. All four production keyboard cases passed on the final build in `flight-browser-accepted.log`, with screenshots retained in `flight-browser-accepted/`. Type checking, affected-file lint, the isolated production build and whitespace checks passed. Existing jump timing, buffering, ceiling, wall/rope launch, water, gravity, contact and recorded-route regressions were retained.

This pass does not complete the physical-device feel, first-encounter teaching, portrait/fast-approach visibility, remaining browser performance gaps, or current route/enjoyment/medal acceptance. Those remain in #54 and #57–#60. Authored levels and medal times remain unchanged.

## Sixth implementation pass: narrow-screen framing and a night-rendering gap

The portrait defect in #58 is addressed in `camera.ts`: challenge zoom has a 0.60 minimum, so the 62-unit standing hull occupies about 37 CSS pixels rather than 26. A fitting short room shares unused vertical space above and below instead of putting almost all of it overhead. Taller rooms preserve 32-pixel padding at both enclosing contacts. The fitted-room and following policies meet continuously on resize, and the existing water camera anchor and gravity-facing body center remain in use. The original renderer accepts the same supplied view as the lit renderer.

The scale comparison below uses the same 390×844 viewport, figure, low crate, upcoming lip and wall text. At 0.65 the upcoming lip disappears from the rest view; 0.60 retains it and makes the figure and hint larger. This is a conservative readability floor, not acceptance of every authored hint or route at every size.

![Matched portrait camera scale comparison](images/jumping-camera-scale-comparison.png)

Increasing scale also reduces forward world coverage. The motor's held running jump covers roughly 430 units, while a centered 320-pixel view at 0.60 shows only 267 units ahead. `GameCamera` therefore adds lead only when the visible half-span is below 480 units. Its target uses actual outgoing velocity above walking speed, is capped at 200 units, blends over 0.12 seconds and has an 800-unit/second rate limit. Another cap keeps at least 72 world units behind the player. Input/facing alone does not flip the view; precision walking stays centered. View state is separate from the player, resets for a fresh player/level and freezes while paused. Room-end clamping still takes precedence.

In the production keyboard fixture, the player reaches vx410 before pressing Space, with the destination lip 406.3 units away. The following distances are taken from the native canvas transform before that press, with no player-state injection:

| Viewport | Forward world coverage | Destination lip distance | Largest rendered horizontal camera increment in the full jump/turn |
| --- | ---: | ---: | ---: |
| 320×740 | 443.4 | 406.3 | 11.8 CSS pixels |
| 390×844 | 463.8 | 406.3 | 11.5 CSS pixels |
| 844×390 | 703.3 | 406.3 | 4.1 CSS pixels |
| 1280×800 | 900.0 | 406.3 | 4.9 CSS pixels |

The visible strip of destination footing is at least one body width before commitment. The normal 180-ms held press crosses the gap and lands on that platform at y600. The subsequent real reversal and release settle back to centered framing. Ground stopping is about 30 units; this test also exposes the landing before the longer airborne commitment instead of judging visibility only against ground braking.

These four-second, normal-speed clips isolate the camera change: both columns use the current motor/rig, identical geometry and controls, and the same 390×844 viewport. Only the left column's camera is loaded from the original reviewed commit. The first clip covers a standing held jump, running, reversal and rest in a short room; the second covers a running gap jump, landing, reversal and rest. The loop boundary resets the encounter. These are native world-render captures; the keyboard tests separately verify the live app's framing.

![Short-room framing before and after](images/jumping-camera-short-comparison.gif)
![Running landing preview before and after](images/jumping-camera-gap-comparison.gif)

Five permanent camera regressions cover readable scale, short-room stability, ceiling/floor padding, fitting-room resize continuity, actual gap traversal, calm walking, full reversal, room ends and a fresh-player reset. They run alongside the existing water-bob camera checks. Nine production browser cases pass with the original 30-second deadlines: the same jump/turn at four sizes in day/night mode, plus a real gravity reversal to inverted ceiling support in a fixed portrait short-room view. A separate development-browser comparison covers 48 original/lit framing combinations, including pixel-density changes, water anchoring and inverted support. Canvas rounds its two transform APIs at different stages; the comparison bounds that difference below .001 backing pixel rather than mistaking numerical roundoff for a view change.

The new desktop night case exposed a repeatable performance margin problem: all movement checks could finish, but the case exceeded its deadline at 31.2 seconds. When there are no active lights, the night light field is constant ambient; both structural correction masks are black and the beam/haze layers are empty. `LightingRenderer` now omits those empty passes while retaining its original full composition as a reference. A dedicated 48-frame comparison checks every RGBA channel through resizing, fractional framing, occlusion, emissions, power transitions, exit fading and Canvas/GPU requests. The earlier 48-combination emission comparison also retains the original night path as its reference. The optimized desktop night case completes in 18.9 seconds with the same controls, duration, render cadence and assertions.

The full UJG regression run after the camera change reports **1,391 tests: 1,386 pass and the same five known failures** (the user's indexed Untitled level still needs a medal audit; sandbox restrictions prevent a temporary Git setup and Windows symlink creation). The subsequent 49 affected camera/water/lighting checks pass after the empty-night-pass optimization. Type checks, changed-file lint and the isolated production build pass. The known full-suite failures are retained explicitly.

This establishes the narrow-screen scale/short-room fix and this running-jump preview, not the whole #58 acceptance matrix. First approaches in tall authored routes, both-direction commitment examples, rope/ladder catches, cargo/gate encounters, water exits and active night lighting still need their combined route review. The original two daylight squeeze performance gaps in #60, physical-device feel in #57, teaching in #54 and current route/medal acceptance in #59 remain open. User-authored levels and medal times are preserved.

## Seventh implementation pass: stable daylight scratch storage

October 8, 2026. The daylight emission canvas was resized from its small
emission rectangle to the whole viewport for ambient correction, then back
again on the next frame. The measured two-second crowded-object sequence
therefore assigned canvas dimensions 500 times across 125 rendered frames.
Daylight now uses the already allocated haze surface for ambient correction;
night keeps its source haze intact. Emission storage rounds up to 32-pixel
buckets within the existing viewport budget. Its view and copied source
rectangle retain the exact original dimensions, so padding never becomes
visible artwork. Daylight also omits the athlete shadow outline calculation
that only the night contrast correction uses.

The same native keyboard sequence records zero dimension assignments after
warming the final storage scheme. Absolute timings varied substantially across
separate runs, so they are not evidence of a large speedup. An alternating
comparison in one browser, with identical motor/art state and equal forced
completion of deferred drawing, measures 145 settled Canvas frame pairs:
4,795.8 ms for the original storage versus 4,508.9 ms for reused storage,
approximately six percent less time. This is a local render benchmark, not an
accepted game frame rate or a slower-machine pass.

Permanent browser comparisons cover 14 frames per Canvas/GPU request, including
fractional view changes and repeated lit day/night transitions. Every RGBA
channel matches the reference; optimized storage performs zero steady-frame
resizes against 40 reference assignments, with the same reported buffer budget.
The existing 48-frame emission and 48-frame unlit-night comparisons also pass
with zero differences. All 57 affected lighting/booster regressions, type
checking, changed-file lint and the isolated production build pass.

**#60 remains open.** The nine-case diagnostic run using the bucketed storage
reports six passes and three failures, without changing deadlines, controls,
render cadence or assertions. Retained traces classify the remaining failures:

- The normal squeeze case times out during the final 500 ms release/settle
  advance. Its two-second advances take roughly 7.7–8.2 wall seconds. The
  sampled body-continuity assertions complete; the final case still does not.
- The reversed squeeze case reaches its screenshot after the held-contact
  assertions and exceeds the 30-second whole-test limit. Two-second advances
  take roughly 7.8–8.5 wall seconds. This remains a performance failure rather
  than proof of an animation discontinuity.
- The right-bank water case completes its movement checks and bank-cleared
  screenshot, then exceeds its existing 90-second context-teardown limit.
  Its trace shows the long teardown fixture; classify that separately from
  bank traversal and from the original loading failure.

The 18-unit pull-up, both pinned-ball approaches, both inverted-rope departures
and left-bank water case complete their original checks. Trace summaries are
retained in `.tmp/ujg-traversal-fixes/gap-trace-classification.jsonl`; the native
paired timings are in `renderer-paired.json`. Further work must profile the live
game loop and diagnostic overhead as well as full-frame composition, investigate
context cleanup, and demonstrate the complete original matrix under the
repository browser projects and a slower machine. The modest allocation fix
does not satisfy that acceptance by itself.

## Eighth implementation pass: first ladder and rope encounters

The current 23-file ordered collection has these first relevant encounters:

| Rule | First built-in encounter | Teaching and recovery | Remaining acceptance |
| --- | --- | --- | --- |
| Ladder needs vertical input | First Leap, `00.json`; ladder x560, y1200–1600 | A compact “Hold up / to climb” hint sits in the clear gap. A missed approach lands on the continuous floor; Up acquires the ladder and returns to the starting bank. | Broader bindings and fresh-player review remain part of #57. |
| Airborne rope catches automatically | A Little Swing, `02.json`; anchor (840,700), length 390 | “Jump into the rope. / It catches you.” is readable on the approach. The live cue explains release/new press after the catch. A miss reaches the floor and the same recovery ladder. | Other rope, wall-rappel and transfer contexts retain their separate acceptance. |
| Terrain bank versus loose float grip | None in the current built-in collection | Existing water/action fixtures demonstrate terrain catches and conditional Up grip on props; no authored first encounter is claimed. | Audit the first authored water encounter when present, including a missed prop grip and a usable exit. |
| Field blocks/supports the player but has no grip lip; props pass through | Drain, `Drain.json`; vertical field x200, y3000–3200 | The reversed coin switch at (230,3015) removes the field at 45 coins. The field is introduced beside a crowded ball/gravity shaft without local explanatory text. | Playtest the approach, visible prop passage, unsuccessful grip, valid departure and recovery with current controls before choosing local guidance or layout changes. |
| EMP activates on collection and changes supports/power | None in the current built-in collection | No current authored first encounter or recovery is claimed. | Review an actual EMP encounter, its five-second consequences and recovery before accepting this teaching requirement. |

First Leap's previous “Press A” graffiti is replaced by “Run up. / Hold jump.”
so the instruction describes the action across devices. The existing controller
joke is retained. The recovery hint initially extended behind the opposite bank;
the reviewed portrait screenshot exposed the clipping. Its final two-line,
180-unit area fits inside the clear gap. A Little Swing gains the automatic-catch
hint and the same compact recovery cue. Geometry, mechanisms and medal times
are unchanged. The design brief now records this contact-contrast teaching
principle and the need to review guidance from real approach/recovery positions.

The matched 390×844 ready views use the same current motor/camera and normal
rendering; only the authored guidance changes:

[First Leap before](images/jumping-introduction-first-before.png) and
[after](images/jumping-introduction-first-after.png);
[A Little Swing before](images/jumping-introduction-rope-before.png) and
[after](images/jumping-introduction-rope-after.png).

![Recovery hint visible after a missed First Leap approach](images/jumping-introduction-recovery.png)

![Automatic rope catch and its held-press departure cue](images/jumping-introduction-rope-catch.png)

Four permanent fixed-step recordings use only current move, climb and press/hold
inputs against the runtime JSON. First Leap's direct route scores 2.608 seconds
against Gold 3.5; A Little Swing scores 6.267 against Gold 7. Their complete
fall/ladder/return routes score 9.025 and 12.508 seconds respectively, earning
Bronze. These are demonstrated routes, not a collection-wide medal audit.
Historical recordings are retained unchanged. All four new regressions pass.

Four production keyboard checks pass at ordinary render cadence in portrait:
the held running jump, both missed-approach ladder recoveries, and automatic
rope catch/climb/swing/fresh-press departure through the doorway. Both direct
routes receive Gold in the live app; the rope witness shown below scores 6.23
seconds. The tests advance through the existing 80 ms HUD publication boundary
before checking a changed action cue; waiting on a frozen clock alone cannot
publish that cue. Screenshots were reviewed for readability, occlusion, camera
framing and contact explanation rather than treating completion as visual proof.

![Current keyboard rope-route Gold witness](images/jumping-introduction-rope-gold.png)

The full current UJG suite reports **1,395 checks: 1,393 pass and two fail**.
Both failures occur when the security fixtures request Windows file symlinks
and receive EPERM, including in the unrestricted test run. Temporary Git and
the current catalog audit pass. The complete log is
`.tmp/ujg-traversal-fixes/introduction-full-ujg.log`. Level validation checks all
23 current assets; type checking, affected lint and the isolated build pass.

This pass establishes the two introductory teaching/recovery routes and their
portrait readability. It does not settle the force-field/EMP/water teaching,
physical-device feel, fast steep sliding, the broader camera/interaction
matrix, collection-wide enjoyment/medals, or original browser performance
acceptance. No issue is closed on the strength of this batch.

## Ninth pass: fast slide balance and actual limb clearance

October 8, 2026. Normal movement into the shared regression terrain in
`tests/helpers/jumping-slide.mjs` establishes walking and running entries on
46.3°, 46.5°, 55° and 70° faces. The whole encounter is mirrored for the other
direction. Inverted runs start on the floor and acquire the ceiling through an
always-on upward gravity field; they do not inject an inverted player state.
Uphill, downhill and released input are evaluated after first contact. The
sliding motor continues to integrate gravity and friction; held direction alone
does not manufacture a force or animation load.

At ordinary gameplay scale the previous 55° fast slide still read as a relaxed
upright person with low arms. The existing speed term changed the hands, but
not enough to explain balancing at 600–1,300 units/second. Three native versions
were compared with identical geometry, inputs, framing and 30 Hz playback:
the previous rig, a modest counterbalance, and a stronger chest/arm version.
The modest version was selected. The stronger version's raised hand and chest
lean read as a gesture rather than restrained balance.

The [previous pose sheet](images/jumping-slide-baseline.png),
[selected pose sheet](images/jumping-slide-current.png), and
[stronger variant](images/jumping-slide-v2.png) retain the same samples.
The native gameplay camera appears on the left of each loop, with a three-times
detail view on the right. The loop boundary is a fresh replay reset.

Previous 55° walking entry through landing:

![Previous native 55-degree slide](images/jumping-slide-55-walk-normal-settle-baseline.gif)

Selected 55° walking entry through landing:

![Selected native 55-degree slide](images/jumping-slide-55-walk-normal-settle-current.gif)

Previous 70° running entry through landing:

![Previous native 70-degree slide](images/jumping-slide-70-run-normal-settle-baseline.gif)

Selected 70° running entry through landing:

![Selected native 70-degree slide](images/jumping-slide-70-run-normal-settle-current.gif)

Matched [inverted before](images/jumping-slide-55-run-inverted-settle-baseline.gif)
and [inverted after](images/jumping-slide-55-run-inverted-settle-current.gif),
plus [jump departure before](images/jumping-slide-55-run-normal-jump-baseline.gif)
and [jump departure after](images/jumping-slide-55-run-normal-jump-current.gif),
retain the original root and control traces as well.

The selected rig retains the existing calm pose below 130 units/second. As
resolved slip gathers, the chest and head counterbalance the feet, one forearm
lifts toward waist/chest height, and the other stays lower. The pelvis does not
introduce a new deep crouch. An 80 ms presentation response to resolved tangent
speed prevents a collision from instantly converting the raised arm into a
hanging arm. This value never feeds the friction, traction, collision or jump
motor and is discarded with the slide state. Direct zero-slip and slow-reversal
checks still retain their strict rest/continuity requirements.

The review also reproduced actual silhouette penetration on a 70° face:
the front knee entered terrain by as much as 8.35 world units and a palm by
6.57. Clearing the free-flight arms before the slide was insufficient because
the slide subsequently replaced their targets. The final slide now clears its
own arms and folds obstructed knees/elbows through depth while retaining both
bone lengths and the sliding soles. Corrections use each joint's actual nearest
solid face. The root's contact point can already be on the landing plateau while
its retained slip angle still belongs to the steep face; extending that tangent
over the plateau over-folded a clear knee in the first prototype. That prototype
was replaced with the actual-geometry correction.

The native outline regressions allow the outline flattener's 0.2-unit tolerance;
the remaining sampled heel contour overlap is below 0.13 units. Deep leg and
hand penetration is absent in the checked runs. The body query, fixed 3D bone
lengths and actual sole contacts are verified during the whole slide and its
release, in both directions and gravity frames. The new 70° clearance cases
fail in all four direction/gravity combinations against the previous rig.

Walking and running 55° traces contain 359 and 229 fixed steps respectively.
Their physical X/Y, velocity, grounded state and facing agree exactly with the
previous version at every step. Repeated render/debug queries also leave the
normal uphill/downhill input traces unchanged. All **143 affected regression
checks pass**, covering slide/friction, animation, prone and pushing presentation,
dry turns, airborne balance, wall braces/jumps, gravity rendering, water/ball
contacts, terrain ordering and rope/object slopes. Types, affected lint and the
isolated production build pass; the build validates 23 built-in levels.

All **six production keyboard checks pass** at ordinary render cadence and
390×844 framing: walking entries followed by fast neutral slides and a fresh
jump in both directions; both inverted 70° slides; and both grippable 46.3°
walking approaches. The walking-entry test observes the actual first slip before
releasing movement. Its initial fixed-duration attempt released just before
contact and correctly remained standing on the plateau; that was an incorrect
test input trace, not evidence of a traversal failure.

### Remaining #56 transition defects and exact next steps

**#56 remains open.** The whole-clip review and per-step 3D rig audit expose
three boundaries that steady-state balance/clearance tests cannot establish:

- **Walking/running departure from the plateau:** using the shared fixture,
  start normally with move=1, then release movement on the first active slide.
  On the 55° face, at fixed-step index 26 (0.2167 seconds), the front knee changes
  by 11.92 world units relative to the root in one tick; the 46.5° version changes
  by 9.37. These magnitudes are also present in the previous rig. Contact clears
  `p.footwork` and the free airborne leg construction loses the last supported
  rig before the slide's 0.12-second blend has acquired weight. Preserve the
  actual outgoing foot/leg pose through this support handoff, with fixed bones
  and real clearance. Increasing the blend duration alone cannot restore an
  already-discarded source pose. Prove smooth entry with both Shift-walk and run,
  both directions, and gravity reflection; keep fresh-press jump response.
- **Automatic canted-wall facing change:** in the 70° version of the same
  neutral trace, `settleWallBrace` changes facing from +1 to -1 at index 41
  (0.3417 seconds), while slide weight is about 0.625 and input is zero. A hand
  changes by about 20 units relative to the root in a single tick (the previous
  rig changes by 19.4). `captureDryTurn` currently captures requested reversals
  and grip departures, so this contact-selected facing change has no outgoing
  rig. Capture and transfer that visual orientation without delaying mechanical
  facing or moving a loaded grip. Check the mirrored and inverted encounter,
  held uphill/downhill intent and a jump during the handoff.
- **Steep face into the flat landing:** the retained slope normal, nearest
  contact point and eventual flat support change on successive ticks. The
  fast body then changes to slow balance while each foot clears the corner.
  The new speed response addresses instant arm unloading, but local knee/foot
  changes can still exceed eight units, and held-input variants exceed ten.
  Use the actual outgoing solved rig and the new reachable landing contacts
  for a bounded support transfer. Maintain 15/14.5-unit leg bones, 10/9-unit arm
  bones, safe knee opening, real soles and the current root/velocity trace.
  Do not rotate the whole athlete to the new ground angle or relax clearance
  assertions to hide the corner.

For those fixes, preserve a per-tick record in the player's gravity frame and
compare 3D joint positions relative to the physical root, including bend depth
and mechanical-facing reflection. A proposed visible continuity target is no
more than five world units per 1/120-second tick through these handoffs. Physical
root travel at high slip speed is evaluated separately; it must not be clamped
to achieve a presentation limit. Inspect native gameplay and enlarged playback
of the complete approach, contact, reversal/jump and landing, and retain the
existing brief-contact, ball-side and narrow-gap regressions.

Evidence and diagnostics are saved under `.tmp/ujg-traversal-fixes/`:
`slide-regressions-baseline.log`, `slide-affected-final.log`,
`slide-browser-final.log`, and the paired
`slide-motion-{baseline,current}.jsonl` records. These remaining transition
defects are part of the existing #56 acceptance, rather than additional claims
that the passing steady-state tests have resolved it.

The original nine browser cases were rerun with their original inputs, deadlines,
normal render cadence and frame/continuity assertions. **Seven pass and two exceed
their 30-second deadlines** in 4.2 minutes: both squeeze cases remain incomplete.
The normal-order case reports its timeout during a held-body screenshot; the
reversed-order trace is still retrieving motion history when the deadline ends.
Two simulated seconds of normal rendering cost roughly 7.7–8.7 wall-clock
seconds. There is no recorded failed movement assertion, and this is not an
acceptance pass. Both pool banks complete in this run, including right-bank
teardown; the previous teardown timeout still requires repeatability review.
The unchanged-case log and trace classification are
`browser-gaps-slide.log` and `gap-trace-slide.jsonl`. #60 remains open for the
two deadlines, repeatability and slower-machine evidence.

## Tenth pass: retain outgoing slide support and contact-selected turns

October 8, 2026. This pass addresses the entry and automatic-facing defects in
#56, while preserving the ninth pass's fast counterbalance. The landing-corner
handoff remains open.

**Entry fix.** The last supported rig now transfers into the actual current rig
over 120 ms. A detached snapshot preserves its shoes, gait and body before the
motor discards footwork. The outgoing pose is solved only when a slip starts;
ordinary supported movement does not perform an extra pose query. The handoff
survives a one-tick slip followed by temporarily lost contact. The first
prototype kept the source only inside `p.sliding`, which merely moved the
11.92-unit snap from the first contact to the following tick. The retained
`slideEntry` state fixes that boundary, then expires. A zero-weight fall timer
does not discard it; an actual prone pose, grip, water state, real loaded palms,
cancellation, gravity reorientation or respawn owns its appropriate transition.

**Facing fix.** An airborne sweep can acquire a canted brace after a frame with
neither sliding nor bracing. A lazy pre-step snapshot now supplies the outgoing
rig when that contact chooses a new facing. Capturing only already-active
slides missed the slow 70° walking case, which still mirrored a hand by 19.08
units at step 72. Mechanical facing and fresh jump response remain immediate.
The visible slide turn takes 160 ms; ordinary dry turns retain 140 ms. Bend depth
follows elapsed handoff time and settles before completion. Using the changing
per-tick interpolation fraction as the depth phase loaded a knee late and then
dropped that depth on the last tick.

**Clearance fix.** Moving a shoe out of terrain retains its nearest existing
3D knee bend instead of rebuilding a planar knee on the opposite side. Sliding
turns retain this approach even if the actual contact briefly disappears. Knee
clearance uses the real solid geometry and fixed endpoints. Ankle and hand
angles use the shorter rotation across the wrap boundary. During these
transfers, clearance also samples the drawn heel and forefoot curves, including
the upper contour and the independently flexed toe hinge. Sole-only probes
missed a rotated toe entering the plateau crease. Rendering and those probes
share the same curve definitions; the existing steady-slide sole contact
requirements remain in force.

The transfer also gathers the feet through depth early enough to retain a 45°
knee opening without moving their visible targets into terrain. When a shoe
needs depth to remain reachable, knee clearance rotates its bend around the
actual 3D endpoint axis, preserving both bone lengths. The full suite caught
the intermediate overfold; its strict knee assertion remains in the regressions.

Six new permanent regressions exercise **72 normal-control entry/turn
encounters**: walking/running, 46.5°/55°/70°, both directions, both gravity frames,
and released/uphill/downhill intent. Every 1/120-second step through the first
50 steps after slip checks the 3D joints relative to the physical root, including
mechanical-facing reflection and bend depth. The five-unit continuity limit,
fixed 15/14.5 leg and 10/9 arm lengths, safe knee opening, and native silhouette
clearance are retained. All six fail against the previous `ea19328` rig and pass
with this handoff. A seventh regression checks immediate fresh jumps one and
20 steps after first slip across walking/running, direction and gravity frames.

All **151 affected checks pass**. A separate comparison of all 72 complete
movement traces against `ea19328` agrees exactly in X/Y, velocity, grounded
state, mechanical facing and slide state at every step. Additional render and
debug queries remain read-only. Types, affected lint and the isolated build
pass; the build validates 23 built-in assets.

The complete UJG suite reports **1,416 passes out of 1,418 checks**, with no
movement or animation failures. The other two checks fail when Windows denies
creation of their security-test symlinks (`EPERM`); they remain unverified.
The final complete log is `slide-transfer-full-ujg-final.log`.

The production keyboard matrix runs at normal render cadence in a 390×844
viewport. The earlier ten-case run passed; the final build's run reports
**nine passes and one loading timeout**. That case remains in the Loading game
dialog past its unchanged five-second chooser deadline, before receiving any
movement input. This is a repeatability concern for #60, not a passed movement
case. The matrix includes the original six slide checks and four slow 70°
approaches that release movement, wait for the real contact-selected brace,
check projected joint continuity, and press Space during that turn. Every
press in the completed cases launches immediately. Their screenshots and motion witnesses are in
`.tmp/ujg-traversal-fixes/slide-browser/`; the complete log is
`slide-transfer-browser-safe.log`.
The unchanged loading-timeout case passes on an isolated repeat in 4.6 seconds,
including the entire brace transfer, continuity checks and fresh Space launch.
That separate log is `slide-transfer-browser-loading-repeat.log`; the failed
full-run trace is preserved. This does not establish loading repeatability.

Matched native playback retains the same controls, physical traces, camera and
30 Hz timing. Each loop starts a fresh replay. The gameplay camera appears on
the left and the three-times detail on the right. Adjacent-frame sheets were
also inspected across the whole entry and turning window: the running leg
continues its outgoing step before gathering, and the steep-face turn no
longer replaces the limb orientation in one frame.

Mirrored 55° running approach with uphill intent:
[before](images/jumping-slide-transfer-55-run-left-normal-uphill-before.gif) /
[after](images/jumping-slide-transfer-55-run-left-normal-uphill-after.gif).

Slow 70° walking approach and automatic brace turn:

![Previous slow slide entry and turn](images/jumping-slide-transfer-70-walk-right-normal-neutral-before.gif)

![Retained outgoing support and turn](images/jumping-slide-transfer-70-walk-right-normal-neutral-after.gif)

The matched
[inverted before](images/jumping-slide-transfer-70-walk-right-inverted-neutral-before.gif) /
[inverted after](images/jumping-slide-transfer-70-walk-right-inverted-neutral-after.gif),
and
[jump-during-turn before](images/jumping-slide-transfer-70-run-right-normal-jump-before.gif) /
[jump-during-turn after](images/jumping-slide-transfer-70-run-right-normal-jump-after.gif)
retain the same scene and physical motion as well.

**Remaining #56 acceptance:** the steep-to-flat landing still changes its
contact point, slope and reachable shoes on successive ticks. The ninth pass's
8–13-unit knee/foot discontinuities are not repaired by this entry/turn batch.
Preserve the outgoing solved rig through that corner, anticipate reachable
flat support early enough to keep the drawn skin clear, and apply the same
five-unit relative-joint target without clamping the physical root. Verify
both walking/running approaches, both directions/gravity frames, neutral and
held intent, a fresh jump at the corner, actual soles and complete native
playback. Broader dynamic-object/brief-contact interaction and the existing
original-browser performance gaps also remain separate acceptance gates.
No GitHub issue is closed by this pass.

## Eleventh pass: gather for connected landing and retain braking orientation

October 8, 2026. The steep-to-flat corner in #56 now has a retained handoff;
its remaining visible support problem is quantified below. No issue is closed.

The wider normal-control audit reproduces a greater-than-five-unit relative
joint change in **69 of 72** approaches in the previous `b4d16b5` rig. It covers
46.5°/55°/70°, walking/running, both directions and gravity frames, and neutral,
uphill and downhill intent. The worst knee change is 12.73 units. Success is
measured relative to the unchanged physical root, including 3D bend depth.

**Connected landing.** A real adjacent grippable face now supplies up to 100 ms
of advance notice. Only an edge matching the current slip face and lying near
its actual contact can advertise that support; an unrelated parallel slope
cannot supply a landing cue. The visual rig gathers toward the incoming face
while the collision motor keeps its exact slope, contact, velocity and friction.
Resolved slip momentum carries that preparation through abrupt physical
braking. Once supported, the fading slide follows the new support rather than
retaining an increasingly distant old foot target.

The cached outgoing rig advances only after body, shoe and limb clearance.
Every joint and sampled heel/toe material point is limited to five units per
1/120-second tick in three dimensions. The interpolation continues beyond its
nominal 120 ms when necessary, until the actual target is reached. The shoe
also passes through its end view before changing facing; an ankle-only check
missed visible toe flips of roughly 15 units. Pitch and toe bend remain
continuous across that change, and clearance uses the projected drawn shape.

**Braking and rest.** Gameplay-scale playback caught a prototype that began
running toward uphill input while momentum still carried it downhill. The
landing now retains the outgoing visible direction and suppresses the run
amount during braking. Motor steering remains immediate. Real footwork follows
the same visible direction. If braking continues after the slide fades, the
already-solved rig transfers directly to the ordinary dry-turn owner.

A further prototype stalled at rest when its outgoing knee and the standing
knee lay on opposite sides of the reach axis. The solved bend now crosses
through depth while the continuity limit remains active; a supported knee may
use the normal 15° opening, while an unsupported knee retains the 45° minimum.
The permanent checks require the handoff to complete, so a frozen but
coordinate-stable rig cannot pass.

All **31 slide regressions pass**. Six new groups cover the entire landing and
release in the 72 encounters, with strict 3D joint/shoe continuity, fixed
15/14.5 leg and 10/9 arm lengths, safe knee opening, native silhouette clearance,
braking direction, and actual completion. Those six expose the old rig's corner
defects. Three further groups exercise **144 fresh jumps** during the corner
gather or on first real supported contact. Every press launches on its input
tick. The first supported-contact fixture incorrectly required the visual
handoff still to be active in every case; that overlap does not exist in one
55° walking encounter. It now waits for actual support, without changing the
jump response assertion.

A separate complete comparison of all 72 physical movement traces against the
previous motor agrees exactly at every step. Render/debug queries remain
read-only. Types, affected lint and the isolated production build pass.
The complete UJG suite passes **1425 of 1427** checks; the two failures are
the existing Windows security tests that require unavailable symlink privileges
(`EPERM`). No gameplay regression fails.
The production observer includes `signals.slideLanding` so the keyboard checks
can witness both acquisition and release of the presentation owner.

Both 14-case production keyboard runs pass at normal render cadence, including
four complete landings in a 390×844 viewport and a fresh Space press after
support. The final run covers the subsequent braking and shoe-turn repairs and
completes in 2.2 minutes. Inputs, deadlines and cadence remain unchanged.

Matched native gameplay and three-times detail use the same controls, geometry,
camera and 30 Hz timing, including another half second after the original slide
ends. Each loop is a fresh replay. The enlarged adjacent-frame sheets were
reviewed across approach, contact, braking, gait release and rest. They show the
gather beginning before the crease and preserve the outgoing braking direction.

Mirrored 55° running approach with uphill intent:
[before](images/jumping-slide-landing-55-run-left-normal-uphill-before.gif) /
[after](images/jumping-slide-landing-55-run-left-normal-uphill-after.gif).

Slow 70° walking approach and landing:

![Previous corner landing](images/jumping-slide-landing-70-walk-right-normal-neutral-before.gif)

![Retained corner landing](images/jumping-slide-landing-70-walk-right-normal-neutral-after.gif)

Matched
[inverted before](images/jumping-slide-landing-70-walk-right-inverted-neutral-before.gif) /
[inverted after](images/jumping-slide-landing-70-walk-right-inverted-neutral-after.gif),
and
[downhill-intent before](images/jumping-slide-landing-70-run-right-normal-downhill-before.gif) /
[downhill-intent after](images/jumping-slide-landing-70-run-right-normal-downhill-after.gif)
also retain the full landing and return to the current supported gait.

**Remaining #56 support defect.** In **29 of 72** approaches, the nearest visible
sole sample is more than 0.5 units from the actual terrain during a grounded
landing-handoff tick; the worst gap is **3.95 units**. This is a visible load
timing problem even though the rig now passes the continuity and clearance
checks. Reproduce with 46.5° running, rightward movement, inverted gravity and
uphill intent: the gap reaches 3.86 at tick 281. Ordinary 55° running in either
direction and downhill intent provides further cases. The control trace remains
physically supported; both visible shoes temporarily lag above its support.

The next repair must establish a reachable, load-bearing visible sole on the
actual floor during the support transfer. Anticipate the selected shoe and
pelvis before contact if a post-contact correction would exceed the five-unit
joint/material-point limit. Preserve motor support, actual friction/jumps,
fixed bone lengths, terrain clearance and continuous shoe facing. Keep the
other foot free to finish gathering. Verify at least one real shoe-material
contact within 0.06 units on force-bearing support frames, and inspect native
gameplay through contact, braking, the first supported step and rest. A root
clamp, hidden foot, fake contact flag or raised tolerance is not a repair.

Reproducers, matrix records and validation logs are under
`.tmp/ujg-traversal-fixes/`: `slide-landing-support.mjs`,
`slide-landing-support.log`, `slide-landing-stall.mjs`,
`slide-landing-before-regressions.log`, `slide-landing-shoes-final.log`,
`slide-landing-full-ujg-final.log`, and `slide-landing-browser-final.log`.
Dynamic/brief-contact interactions, the original browser performance gaps,
physical-device feel and the broader route/camera review remain separate gates.

## Twelfth pass: preserve real shoe load through the landing transfer

October 8, 2026. The support-gap audit above counted every grounded motor tick,
including the running stride's brief flight phase. The more precise audit checks
the real footwork's force-bearing shoes. In the previous `ca2bbc6` rig, **22 of
72 approaches** exceed 0.06 units of visible sole separation while a foot is
loaded; the worst is **1.258 units**, in a normal 46.5° running approach with
downhill intent at tick 224. The earlier 3.95-unit maximum occurs with both
stride feet in flight, so it does not establish missing visible load by itself.

Each loaded landing shoe now reaches the actual terrain under its drawn heel
and toe. The pelvis lowers only enough to preserve fixed reachable leg lengths.
That solved load participates in the existing five-unit 3D joint/material-point
continuity check before a pose advances. The swing shoe keeps gathering; the
ordinary run retains its flight phase. Support flags, collision motor, friction,
velocity and fresh-jump timing are unchanged.

All **31 slide regressions pass** with added independent geometry assertions for
the actual loaded shoes throughout all 72 landings. The six landing groups
fail on the preceding rig specifically on visible sole separation (25 pass,
six fail). Some individual stride phases finish the presentation handoff while
both feet remain in flight; each approach group must still witness real loaded
samples, and every such sample must pass. Native silhouette clearance, fixed
bones, safe knees, continuity, handoff completion and the 144 fresh-jump cases
retain their existing assertions. All 72 complete physical traces still agree
exactly with the preceding motor. Types, affected lint and isolated build pass.
An independent complete audit measures **1,019 loaded-shoe samples** with a
maximum gap of **0.02 units** and no separation above the 0.06-unit limit.

Matched 30 Hz native gameplay and three-times detail compare against `ca2bbc6`,
using identical geometry, controls, camera, timing and an additional half second
after slide release. Adjacent-frame sheets were inspected through contact,
loaded steps, braking and rest. The repair keeps the loaded shoe on its floor
without removing the free foot's lift or inserting a second landing squat.

46.5° running approach with downhill intent:
[before](images/jumping-slide-support-46.5-run-right-normal-downhill-before.gif) /
[after](images/jumping-slide-support-46.5-run-right-normal-downhill-after.gif).

55° mirrored walking approach with uphill intent:
[before](images/jumping-slide-support-55-walk-left-normal-uphill-before.gif) /
[after](images/jumping-slide-support-55-walk-left-normal-uphill-after.gif).

70° walking approach and braking:
[before](images/jumping-slide-support-70-walk-right-normal-uphill-before.gif) /
[after](images/jumping-slide-support-70-walk-right-normal-uphill-after.gif).

55° inverted walking approach and braking:
[before](images/jumping-slide-support-55-walk-right-inverted-uphill-before.gif) /
[after](images/jumping-slide-support-55-walk-right-inverted-uphill-after.gif).

The complete UJG suite passes **1425 of 1427** checks in 185.7 seconds; the two
failures remain the Windows security tests requiring unavailable symlink
privileges (`EPERM`). All **14 production-browser checks pass** in 2.2 minutes
with their original controls, deadlines and render cadence.

Logs and independent reproducers are under `.tmp/ujg-traversal-fixes/`:
`slide-landing-loaded-support.log`, `slide-support-loaded-matrix.log`,
`slide-support-before-tests-final.log`, `slide-loaded-support-final.log`,
`slide-support-motor.json`, `slide-support-full-ujg.log` and
`slide-support-browser.log`. Dynamic-object and brief-contact interactions still
need their own native review; #56 remains open for that acceptance. No issue is
closed by this pass.

