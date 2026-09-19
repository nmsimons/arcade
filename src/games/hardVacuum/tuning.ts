// ============================================================================
// GAME BALANCE CONSTANTS
// ============================================================================
// Adjust these values to tweak game mechanics and difficulty

// --- CREDITS / SCORE REWARDS ---
export const CREDITS_ASTEROID_BASE = 10 // Modest field payout for ordinary asteroids
export const CREDITS_ASTEROID_SIZE_BONUS = 1.5 // Per unit of rock radius above 20
export const CREDITS_BLUE_ROCK_MULTIPLIER = 10
export const CREDITS_BASE_PROCESSING_MULTIPLIER = 10
export const MINING_BASE_RADIUS = 118

// --- SHIP PHYSICS & CONTROLS ---
export const SHIP_ROTATION_SPEED = 5 // Maximum radians per second
export const SHIP_TURN_RESPONSE = 30 // Fast acceleration and direction changes
export const SHIP_TURN_DAMPING = 20 // Short coast: about 14 degrees from full turn speed
export const SHIP_THRUST_ACCELERATION = 300 // Forward acceleration when thrusting
export const SHIP_NOSE_THRUST_ACCELERATION = SHIP_THRUST_ACCELERATION * 0.25 // Nose jet: one quarter of rear thrust
export const SHIP_MAX_SPEED = 300 // Maximum velocity (speed cap)
export const SHIP_FRICTION = 0.99 // Velocity damping per 1/60-second simulation step
export const SHIP_LATERAL_FRICTION = 0.985 // Stronger damping for sideways drift (lower = grippier)

// Upgrades extend the hook's reach; attached cargo settles back to this towing length.
export const HARPOON_CABLE_LENGTH = 130
export const HARPOON_TOW_REEL_SPEED = HARPOON_CABLE_LENGTH // Double-length cable retracts from 260 to 130 pixels in one second

// --- COMBAT & WEAPONS ---
export const BULLET_SPEED = 420 // Player bullet velocity
export const BASE_SHOT_SPEED = 520 // Mining base turret velocity
export const BASE_GUN_FIRE_COOLDOWN = 0.18 // Seconds between base turret shots
export const BASE_GUN_INITIAL_COOLDOWNS = [0, 0.06, 0.12] as [number, number, number] // Staggered initial timing

// Phaser (player primary fire): hold to fire a continuous beam.
export const PHASER_COOLDOWN = 0.5 // Seconds locked out after overheat
export const PHASER_RANGE = 520 // Pixels
export const PHASER_BEAM_RADIUS = 6 // Collision radius around the beam line

// --- SHIELDS & DAMAGE ---
export const SHIP_MAX_SHIELDS = 2 // Starting/maximum shield count
export const SHIELD_REPAIR_TIME = 1 // Seconds in base to fully repair shields
export const INVULNERABILITY_AFTER_HIT = 450 // Milliseconds of invulnerability after taking damage
export const INVULNERABILITY_GAME_START = 1200 // Milliseconds at game start
export const INVULNERABILITY_MIN_AFTER_REPAIR = 120 // Minimum ms after shield repair
export const COLLISION_DAMAGE_SLOW = 30 // Impact speed threshold for 1 shield damage
export const COLLISION_DAMAGE_MEDIUM = 100 // Impact speed threshold for 2 shield damage
export const COLLISION_DAMAGE_FAST = 250 // Impact speed threshold for 3 shield damage

// --- ROCK SPAWNING & BEHAVIOR ---
export const ROCK_BASE_SPEED_MIN = 20 // Minimum rock speed
export const ROCK_BASE_SPEED_MAX = 50 // Maximum rock speed (min + 30)
 // Base probability for blue rock spawns (level 3+)
 // Additional chance per level
 // Maximum blue rock spawn probability

// Red rock: smallest only. Explodes on shot/collision.

// Delay between a red rock being triggered and actually detonating.
// (Gives the player a chance to react; also used to drive the arming pulse.)
export const RED_ROCK_DETONATION_DELAY = 2.0 // seconds
export const RED_ROCK_BLAST_RADIUS = 150 // Pixels
export const RED_ROCK_BLAST_IMPULSE = 900 // Velocity impulse scale

// --- DEBRIS EFFECTS ---
export const DEBRIS_SPEED_MIN = 50 // Minimum debris particle speed
export const DEBRIS_SPEED_MAX = 150 // Maximum debris particle speed (min + 100)
export const DEBRIS_LIFETIME_MIN = 1500 // Minimum debris lifetime in ms
export const DEBRIS_LIFETIME_MAX = 2000 // Maximum debris lifetime in ms (min + 500)

// --- TIMING & DURATIONS ---
export const DYING_ANIMATION_DURATION = 1200 // Milliseconds for death animation
