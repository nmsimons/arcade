// Public athlete API. The rig, poses, animation, clearance and drawing live in
// separate modules; tests and tools import them through this file.
export { advanceDryTurn, advanceImpactRagdoll, advanceMovingRecovery, advanceReturningStepPreparation, advanceSlideEntry, advanceWaterCeiling, advanceWaterLanding, advanceWaterPropReach, captureDryTurn, captureRopeTurnRelease, captureSlideEntry, dryTurnDirection, retainInterruptedStepPose, settleFallClearance, settleWaterClearance, startImpactRagdoll } from './athleteAnimation.ts'
export type { DryTurnFrame, SlideEntryFrame } from './athleteAnimation.ts'
export { handOutline } from './athleteClearance.ts'
export { NIGHT_PLAYER_COLOR, drawAthlete, traceAthlete, traceAthleteArtwork } from './athleteDraw.ts'
export type { AthleteOutline } from './athleteDraw.ts'
export { athletePose, awakeningPose, dryLedgeReach, dryLedgeReachPose, dryPreparationFacesForward, presentedAthletePose, withAthletePose } from './athletePose.ts'
export { reflectAthletePose } from './athleteRig.ts'
export type { AthletePose } from './athleteRig.ts'
export { swimmingBodyOutline, swimmingLedgeReach, swimmingPushHands, swimmingTerrainOutline } from './poses/waterPose.ts'
