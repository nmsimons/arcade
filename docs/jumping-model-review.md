# Player model review

The first pass establishes a frozen reference for evaluating the current player
before making artwork or animation changes. Preserve its simple two-dimensional
style, normal foot proportions, and readable contact with the world. Changes
should earn their place at gameplay size as well as in an enlarged view.

## Open the study

Run the development server and open `/lab/model-review`, or choose **Player model
review** in the game's developer panel (backtick). This page, its fixtures and
reference images are outside the production game.

Choose one of nine recordings. Play, pause, scrub, or step through individual
frames. **Key pose** selects a representative state. Playback supports half and
quarter speed, looping, and Space / Left / Right keyboard shortcuts when a form
control does not have focus. Clip URLs retain the selected recording.

The Reference menu selects either the frozen baseline or the current hand shape
at 100%. The right column offers 100%, 112%, and 120% hand sizes; the approved
112% is the default and matches the actual game. Comparison previews use
synchronized frames. Each includes a detail view and a fixed 0.75× gameplay-size view. Change
the backdrop to inspect day facility, night facility, sky, and pale cave-wall
contrast. Toggle silhouettes, joints, contact surfaces, or a reflected view.
Reflection is a viewing aid; it does not constitute a separate left-facing
physics recording. The stride and rope clips also include actual turns.

The lower **In-game context** view uses the production lighting renderer, the
current game's 112% hands and its 0.6× small-screen camera scale. Hand-size
previews affect only the comparison artwork; they do not change gameplay,
contact clearance, or the saved reference. The comparison stage uses the native
terrain, prop and water artwork with controlled backgrounds. Its night player
uses the game's 65% readability floor; terrain retains 35% ambient exposure.
It is a controlled study, not an authored spotlight or cave-mouth lighting test.

**Export frame** downloads both columns with the clip, frame and baseline
revision or current-size reference. Its filename includes the preview size.
Review notes persist locally in this browser under a separate key;
they do not edit game saves or level files. The **Baseline sheet** link opens a
day/night overview of the nine reference poses.

Reload after implementing a proposed model change to regenerate the current
recordings. Both columns retain the baseline's framing and scale; a larger
model is not automatically shrunk to disguise its changed proportions.

## What is recorded

`dev/model-review/clips.json` contains the ordinary input tapes. Inspection-room
layouts are JSON assets in `dev/model-review/scenes/`; the Exit column and small
submerged prop cases reuse existing regression fixtures. None is a campaign
level. These rooms isolate an action rather than presenting a scored route.

Every recording starts from the real entrance, settles with neutral input,
then advances the normal game controller at 120 Hz. Completed states and solved
artwork poses are sampled at 60 Hz. There are no hand-positioned joints, actor
teleports, or synthetic contact states. Tests confirm each tape reaches its
advertised contact or movement states and that captured frames are independent
of later simulation changes.

Saved PNG atlases freeze the actual artwork, so changing a shell function cannot
silently redraw the reference. Pose metadata preserves the baseline's joint
overlay and actor positions. Each recording is matched to the exact level and
input tape by a signature; mismatches disable comparison. Both columns use the
same 2× raster sampling to avoid making a new vector render appear sharper just
because of sampling. The in-game context remains a native live render.

The reference is revision `786f46c`, before any model refinement in this study.
The capture date and revision are also stored in the baseline index. Replacing
this reference is an explicit decision; ordinary page loads never update it.

## Reproduce the captures

With the development server on port 4180:

```powershell
node scripts/capture-jumping-model-review.mjs
```

The script refuses to overwrite an existing reference. Use `--update` only when
deliberately accepting a replacement. `MODEL_REVIEW_URL` selects another running
development-server URL. The script uses Edge on Windows and Playwright Chromium
elsewhere. It writes the PNG atlases, pose metadata and overview sheet under
`dev/model-review/baseline/`.

## Review sequence

1. Review the baseline at normal size, then enlarge a specific concern.
2. Record what to preserve, what looks wrong, and whether the cause appears to
   be shape, pose, timing, overlap, lighting, or framing.
3. Choose one hypothesis and compare the current model with one or two narrow
   variants, using the same tape, frame, background and scale.
4. Inspect the entire transition and interrupted actions. A good still pose
   does not establish convincing motion or support transfer.
5. Validate preferred changes in real Exit, Spelunk and Buoyancy play. Check
   both facings, gravity changes, props and equipment. Keep contact, limb-length
   and movement regression coverage, and profile with motion diagnostics off.

Start with the braced hang, pull-up and small-prop push. Look at the toe pad
against the wall, heel/ankle relationship, wrist/palm attachment, and separation
of the near and far limbs. These are review questions, not approved changes to
the model. Decide on silhouette and articulation before adding material detail.

## Current experiment: hands and wrists

The first variant replaces the oval hand artwork with a palm plane, a rounded
finger pad and a small thumb notch. A narrower cosmetic wrist joins it to the
forearm. The existing shell color forms a broad palm plate; the dark grip
material remains at the fingers and thumb. Both colors already belong to the
player palette. The plate meets the outer contour so it does not look like a
bright hole inside a dark ring at gameplay size.

Crouching adds a small relaxed wrist bend and a partly open hand rather than
holding the same rigid mitten shape. Working pushes use a flatter finger pad,
upright fingers and a wrist below the palm center. Both shapes retain the
approved 112% size and morph through reaches and releases. The actual palm
contact stays at the existing surface offset; the arm solves to the new heel
attachment with its original bone lengths. These contacts are covered in both
facings and gravity frames, including low and tall crates and water transitions.

The approved palm uses 112% of the first variant's size in the actual game.
Its contact clearance contains the original oval and the larger artwork's
control-point hull for each hand shape, extending only where the new fingers
need room. Clearance blends between matching profiles so a closed ledge grip
does not inherit the broader open palm. The
1.6-unit contact depth, wrist/palm anchors and animation timing remain the
same; clearance can adjust a free arm's bend around nearby terrain. Unanchored
swimming hands use a 2.352-unit enclosing circle. Light-shadow outlines trace the new wrist and hand
artwork. Centered rope palms omit a zero-length wrist bridge so they cannot add
degenerate shadow polygons. Regression checks cover the unchanged anchors,
contour bounds and winding, and the centered rope case in both facings and
gravity orientations.

Compare the frozen baseline against the current model at ledge frame 80,
rope frame 76, and underwater-push frame 153. Also inspect relaxed hands in the
stride clip and their release from a working contact. Keep the reference images
frozen while judging the variant, particularly at normal gameplay size.

## Ankle articulation pass

Select **Frozen baseline** to inspect the ankle correction at crouch frame 73
and ledge frame 133. The current-shape 100% reference shares the new poses and
is intended for hand-size comparisons. The saved reference remains unchanged.

The final pose keeps free shoes from folding against the calf after knee
clearance or blending. Supported shoes keep their contacts while their knees
open through depth, with a soft limit to retain smooth reversals. Pull-up
angles cross the wrap boundary by the short route; the free trailing foot also
clears the lip before planting. Foot proportions, toe articulation and the
approved braced hang are unchanged. Regression coverage includes all nine input
tapes, both bone lengths, planted ankles and sole angles, the frozen braced
toe pad, and reflected/rotated knee corrections.
