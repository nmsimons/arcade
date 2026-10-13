//! Unattached LAB ropes: the same ordered constraints and complete-span contacts
//! as climbables.ts. No host callbacks, reduced iterations, or camera culling.
//! The single-threaded Wasm adapter owns one reusable workspace. Its bounded
//! f64 packet contains nodes (x,y,oldX,oldY,gravity), bends (present,x,y), then
//! terrain (x,y,w,h,pointCount, world-coordinate point pairs).
use std::cell::{Cell, RefCell};

const EPS: f64 = 1e-7;
const CLEARANCE: f64 = 1.5;
type Point = [f64; 2];
#[derive(Clone, Copy, Default)]
struct Node {
    x: f64,
    y: f64,
    old_x: f64,
    old_y: f64,
}
struct Edge {
    a: Point,
    dx: f64,
    dy: f64,
    squared: f64,
    nx: f64,
    ny: f64,
}
struct Shape {
    bounds: [f64; 4],
    points: Vec<Point>,
    edges: Vec<Edge>,
    nearest: Cell<usize>,
}
#[derive(Clone, Copy)]
struct Face {
    x: f64,
    y: f64,
    distance: f64,
    nx: f64,
    ny: f64,
}
#[derive(Default)]
struct Solver {
    packet: Vec<f64>,
    count: usize,
    terrain_size: usize,
    nodes: Vec<Node>,
    before: Vec<Node>,
    proposed: Vec<Node>,
    distances: Vec<f64>,
    lengths: Vec<f64>,
    bends: Vec<Option<Point>>,
    previous_bends: Vec<Option<Point>>,
    terrain: Vec<Shape>,
    cuts: Vec<f64>,
}
fn cross(a: Point, b: Point, c: Point) -> f64 {
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}
fn hypot(x: f64, y: f64) -> f64 {
    // Match the ordered, scaled two-argument Math.hypot computation used by
    // Chromium. libm's more precise norm can differ by one ulp, which changes
    // nearest-face ties and then amplifies through coupled contact constraints.
    // https://github.com/v8/v8/blob/main/src/builtins/math.tq
    let a = x.abs();
    let b = y.abs();
    if a.is_infinite() || b.is_infinite() {
        return f64::INFINITY;
    }
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    let scale = a.max(b);
    if scale == 0.0 {
        return 0.0;
    }
    let a = a / scale;
    let b = b / scale;
    (a * a + b * b).sqrt() * scale
}
fn clamp(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}
fn on_segment(p: Point, a: Point, b: Point) -> bool {
    p[0] >= a[0].min(b[0]) - EPS
        && p[0] <= a[0].max(b[0]) + EPS
        && p[1] >= a[1].min(b[1]) - EPS
        && p[1] <= a[1].max(b[1]) + EPS
        && cross(a, b, p).abs() < EPS
}
impl Shape {
    fn new(bounds: [f64; 4], points: Vec<Point>) -> Self {
        let edges = points
            .iter()
            .enumerate()
            .map(|(i, &a)| {
                let c = points[(i + 1) % points.len()];
                let dx = c[0] - a[0];
                let dy = c[1] - a[1];
                let length = hypot(dx, dy);
                Edge {
                    a,
                    dx,
                    dy,
                    squared: length * length,
                    nx: dy / length,
                    ny: -dx / length,
                }
            })
            .collect();
        Self {
            bounds,
            points,
            edges,
            nearest: Cell::new(0),
        }
    }
    fn outside(&self, a: Point, b: Point, radius: f64, inclusive: bool) -> bool {
        let [x, y, w, h] = self.bounds;
        if inclusive {
            a[0].max(b[0]) <= x - radius
                || a[0].min(b[0]) >= x + w + radius
                || a[1].max(b[1]) <= y - radius
                || a[1].min(b[1]) >= y + h + radius
        } else {
            a[0].max(b[0]) < x - radius
                || a[0].min(b[0]) > x + w + radius
                || a[1].max(b[1]) < y - radius
                || a[1].min(b[1]) > y + h + radius
        }
    }
    fn inside(&self, p: Point) -> bool {
        if self.outside(p, p, 0.0, false) {
            return false;
        }
        let mut inside = false;
        let mut j = self.points.len() - 1;
        for i in 0..self.points.len() {
            let a = self.points[i];
            let c = self.points[j];
            if on_segment(p, a, c) {
                return true;
            }
            if (a[1] > p[1]) != (c[1] > p[1])
                && p[0] < (c[0] - a[0]) * (p[1] - a[1]) / (c[1] - a[1]) + a[0]
            {
                inside = !inside;
            }
            j = i;
        }
        inside
    }
    fn face(&self, p: Point) -> Face {
        let hint = self.nearest.get();
        let mut best_index = hint;
        let candidate = |e: &Edge| {
            let t = clamp(((p[0] - e.a[0]) * e.dx + (p[1] - e.a[1]) * e.dy) / e.squared);
            [e.a[0] + e.dx * t, e.a[1] + e.dy * t]
        };
        let e = &self.edges[hint];
        let q = candidate(e);
        let mut best = Face {
            x: q[0],
            y: q[1],
            distance: hypot(q[0] - p[0], q[1] - p[1]),
            nx: e.nx,
            ny: e.ny,
        };
        for (i, e) in self.edges.iter().enumerate() {
            if i == hint {
                continue;
            }
            let q = candidate(e);
            let gx = q[0] - p[0];
            let gy = q[1] - p[1];
            if gx * gx + gy * gy > (best.distance + EPS) * (best.distance + EPS) {
                continue;
            }
            let distance = hypot(gx, gy);
            if distance < best.distance || distance == best.distance && i < best_index {
                best = Face {
                    x: q[0],
                    y: q[1],
                    distance,
                    nx: e.nx,
                    ny: e.ny,
                };
                best_index = i;
            }
        }
        self.nearest.set(best_index);
        best
    }
    fn blocked(&self, a: Point, b: Point) -> bool {
        if self.outside(a, b, 0.0, false) {
            return false;
        }
        let rx = b[0] - a[0];
        let ry = b[1] - a[1];
        for e in &self.edges {
            let denominator = rx * e.dy - ry * e.dx;
            if denominator.abs() < EPS {
                continue;
            }
            let t = ((e.a[0] - a[0]) * e.dy - (e.a[1] - a[1]) * e.dx) / denominator;
            let u = ((e.a[0] - a[0]) * ry - (e.a[1] - a[1]) * rx) / denominator;
            if t > EPS && t < 1.0 - EPS && (0.0..=1.0).contains(&u) {
                return true;
            }
        }
        self.inside([(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0])
    }
    fn penetration(&self, a: Point, b: Point, cuts: &mut Vec<f64>) -> Option<[f64; 3]> {
        if self.outside(a, b, CLEARANCE, true) {
            return None;
        }
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        for i in 0..self.points.len() {
            let p = self.points[i];
            if cross(
                self.points[(i + self.points.len() - 1) % self.points.len()],
                p,
                self.points[(i + 1) % self.points.len()],
            ) <= EPS
            {
                continue;
            }
            let squared = dx * dx + dy * dy;
            let t = clamp(
                ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy)
                    / if squared != 0.0 { squared } else { 1.0 },
            );
            let x = a[0] + dx * t - p[0];
            let y = a[1] + dy * t - p[1];
            let distance = hypot(x, y);
            if distance > EPS && distance < CLEARANCE && !self.inside([p[0] + x, p[1] + y]) {
                return Some([
                    t,
                    x * (CLEARANCE / distance - 1.0),
                    y * (CLEARANCE / distance - 1.0),
                ]);
            }
        }
        cuts.clear();
        cuts.extend([0.0, 1.0]);
        for e in &self.edges {
            let denominator = dx * e.dy - dy * e.dx;
            if denominator.abs() < EPS {
                continue;
            }
            let t = ((e.a[0] - a[0]) * e.dy - (e.a[1] - a[1]) * e.dx) / denominator;
            let u = ((e.a[0] - a[0]) * dy - (e.a[1] - a[1]) * dx) / denominator;
            if t > 0.0 && t < 1.0 && (0.0..=1.0).contains(&u) {
                cuts.push(t);
            }
        }
        cuts.sort_by(f64::total_cmp);
        for i in 1..cuts.len() {
            let t = (cuts[i - 1] + cuts[i]) / 2.0;
            let p = [a[0] + dx * t, a[1] + dy * t];
            if self.inside(p) {
                let e = self.face(p);
                if e.distance > EPS {
                    let depth = ((e.x - a[0]) * e.nx + (e.y - a[1]) * e.ny)
                        .max((e.x - b[0]) * e.nx + (e.y - b[1]) * e.ny)
                        + CLEARANCE;
                    return Some([0.5, e.nx * depth, e.ny * depth]);
                }
            }
        }
        None
    }
}
fn blocked(a: Point, b: Point, terrain: &[Shape]) -> bool {
    terrain.iter().any(|s| s.blocked(a, b))
}
fn bend(a: Point, b: Point, terrain: &[Shape]) -> Option<Point> {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let direct = hypot(dx, dy);
    let mut best = None;
    let mut length = f64::INFINITY;
    for s in terrain {
        if s.outside(a, b, CLEARANCE, false) {
            continue;
        }
        let blocked_here = s.blocked(a, b);
        let count = s.points.len();
        for i in 0..count {
            let before = s.points[(i + count - 1) % count];
            let p = s.points[i];
            let after = s.points[(i + 1) % count];
            if cross(before, p, after) <= EPS {
                continue;
            }
            let squared = direct * direct;
            let denominator = if squared != 0.0 { squared } else { 1.0 };
            let t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator);
            if !blocked_here
                && (t <= EPS
                    || t >= 1.0 - EPS
                    || hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) > CLEARANCE + 0.01)
            {
                continue;
            }
            let u = hypot(p[0] - before[0], p[1] - before[1]);
            let v = hypot(after[0] - p[0], after[1] - p[1]);
            let n1 = [(p[1] - before[1]) / u, (before[0] - p[0]) / u];
            let n2 = [(after[1] - p[1]) / v, (p[0] - after[0]) / v];
            let scale = CLEARANCE / (1.0 + n1[0] * n2[0] + n1[1] * n2[1]).max(0.1);
            let c = [
                p[0] + (n1[0] + n2[0]) * scale,
                p[1] + (n1[1] + n2[1]) * scale,
            ];
            let along = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / denominator;
            if along <= EPS || along >= 1.0 - EPS {
                continue;
            }
            let arc = hypot(c[0] - a[0], c[1] - a[1]) + hypot(c[0] - b[0], c[1] - b[1]);
            if arc - direct < EPS
                || arc >= length
                || arc > direct + CLEARANCE * 6.0
                || blocked(a, c, terrain)
                || blocked(c, b, terrain)
            {
                continue;
            }
            best = Some(c);
            length = arc;
        }
    }
    best
}
fn clear(nodes: &[Node], bends: &[Option<Point>], terrain: &[Shape]) -> bool {
    if terrain.is_empty() {
        return true;
    }
    (1..nodes.len()).all(|i| {
        let a = [nodes[i - 1].x, nodes[i - 1].y];
        let b = [nodes[i].x, nodes[i].y];
        if let Some(c) = bends[i - 1] {
            !blocked(a, c, terrain) && !blocked(c, b, terrain)
        } else {
            !blocked(a, b, terrain)
        }
    })
}
fn distance(length: f64, i: usize) -> f64 {
    length.min(i as f64 * 8.0)
}
fn tension(nodes: &mut [Node], distances: &[f64]) {
    let count = nodes.len() - 1;
    for i in 8..=count {
        let dx = nodes[i].x - nodes[0].x;
        let dy = nodes[i].y - nodes[0].y;
        let squared = dx * dx + dy * dy;
        let span = distances[i];
        if squared <= span * span {
            continue;
        }
        let actual = squared.sqrt();
        let correction = 0.5 * (actual - span) / actual;
        nodes[i].x -= dx * correction;
        nodes[i].y -= dy * correction;
    }
    let mut stride = count.next_power_of_two();
    while stride >= 8 {
        for start in (0..count).step_by(stride) {
            let end = count.min(start + stride);
            if end - start < 8 {
                continue;
            }
            let dx = nodes[end].x - nodes[start].x;
            let dy = nodes[end].y - nodes[start].y;
            let squared = dx * dx + dy * dy;
            let span = distances[end] - distances[start];
            if squared <= span * span {
                continue;
            }
            let wa = if start == 0 { 0.0 } else { 1.0 };
            let actual = squared.sqrt();
            let correction = 0.5 * (actual - span) / actual / (wa + 1.0);
            nodes[start].x += dx * correction * wa;
            nodes[start].y += dy * correction * wa;
            nodes[end].x -= dx * correction;
            nodes[end].y -= dy * correction;
        }
        stride /= 2;
    }
}
impl Solver {
    fn read_terrain(&mut self, count: usize) -> bool {
        let mut offset = self.count * 5 + (self.count - 1) * 3;
        for i in 0..count {
            if offset + 5 > self.packet.len() {
                return false;
            }
            let b = [
                self.packet[offset],
                self.packet[offset + 1],
                self.packet[offset + 2],
                self.packet[offset + 3],
            ];
            let raw = self.packet[offset + 4];
            let n = raw as usize;
            offset += 5;
            if n < 3 || n > 4096 || raw != n as f64 || offset + n * 2 > self.packet.len() {
                return false;
            }
            let same = self.terrain.get(i).is_some_and(|s| {
                s.bounds == b
                    && s.points.len() == n
                    && s.points.iter().enumerate().all(|(j, p)| {
                        p[0] == self.packet[offset + j * 2]
                            && p[1] == self.packet[offset + j * 2 + 1]
                    })
            });
            if !same {
                let points = (0..n)
                    .map(|j| [self.packet[offset + j * 2], self.packet[offset + j * 2 + 1]])
                    .collect();
                let shape = Shape::new(b, points);
                if i < self.terrain.len() {
                    self.terrain[i] = shape;
                } else {
                    self.terrain.push(shape);
                }
            }
            offset += n * 2;
        }
        self.terrain.truncate(count);
        offset == self.packet.len()
    }
    fn solve(
        &mut self,
        ax: f64,
        ay: f64,
        length: f64,
        dt: f64,
        damping: f64,
        shape_count: usize,
    ) -> bool {
        if self.count < 2 || shape_count > 4096 || !self.read_terrain(shape_count) {
            return false;
        }
        let count = self.count;
        self.nodes.resize(count, Node::default());
        self.bends.resize(count - 1, None);
        self.distances.resize(count, 0.0);
        self.lengths.resize(count - 1, 0.0);
        for i in 0..count {
            self.distances[i] = distance(length, i);
        }
        for i in 1..count {
            self.lengths[i - 1] = self.distances[i] - self.distances[i - 1];
        }
        for i in 0..count {
            let p = &self.packet[i * 5..i * 5 + 4];
            self.nodes[i] = Node {
                x: p[0],
                y: p[1],
                old_x: p[2],
                old_y: p[3],
            };
        }
        for i in 0..count - 1 {
            let p = &self.packet[count * 5 + i * 3..count * 5 + i * 3 + 3];
            self.bends[i] = if p[0] != 0.0 {
                Some([p[1], p[2]])
            } else {
                None
            };
        }
        self.before.clone_from(&self.nodes);
        self.previous_bends.clone_from(&self.bends);
        let was_clear = clear(&self.nodes, &self.bends, &self.terrain);
        for i in 1..count {
            let n = &mut self.nodes[i];
            let dx = (n.x - n.old_x) * damping;
            let dy = (n.y - n.old_y) * damping;
            n.old_x = n.x;
            n.old_y = n.y;
            n.x += dx;
            n.y += dy + self.packet[i * 5 + 4] * dt * dt;
        }
        let passes = 32.max(count.div_ceil(8) * 8);
        for pass in 0..passes {
            self.nodes[0].x = ax;
            self.nodes[0].y = ay;
            if pass < 32 && pass % 2 == 0 {
                tension(&mut self.nodes, &self.distances);
            }
            for j in 1..count {
                let i = if pass % 2 != 0 { count - j } else { j };
                let wa = if i == 1 { 0.0 } else { 1.0 };
                let a = self.nodes[i - 1];
                let b = self.nodes[i];
                let span = self.lengths[i - 1];
                if let Some(c) = self.bends[i - 1] {
                    let dx = c[0] - a.x;
                    let dy = c[1] - a.y;
                    let ex = c[0] - b.x;
                    let ey = c[1] - b.y;
                    let first = (dx * dx + dy * dy).sqrt();
                    let second = (ex * ex + ey * ey).sqrt();
                    let correction = (first + second - span).max(0.0) / (wa + 1.0);
                    self.nodes[i - 1].x +=
                        dx / if first != 0.0 { first } else { 1.0 } * correction * wa;
                    self.nodes[i - 1].y +=
                        dy / if first != 0.0 { first } else { 1.0 } * correction * wa;
                    self.nodes[i].x += ex / if second != 0.0 { second } else { 1.0 } * correction;
                    self.nodes[i].y += ey / if second != 0.0 { second } else { 1.0 } * correction;
                } else {
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let squared = dx * dx + dy * dy;
                    if squared <= span * span {
                        continue;
                    }
                    let actual = squared.sqrt();
                    let correction = (actual - span) / actual / (wa + 1.0);
                    self.nodes[i - 1].x += dx * correction * wa;
                    self.nodes[i - 1].y += dy * correction * wa;
                    self.nodes[i].x -= dx * correction;
                    self.nodes[i].y -= dy * correction;
                }
            }
            for n in &mut self.nodes[1..] {
                for s in &self.terrain {
                    if s.outside([n.x, n.y], [n.x, n.y], CLEARANCE, true) {
                        continue;
                    }
                    let e = s.face([n.x, n.y]);
                    if s.inside([n.x, n.y]) {
                        n.x = e.x + e.nx * CLEARANCE;
                        n.y = e.y + e.ny * CLEARANCE;
                    } else if e.distance < CLEARANCE {
                        let scale = CLEARANCE / e.distance;
                        n.x = e.x + (n.x - e.x) * scale;
                        n.y = e.y + (n.y - e.y) * scale;
                    }
                }
            }
            if pass % 8 == 7 && self.terrain.is_empty() {
                self.bends.fill(None);
            }
            if pass % 8 == 7 && !self.terrain.is_empty() {
                for i in 1..count {
                    let a = self.nodes[i - 1];
                    let b = self.nodes[i];
                    self.bends[i - 1] = bend([a.x, a.y], [b.x, b.y], &self.terrain);
                    if self.bends[i - 1].is_some() {
                        continue;
                    }
                    for s in &self.terrain {
                        let a = self.nodes[i - 1];
                        let b = self.nodes[i];
                        if let Some([t, dx, dy]) =
                            s.penetration([a.x, a.y], [b.x, b.y], &mut self.cuts)
                        {
                            let wa = if i == 1 { 0.0 } else { 1.0 };
                            let denominator = (1.0 - t).powi(2) * wa + t.powi(2);
                            if denominator < 1e-8 {
                                continue;
                            }
                            for (index, weight) in
                                [(i - 1, (1.0 - t) * wa / denominator), (i, t / denominator)]
                            {
                                let dx = dx * weight;
                                let dy = dy * weight;
                                let len = hypot(dx, dy);
                                if len == 0.0 {
                                    continue;
                                }
                                let n = &mut self.nodes[index];
                                n.x += dx;
                                n.y += dy;
                                n.old_x += dx;
                                n.old_y += dy;
                                let into = ((n.x - n.old_x) * dx + (n.y - n.old_y) * dy) / len;
                                if into < 0.0 {
                                    n.old_x += dx / len * into;
                                    n.old_y += dy / len * into;
                                }
                            }
                        }
                    }
                }
            }
        }
        if was_clear && !clear(&self.nodes, &self.bends, &self.terrain) {
            self.proposed.clone_from(&self.nodes);
            for attempt in 1..=8 {
                let fraction = if attempt < 8 {
                    2.0_f64.powi(-attempt)
                } else {
                    0.0
                };
                for i in 1..count {
                    let a = self.before[i];
                    let b = self.proposed[i];
                    let n = &mut self.nodes[i];
                    n.x = a.x + (b.x - a.x) * fraction;
                    n.y = a.y + (b.y - a.y) * fraction;
                    n.old_x = n.x - (b.x - b.old_x) * fraction;
                    n.old_y = n.y - (b.y - b.old_y) * fraction;
                }
                for i in 0..count - 1 {
                    self.bends[i] = if fraction != 0.0 {
                        bend(
                            [self.nodes[i].x, self.nodes[i].y],
                            [self.nodes[i + 1].x, self.nodes[i + 1].y],
                            &self.terrain,
                        )
                    } else {
                        self.previous_bends[i]
                    };
                }
                if clear(&self.nodes, &self.bends, &self.terrain) {
                    break;
                }
            }
        }
        for i in 0..count {
            let n = self.nodes[i];
            self.packet[i * 5..i * 5 + 4].copy_from_slice(&[n.x, n.y, n.old_x, n.old_y]);
        }
        for i in 0..count - 1 {
            let (present, p) = self.bends[i].map_or((0.0, [0.0, 0.0]), |p| (1.0, p));
            self.packet[count * 5 + i * 3..count * 5 + i * 3 + 3]
                .copy_from_slice(&[present, p[0], p[1]]);
        }
        true
    }
}
thread_local! { static SOLVER: RefCell<Solver> = RefCell::new(Solver::default()); }
#[no_mangle]
pub extern "C" fn abi_version() -> u32 {
    2
}
#[no_mangle]
pub extern "C" fn hypot2(x: f64, y: f64) -> f64 {
    hypot(x, y)
}
#[no_mangle]
pub extern "C" fn reserve(count: usize, terrain_size: usize) -> u32 {
    // Refuse oversized packets before allocation; the JS adapter falls back.
    if !(2..=4096).contains(&count) || terrain_size > 262144 {
        return 0;
    }
    SOLVER.with(|cell| {
        let mut s = cell.borrow_mut();
        s.count = count;
        s.terrain_size = terrain_size;
        s.packet
            .resize(count * 5 + (count - 1) * 3 + terrain_size, 0.0);
        s.packet.as_mut_ptr() as u32
    })
}
#[no_mangle]
pub extern "C" fn solve(
    ax: f64,
    ay: f64,
    length: f64,
    dt: f64,
    damping: f64,
    shape_count: usize,
) -> u32 {
    SOLVER.with(|cell| {
        u32::from(
            cell.borrow_mut()
                .solve(ax, ay, length, dt, damping, shape_count),
        )
    })
}
