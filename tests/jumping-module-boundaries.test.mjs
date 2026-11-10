import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// The headless simulation is everything challenge.ts loads at runtime. It must
// never load drawing code, and its use of poses and animation is limited to the
// couplings listed below (docs/jumping-animation.md). Remove an entry when its
// coupling is replaced; a new pose or animation import from the simulation
// needs a deliberate entry here.
const root = fileURLToPath(new URL('../src/games/jumping/', import.meta.url))
const POSE_FAMILY = /^(athleteRig|athletePose|athleteLimits|athleteClearance|athleteAnimation|characterAnimation|footwork|gameplayPose|poses\/\w+)\.ts$/
const DRAWING = /^(athleteDraw|athleteShadow|androidArtwork|sleeveArtwork|render|\w+Render|\w+Artwork)\.ts$/
const ALLOWED = {
  // Animation started or advanced inside the movement step (Phase 3 moves these).
  'actorImpulse.ts': { 'athleteAnimation.ts': ['startImpactRagdoll'] },
  'challenge.ts': { 'footwork.ts': ['advanceFootwork'] },
  'goal.ts': { 'footwork.ts': ['advanceFootwork'] },
  'level.ts': { 'footwork.ts': ['advanceFootwork'] },
  'model.ts': {
    // Water contact helpers that live with the animation, the start-of-step turn
    // captures, gravity-turn and ragdoll starts, and the animation cadence hooks.
    'athleteAnimation.ts': ['advanceWaterCeiling', 'advanceWaterLanding', 'advanceWaterPropReach', 'captureDryTurn', 'captureRopeTurnRelease',
      'captureSlideEntry', 'settleWaterClearance', 'startImpactRagdoll'],
    'characterAnimation.ts': ['animateOrQueue', 'animates', 'cadence', 'preparePush', 'presentPush', 'presentWaterOrQueue', 'settleOrQueue'],
    // Captured turn poses and the presented ledge reach; gameplay never reads them.
    'athletePose.ts': ['athletePose', 'dryLedgeReach', 'dryLedgeReachPose'],
    // Rope catches during a gravity turn use the physics rig.
    'gameplayPose.ts': ['gameplayPose'],
    'poses/waterPose.ts': ['swimmingLedgeReach'],
  },
  // Presentation computed in the step: push anticipation and the interrupted-step rig.
  'playerContacts.ts': {
    'athleteAnimation.ts': ['retainInterruptedStepPose'],
    'athletePose.ts': ['dryPreparationFacesForward'],
    // The swimming hull and hands, solved from the physics rig.
    'poses/waterPose.ts': ['swimmingBodyOutline', 'swimmingPushHands', 'swimmingTerrainOutline'],
  },
  'propPhysics.ts': { 'poses/waterPose.ts': ['swimmingTerrainOutline'] },
  // The gameplay sleeve uses the physics rig; the displayed arm easing uses the animated pose.
  'gadgets.ts': { 'athletePose.ts': ['athletePose'], 'characterAnimation.ts': ['cadence'], 'gameplayPose.ts': ['gameplayPose'] },
  // The robot's palm and firing line use the physics rig.
  'repulsorBot.ts': { 'athletePose.ts': ['athletePose'], 'gameplayPose.ts': ['physicsView'] },
  'repulsorBotRig.ts': { 'athletePose.ts': ['awakeningPose', 'presentedAthletePose'] },
  // Foot contact geometry and the toe brace profile.
  'ledge.ts': { 'footwork.ts': ['wallToeBrace'] },
  'stepUp.ts': { 'footwork.ts': ['FOOT_CONTACT'] },
}

