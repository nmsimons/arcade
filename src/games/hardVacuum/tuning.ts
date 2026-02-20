// ============================================================================
// GAME BALANCE CONSTANTS
// ============================================================================
// Adjust these values to tweak game mechanics and difficulty

// --- CREDITS / SCORE REWARDS ---
export const CREDITS_SHOOTING_ROCK_DIVISOR = 100 // Credits = DIVISOR / rock radius
export const CREDITS_BASE_PROCESSING_BASE = 100 // Base credits for processing rocks in mining base
export const CREDITS_BASE_PROCESSING_SIZE_BONUS = 15 // Bonus per unit of rock radius above 20
export const CREDITS_BLUE_ROCK_MULTIPLIER = 9 // Blue rocks are worth this times normal value

// --- TIME-BASED BONUS MULTIPLIER ---
export const TIME_BONUS_TARGET_SECONDS = 45 // "Par" time for wave completion
export const TIME_BONUS_MAX_MULTIPLIER = 3.0 // Max bonus added (2.0x total = 1 + 1.0)

// --- STORE PRICES ---
export const STORE_PRICE_GRAVITY_PULSE = 1000
export const STORE_PRICE_STASIS_FIELD = 3000
export const STORE_PRICE_ATTRACTOR_RECHARGE = 2000

// --- ATTRACTOR BEAM ---
export const ATTRACTOR_BEAM_STRENGTH = 80000 // Gravity strength applied to rocks
export const ATTRACTOR_BEAM_RANGE_MULTIPLIER = 3.0 // Range as multiple of base radius
export const ATTRACTOR_BEAM_DURATION = 30 // Seconds of operation per charge

// --- SHIP PHYSICS & CONTROLS ---
export const SHIP_ROTATION_SPEED = 5 // Degrees per frame
export const SHIP_THRUST_ACCELERATION = 300 // Forward acceleration when thrusting
export const SHIP_MAX_SPEED = 300 // Maximum velocity (speed cap)
export const SHIP_FRICTION = 0.99 // Velocity damping per frame (0.99 = 1% friction)
export const SHIP_LATERAL_FRICTION = 0.985 // Stronger damping for sideways drift (lower = grippier)

// --- COMBAT & WEAPONS ---
export const BULLET_SPEED = 420 // Player bullet velocity
export const BASE_SHOT_SPEED = 520 // Mining base turret velocity
export const BASE_GUN_FIRE_COOLDOWN = 0.18 // Seconds between base turret shots
export const BASE_GUN_INITIAL_COOLDOWNS = [0, 0.06, 0.12] as [number, number, number] // Staggered initial timing

// Phaser (player primary fire): hold to fire a continuous beam.
export const PHASER_MAX_FIRE_DURATION = 0.5 // Seconds of continuous firing before overheat
export const PHASER_COOLDOWN = 0.5 // Seconds locked out after overheat
export const PHASER_RANGE = 520 // Pixels
export const PHASER_BEAM_RADIUS = 6 // Collision radius around the beam line
export const PHASER_HIT_INTERVAL = 0.09 // Seconds between damage ticks while holding

// --- SHIELDS & DAMAGE ---
export const SHIP_MAX_SHIELDS = 2 // Starting/maximum shield count
export const SHIELD_REPAIR_TIME = 1 // Seconds in base to fully repair shields
export const INVULNERABILITY_AFTER_HIT = 450 // Milliseconds of invulnerability after taking damage
export const INVULNERABILITY_GAME_START = 1200 // Milliseconds at game start
export const INVULNERABILITY_LEVEL_START = 2000 // Milliseconds at new level
export const INVULNERABILITY_MIN_AFTER_REPAIR = 120 // Minimum ms after shield repair
export const COLLISION_DAMAGE_SLOW = 30 // Impact speed threshold for 1 shield damage
export const COLLISION_DAMAGE_MEDIUM = 100 // Impact speed threshold for 2 shield damage
export const COLLISION_DAMAGE_FAST = 250 // Impact speed threshold for 3 shield damage

// --- ROCK SPAWNING & BEHAVIOR ---
export const ROCK_BASE_SPEED_MIN = 20 // Minimum rock speed
export const ROCK_BASE_SPEED_MAX = 50 // Maximum rock speed (min + 30)
export const ROCK_SPAWN_AVOID_RADIUS = 100 // Clearance around player when spawning
export const ROCK_BASE_CLEARANCE = 180 // Extra clearance around mining base for rock spawns
export const BLUE_ROCK_SPAWN_CHANCE_BASE = 0.12 // Base probability for blue rock spawns (level 3+)
export const BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL = 0.015 // Additional chance per level
export const BLUE_ROCK_SPAWN_CHANCE_MAX = 0.3 // Maximum blue rock spawn probability

// Red rock: smallest only. Explodes on shot/collision.
export const RED_ROCK_SPAWN_CHANCE = 0.08
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
