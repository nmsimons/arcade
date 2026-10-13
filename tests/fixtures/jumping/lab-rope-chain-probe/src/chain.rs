//! Experimental simultaneous projection of tension-only chain constraints.
//! J M^-1 J^T is tridiagonal: adjacent constraints share one particle. Each
//! Newton step solves active runs with Thomas elimination, dropping compression
//! multipliers. Contacts and final-clear recovery remain in the original solve.
use super::{Node, Point};

#[derive(Clone, Copy, Default)]
struct Row {
    a: Point,
    b: Point,
    error: f64,
    diagonal: f64,
    lower: f64,
    active: bool,
}

#[derive(Default)]
pub(super) struct Chain {
    rows: Vec<Row>,
    pivots: Vec<f64>,
    rhs: Vec<f64>,
    lambda: Vec<f64>,
    delta: Vec<Point>,
}

fn dot(a: Point, b: Point) -> f64 {
    a[0] * b[0] + a[1] * b[1]
}

fn constraint(a: Node, b: Node, bend: Option<Point>, length: f64) -> Row {
    let (ga, gb, actual) = if let Some(c) = bend {
        let ax = a.x - c[0];
        let ay = a.y - c[1];
        let bx = b.x - c[0];
        let by = b.y - c[1];
        let first = (ax * ax + ay * ay).sqrt();
        let second = (bx * bx + by * by).sqrt();
        (
            [ax / first.max(1e-12), ay / first.max(1e-12)],
            [bx / second.max(1e-12), by / second.max(1e-12)],
            first + second,
        )
    } else {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let actual = (dx * dx + dy * dy).sqrt();
        let u = [dx / actual.max(1e-12), dy / actual.max(1e-12)];
        ([-u[0], -u[1]], u, actual)
    };
    Row {
        a: ga,
        b: gb,
        error: actual - length,
        active: actual >= length - 1e-8,
        ..Row::default()
    }
}

impl Chain {
    pub(super) fn project(
        &mut self,
        nodes: &mut [Node],
        bends: &[Option<Point>],
        lengths: &[f64],
    ) -> bool {
        let count = lengths.len();
        self.rows.resize(count, Row::default());
        self.pivots.resize(count, 0.0);
        self.rhs.resize(count, 0.0);
        self.lambda.resize(count, 0.0);
        self.delta.resize(nodes.len(), [0.0; 2]);
        for i in 0..count {
            let mut row = constraint(nodes[i], nodes[i + 1], bends[i], lengths[i]);
            row.diagonal = dot(row.b, row.b) + if i == 0 { 0.0 } else { dot(row.a, row.a) };
            row.lower = if i == 0 {
                0.0
            } else {
                dot(self.rows[i - 1].b, row.a)
            };
            row.active &= row.diagonal > 1e-10;
            self.rows[i] = row;
        }
        // Removing a negative multiplier splits the chain into independent
        // active runs. Bound active-set work; the next Newton step re-evaluates
        // the nonlinear constraints, including newly taut/slack segments.
        for _ in 0..8 {
            self.lambda.fill(0.0);
            for i in 0..count {
                let row = self.rows[i];
                if !row.active {
                    continue;
                }
                let linked = i > 0 && self.rows[i - 1].active;
                let factor = if linked {
                    row.lower / self.pivots[i - 1]
                } else {
                    0.0
                };
                self.pivots[i] = row.diagonal - if linked { factor * row.lower } else { 0.0 };
                self.rhs[i] = row.error
                    - if linked {
                        factor * self.rhs[i - 1]
                    } else {
                        0.0
                    };
                if self.pivots[i] <= 1e-10 || !self.pivots[i].is_finite() {
                    return false;
                }
            }
            let mut removed = false;
            for i in (0..count).rev() {
                if !self.rows[i].active {
                    continue;
                }
                let next = if i + 1 < count && self.rows[i + 1].active {
                    self.rows[i + 1].lower * self.lambda[i + 1]
                } else {
                    0.0
                };
                self.lambda[i] = (self.rhs[i] - next) / self.pivots[i];
            }
            for i in 0..count {
                if self.rows[i].active && self.lambda[i] < 0.0 {
                    self.rows[i].active = false;
                    self.lambda[i] = 0.0;
                    removed = true;
                }
            }
            if !removed {
                break;
            }
        }
        self.delta.fill([0.0; 2]);
        for i in 0..count {
            let row = self.rows[i];
            let lambda = self.lambda[i].max(0.0);
            if !lambda.is_finite() {
                return false;
            }
            if i > 0 {
                for axis in 0..2 {
                    self.delta[i][axis] -= row.a[axis] * lambda;
                }
            }
            for axis in 0..2 {
                self.delta[i + 1][axis] -= row.b[axis] * lambda;
            }
        }
        // Limit a Newton step through sharply folded configurations. This is
        // a line-search safeguard, not a velocity clamp or a force change.
        let largest = self
            .delta
            .iter()
            .flatten()
            .fold(0.0_f64, |v, d| v.max(d.abs()));
        let scale = if largest > 4.0 { 4.0 / largest } else { 1.0 };
        for (node, d) in nodes.iter_mut().zip(&self.delta).skip(1) {
            node.x += d[0] * scale;
            node.y += d[1] * scale;
        }
        true
    }

    pub(super) fn converged(nodes: &[Node], bends: &[Option<Point>], lengths: &[f64]) -> bool {
        lengths
            .iter()
            .enumerate()
            .all(|(i, &length)| constraint(nodes[i], nodes[i + 1], bends[i], length).error < 0.0005)
    }

    pub(super) fn within_limits(nodes: &[Node], bends: &[Option<Point>], lengths: &[f64]) -> bool {
        let mut arc = 0.0;
        for (i, &length) in lengths.iter().enumerate() {
            let actual = constraint(nodes[i], nodes[i + 1], bends[i], length).error + length;
            if !actual.is_finite() || actual >= length * 1.1 {
                return false;
            }
            arc += actual;
        }
        arc < lengths.iter().sum::<f64>() * 1.02
    }
}