/** Runtime (non-type) imports of a module: [{ module, names }] relative to root. */
function runtimeImports(file) {
  const path = resolve(root, file), source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const imports = []
  for (const statement of source.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || !statement.moduleSpecifier?.text.startsWith('.')) continue
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : null
    if (ts.isExportDeclaration(statement) ? statement.isTypeOnly : clause?.isTypeOnly) continue
    const bindings = ts.isImportDeclaration(statement) ? clause?.namedBindings : statement.exportClause
    const names = bindings && 'elements' in bindings ? bindings.elements.filter(e => !e.isTypeOnly).map(e => (e.propertyName ?? e.name).text) : ['*']
    if (clause && !clause.name && bindings && 'elements' in bindings && !names.length) continue
    imports.push({ module: relative(root, resolve(dirname(path), statement.moduleSpecifier.text)).replaceAll('\\', '/'), names })
  }
  return imports
}

function closure(entry) {
  const seen = new Set(), queue = [entry]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file) || !existsSync(resolve(root, file))) continue
    seen.add(file)
    queue.push(...runtimeImports(file).map(i => i.module))
  }
  return seen
}
const simulation = closure('challenge.ts')

test('the headless simulation loads no drawing modules', () => {
  assert.ok(simulation.has('model.ts') && simulation.size > 50)
  assert.deepEqual([...simulation].filter(file => DRAWING.test(file)), [])
})

test('simulation modules use poses and animation only through the listed couplings', () => {
  const actual = {}
  for (const file of [...simulation].sort()) {
    if (POSE_FAMILY.test(file) || file.startsWith('../')) continue
    for (const { module, names } of runtimeImports(file)) if (POSE_FAMILY.test(module)) {
      ((actual[file] ??= {})[module] ??= []).push(...names)
    }
  }
  for (const modules of Object.values(actual)) for (const module of Object.keys(modules)) modules[module].sort()
  assert.deepEqual(actual, ALLOWED, 'Update ALLOWED and docs/jumping-animation.md when a coupling is added or removed')
})

// Animation fields (Player.anim) each simulation module reads or writes; '*' is
// the whole object. These are the in-step animation calls and their state
// handling (Phase 3) and the gameplay reads of animation (Phase 4).
const ANIM_FIELDS = {
  'actorImpulse.ts': ['dryTurn'], 'challenge.ts': ['ragdoll'], 'climbables.ts': ['*'], 'gadgets.ts': ['dryTurn'],
  'goal.ts': ['footwork'], 'gravityFrame.ts': ['footwork'],
  'model.ts': ['cadence', 'dryTurn', 'footwork', 'gait', 'pending', 'ragdoll', 'slideEntry', 'stride'],
  'playerContacts.ts': ['dryTurn', 'footwork', 'slideEntry'], 'repulsorBot.ts': ['gait'], 'shove.ts': ['dryTurn'],
  'stepUp.ts': ['dryTurn', 'footwork', 'gait', 'stride'],
}

test('simulation modules touch only the listed animation fields', () => {
  const actual = {}
  for (const file of [...simulation].sort()) {
    if (POSE_FAMILY.test(file) || file.startsWith('../') || /^(characterTypes|gait)\.ts$/.test(file)) continue
    const fields = new Set([...readFileSync(resolve(root, file), 'utf8').matchAll(/\.anim\b(?:\??\.(\w+))?/g)].map(match => match[1] ?? '*'))
    if (fields.size) actual[file] = [...fields].sort()
  }
  assert.deepEqual(actual, ANIM_FIELDS, 'Update ANIM_FIELDS and docs/jumping-animation.md when simulation code starts or stops using animation state')
})

test('athlete pose, animation and drawing modules import no runtime code from model.ts', () => {
  const family = readdirSync(root).filter(f => POSE_FAMILY.test(f) || /^(athleteDraw|athleteShadow|characterTypes|gait)\.ts$/.test(f))
    .concat(readdirSync(resolve(root, 'poses')).map(f => `poses/${f}`))
  for (const file of family) {
    assert.ok(!runtimeImports(file).some(i => i.module === 'model.ts'), `${file} must import Player and gaitPose from characterTypes.ts and gait.ts`)
  }
})
