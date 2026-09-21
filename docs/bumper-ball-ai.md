# Bumper Ball computer opponent

The first evaluation found several decision-making problems:

- Possession logic treated the opponent like a teammate and yielded stationary balls. In one fixture the computer did not touch the ball within 45 seconds.
- The car aimed through the ball while trying to reach an approach point. That could bypass its own bumper detours and produce poor contacts.
- Linear ball prediction ignored rebounds, leading the car toward unreachable positions.
- Wall clearances could send the ball along the defended wall toward its own goal.
- Shot scoring accidentally preferred later goals over earlier ones.
- The computer could turn at up to 6.7 radians/second and accelerate at up to 1.75 times the player's rate.

The revised opponent challenges possession, reaches its approach point before lining up a shot, and requires a better contact angle before committing. It predicts friction, walls, bumpers, goal gravity and the ball speed cap when intercepting. Defensive decisions consider which side of the incoming ball the defender occupies, and own-wall clearances point away from the defended goal. Earlier predicted goals now score better. Turning is capped at the player's 4 radians/second and forward acceleration at the player's 350 units/second². Each kickoff resets the opponent's tactical memory.

## Repeatable evaluation

Both cars now have a half-second boost followed by a three-second cooldown. They
share the same impulse, acceleration and 400-unit forward boost speed limit. The
computer uses boosts for aligned strikes and long, clear repositioning runs. It
checks wall clearance, bumpers, the opposing car and sideways drift, and avoids
boosted shots when the ball is already inside the attacking goal's gravity well.
Pausing freezes both cooldowns; a kickoff resets both charges. The normal driving
limits above still apply outside the shared boost mechanic.

Run `npm run benchmark:bumper-ai`. The benchmark and regression tests import the same opponent, arena and collision physics used by the browser game.

Each trial runs at 60 steps/second until the first goal or 45 seconds. These are short situations, not full three-minute matches. The fixed set covers possession, finishing, bumper navigation, wall recovery, incoming shots and moving balls, with a stationary opposing car. A separate set uses 24 starting positions generated with seed `20260921`, against an independent opponent that turns toward the ball and accelerates. It uses the player's movement limits and can boost along a clear path toward the ball. The benchmark reports the computer's boost count as well as goals and touches. Pass `boosts: false` to `runTrial` to compare normal driving alone.

| Trial set | Original: scored / conceded / unresolved | Revised, before boosts | Current, with boosts |
| --- | --- | --- | --- |
| 12 fixed situations | 3 / 3 / 6 | 8 / 1 / 3 | 9 / 1 / 2 |
| 24 seeded ball-chaser situations | 10 / 11 / 3 | 12 / 8 / 4 | 14 / 7 / 3 |

Baseline results were captured from the original opponent in the fixed 1,600 × 1,000 arena before these AI edits. In the revised possession fixture, first contact occurs at 2.33 seconds and the computer scores at 14.90 seconds. Boosting converts the open finishing chance in 1.52 seconds, versus 3.10 seconds with boost disabled. Both horizontal wall fixtures finish within 14 seconds.

These trials show improved decisions and fewer conceded goals; they do not measure difficulty or enjoyment against human players. Sustained kickoff scrums, moving balls and own-wall recoveries remain imperfect: the current fixed kickoff eventually concedes, while the moving-ball and own-wall cases time out. Planning also uses an approximate prediction without forecasting the human's next input. Fresh playtesting is the next useful check before adding difficulty levels or more aggressive tactics.
