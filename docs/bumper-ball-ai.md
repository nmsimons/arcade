# Bumper Ball computer opponent

The first evaluation found several decision-making problems:

- Possession logic treated the opponent like a teammate and yielded stationary balls. In one fixture the computer did not touch the ball within 45 seconds.
- The car aimed through the ball while trying to reach an approach point. That could bypass its own bumper detours and produce poor contacts.
- Linear ball prediction ignored rebounds, leading the car toward unreachable positions.
- Wall clearances could send the ball along the defended wall toward its own goal.
- Shot scoring accidentally preferred later goals over earlier ones.
- The computer could turn at up to 6.7 radians/second and accelerate at up to 1.75 times the player's rate.

The revised opponent challenges possession, reaches its approach point before lining up a shot, and requires a better contact angle before committing. It predicts friction, walls, bumpers, goal posts and the ball speed cap when intercepting. Shot planning uses the same goal-line crossing and boundary checks as the match. Defensive decisions consider which side of the incoming ball the defender occupies, and own-wall clearances point away from the defended goal. Earlier predicted goals score better. Turning is capped at the player's 4 radians/second and forward acceleration at the player's 350 units/second². Each kickoff resets the opponent's tactical memory.

## Repeatable evaluation

Both cars now have a half-second boost followed by a three-second cooldown. They
share the same impulse, acceleration and 400-unit forward boost speed limit. The
computer uses boosts for aligned strikes and long, clear repositioning runs. It
checks wall clearance, bumpers, the opposing car and sideways drift, and avoids
boosted shots when the ball is within 220 units of the attacking goal.
Pausing freezes both cooldowns; a kickoff resets both charges. The normal driving
limits above still apply outside the shared boost mechanic.

Run `npm run benchmark:bumper-ai`. The benchmark and regression tests import the same opponent, arena and collision physics used by the browser game.

Each trial runs at 60 steps/second until the first goal or 45 seconds. These are short situations, not full three-minute matches. The fixed set covers possession, finishing, bumper navigation, wall recovery, incoming shots and moving balls, with a stationary opposing car. A separate set uses 24 starting positions generated with seed `20260921`, against an independent opponent that turns toward the ball and accelerates. It uses the player's movement limits and can boost along a clear path toward the ball. The benchmark reports the computer's boost count as well as goals and touches. Pass `boosts: false` to `runTrial` to compare normal driving alone.

The following results are historical, from the circular goals with gravity:

| Trial set | Original: scored / conceded / unresolved | Revised, before boosts | With boosts |
| --- | --- | --- | --- |
| 12 fixed situations | 3 / 3 / 6 | 8 / 1 / 3 | 9 / 1 / 2 |
| 24 seeded ball-chaser situations | 10 / 11 / 3 | 12 / 8 / 4 | 14 / 7 / 3 |

Baseline results were captured from the original opponent in the fixed 1,600 × 1,000 arena before these AI edits. In the revised possession fixture, first contact occurs at 2.33 seconds and the computer scores at 14.90 seconds. Boosting converts the open finishing chance in 1.52 seconds, versus 3.10 seconds with boost disabled. Both horizontal wall fixtures finish within 14 seconds.

## Soccer goals

Goals now sit in openings at the end walls. Shots must carry the entire ball across the line between the posts; there is no pull toward a goal. Cars and balls can enter the net pocket, with solid posts, side netting and a back boundary. The opponent's predictions use this geometry, and steering permits entry through the goal mouth.

The same fixtures with the soccer goals produce 2 scored / 1 conceded / 9 unresolved in the fixed situations, and 10 / 5 / 9 against the seeded ball chaser. The open chance scores in 1.50 seconds. Removing the gravity assist and moving the scoring plane changes conversion substantially: wall recovery and contested possession often do not convert within 45 seconds. The existing AI outcome benchmarks still fail their earlier conversion targets; those thresholds have not been lowered to conceal the change. Further opponent tuning is needed before treating the historical figures as targets for soccer goals.

These trials do not measure difficulty or enjoyment against human players. Planning also uses an approximate prediction without forecasting the human's next input.
