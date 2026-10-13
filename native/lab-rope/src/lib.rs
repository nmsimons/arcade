//! Unattached LAB ropes: the same ordered constraints and complete-span contacts
//! as climbables.ts. No host callbacks, reduced iterations, or camera culling.
//! The single-threaded Wasm adapter owns one reusable workspace. Its bounded
//! f64 packet contains nodes (x,y,oldX,oldY,gravity), bends (present,x,y), then
//! terrain (x,y,w,h,pointCount, world-coordinate point pairs).
use std::cell::{Cell, RefCell};
use std::collections::{HashMap, VecDeque};
use std::rc::Rc;

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
#[derive(Clone, Copy, Default)]
struct ConstraintMemo {
    valid: bool,
    positions: [u64; 4],
    bend: Option<Point>,
    radius: f64,
}
#[derive(Clone, Copy, Default)]
struct ContactMemo {
    valid: bool,
    input: [u64; 2],
    output: Point,
    radius: f64,
}
struct Edge {
    a: Point,
    bounds: [f64; 4],
    dx: f64,
    dy: f64,
    squared: f64,
    nx: f64,
    ny: f64,
}
struct EdgeBranch {
    bounds: [f64; 4],
    start: usize,
    end: usize,
    children: Option<[usize; 2]>,
}
struct Corner {
    point: Point,
    bend: Point,
}
struct Shape {
    bounds: [f64; 4],
    points: Vec<Point>,
    edges: Vec<Edge>,
    nearest: Cell<usize>,
    region_nearest: Vec<Cell<usize>>,
    region_scale: [f64; 2],
    edge_tree: Vec<EdgeBranch>,
    edge_order: Vec<usize>,
    scan_edges: Vec<Vec<usize>>,
    scan_y: f64,
    scan_height: f64,
    corners: Vec<Corner>,
    query_margin: f64,
    convex_certificate: bool,
}
#[derive(Clone, Copy)]
struct Face {
    x: f64,
    y: f64,
    distance: f64,
    nx: f64,
    ny: f64,
    interior: bool,
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
    terrain: Vec<Rc<Shape>>,
    prepared: HashMap<u64, Rc<Shape>>,
    prepared_order: VecDeque<u64>,
    prepared_vertices: usize,
    cuts: Vec<f64>,
    active: bool,
    constraint_memo: Vec<ConstraintMemo>,
    contact_memo: Vec<ContactMemo>,
    active_stats: [u32; 4],
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
    // Infinity/NaN were handled above; both finite magnitudes have +0.
    let scale = if a > b { a } else { b };
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
fn build_bounds_tree(
    boxes: &[[f64; 4]],
    order: &mut [usize],
    tree: &mut Vec<EdgeBranch>,
    offset: usize,
) -> usize {
    let mut bounds = [
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
    ];
    for &i in order.iter() {
        bounds[0] = bounds[0].min(boxes[i][0]);
        bounds[1] = bounds[1].max(boxes[i][1]);
        bounds[2] = bounds[2].min(boxes[i][2]);
        bounds[3] = bounds[3].max(boxes[i][3]);
    }
    let at = tree.len();
    tree.push(EdgeBranch {
        bounds,
        start: offset,
        end: offset + order.len(),
        children: None,
    });
    if order.len() > 4 {
        let axis = usize::from(bounds[3] - bounds[2] > bounds[1] - bounds[0]);
        let middle = order.len() / 2;
        order.select_nth_unstable_by(middle, |&i, &j| {
            (boxes[i][axis * 2] + boxes[i][axis * 2 + 1])
                .total_cmp(&(boxes[j][axis * 2] + boxes[j][axis * 2 + 1]))
        });
        let (left, right) = order.split_at_mut(middle);
        let a = build_bounds_tree(boxes, left, tree, offset);
        let b = build_bounds_tree(boxes, right, tree, offset + middle);
        tree[at].children = Some([a, b]);
    }
    at
}
impl Shape {
    fn new(bounds: [f64; 4], points: Vec<Point>) -> Self {
        let edges: Vec<Edge> = points
            .iter()
            .enumerate()
            .map(|(i, &a)| {
                let c = points[(i + 1) % points.len()];
                let dx = c[0] - a[0];
                let dy = c[1] - a[1];
                let length = hypot(dx, dy);
                Edge {
                    a,
                    bounds: [
                        a[0].min(c[0]),
                        a[0].max(c[0]),
                        a[1].min(c[1]),
                        a[1].max(c[1]),
                    ],
                    dx,
                    dy,
                    squared: length * length,
                    nx: dy / length,
                    ny: -dx / length,
                }
            })
            .collect();
        // Geometry is immutable throughout a rope solve. Keep the original
        // arithmetic and corner order, but prepare these repeated queries once.
        let mut corners = Vec::new();
        for i in 0..points.len() {
            let before = points[(i + points.len() - 1) % points.len()];
            let p = points[i];
            let after = points[(i + 1) % points.len()];
            if cross(before, p, after) <= EPS {
                continue;
            }
            let u = hypot(p[0] - before[0], p[1] - before[1]);
            let v = hypot(after[0] - p[0], after[1] - p[1]);
            let n1 = [(p[1] - before[1]) / u, (before[0] - p[0]) / u];
            let n2 = [(after[1] - p[1]) / v, (p[0] - after[0]) / v];
            let scale = CLEARANCE / (1.0 + n1[0] * n2[0] + n1[1] * n2[1]).max(0.1);
            corners.push(Corner {
                point: p,
                bend: [
                    p[0] + (n1[0] + n2[0]) * scale,
                    p[1] + (n1[1] + n2[1]) * scale,
                ],
            });
        }
        let mut edge_tree = Vec::new();
        let mut edge_order = Vec::new();
        let mut scan_edges = Vec::new();
        let scan_y = points.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
        let scan_height = points
            .iter()
            .map(|p| p[1])
            .fold(f64::NEG_INFINITY, f64::max)
            - scan_y;
        let query_margin = EPS * 2.0
            + points.iter().flatten().fold(0.0_f64, |v, p| v.max(p.abs())) * f64::EPSILON * 8.0;
        // Use the convex-face certificate only away from small/flat faces and
        // extreme coordinates. Ambiguous contacts retain the complete query.
        let convex_certificate = points.len() >= 12
            && bounds.iter().all(|v| v.abs() <= 1e6)
            && edges.iter().all(|e| e.squared >= 1.0)
            && points.iter().enumerate().all(|(i, &p)| {
                let a = points[(i + points.len() - 1) % points.len()];
                let b = points[(i + 1) % points.len()];
                cross(a, p, b)
                    > 0.01 * hypot(p[0] - a[0], p[1] - a[1]) * hypot(b[0] - p[0], b[1] - p[1])
            });
        // Small rectangles retain their cheap direct loops. Large round hulls
        // use conservative bounds; exact projection/ray predicates are unchanged.
        if points.len() >= 12 {
            edge_order.extend(0..points.len());
            let boxes: Vec<_> = edges
                .iter()
                .enumerate()
                .map(|(i, e)| {
                    let b = points[(i + 1) % points.len()];
                    [
                        e.a[0].min(b[0]),
                        e.a[0].max(b[0]),
                        e.a[1].min(b[1]),
                        e.a[1].max(b[1]),
                    ]
                })
                .collect();
            build_bounds_tree(&boxes, &mut edge_order, &mut edge_tree, 0);
            if scan_height > EPS {
                scan_edges.resize_with(16, Vec::new);
                for i in 0..points.len() {
                    let a = points[i];
                    let b = points[(i + points.len() - 1) % points.len()];
                    let low = (((a[1].min(b[1]) - EPS - scan_y) / scan_height * 16.0).floor()
                        as usize)
                        .min(15)
                        .saturating_sub(1);
                    let high = ((((a[1].max(b[1]) + EPS - scan_y) / scan_height * 16.0).floor()
                        as usize)
                        .min(15)
                        + 1)
                    .min(15);
                    for bin in &mut scan_edges[low..=high] {
                        bin.push(i);
                    }
                }
            }
        }
        let region_nearest = if points.len() >= 12 && bounds[2] > EPS && bounds[3] > EPS {
            vec![Cell::new(0); 256]
        } else {
            Vec::new()
        };
        Self {
            bounds,
            points,
            edges,
            nearest: Cell::new(0),
            region_nearest,
            region_scale: [16.0 / bounds[2], 16.0 / bounds[3]],
            edge_tree,
            edge_order,
            scan_edges,
            scan_y,
            scan_height,
            corners,
            query_margin,
            convex_certificate,
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
        let test = |i: usize, inside: &mut bool| {
            let a = self.points[i];
            let c = self.points[(i + self.points.len() - 1) % self.points.len()];
            if on_segment(p, a, c) {
                return true;
            }
            if (a[1] > p[1]) != (c[1] > p[1])
                && p[0] < (c[0] - a[0]) * (p[1] - a[1]) / (c[1] - a[1]) + a[0]
            {
                *inside = !*inside;
            }
            false
        };
        if self.scan_edges.is_empty() {
            for i in 0..self.points.len() {
                if test(i, &mut inside) {
                    return true;
                }
            }
        } else {
            let bin = (((p[1] - self.scan_y) / self.scan_height * 16.0).floor() as usize).min(15);
            for &i in &self.scan_edges[bin] {
                if test(i, &mut inside) {
                    return true;
                }
            }
        }
        inside
    }
    fn face_candidate(&self, i: usize, p: Point, best: &mut Face, best_index: &mut usize) {
        let e = &self.edges[i];
        let t = clamp(((p[0] - e.a[0]) * e.dx + (p[1] - e.a[1]) * e.dy) / e.squared);
        let q = [e.a[0] + e.dx * t, e.a[1] + e.dy * t];
        let gx = q[0] - p[0];
        let gy = q[1] - p[1];
        if gx * gx + gy * gy > (best.distance + EPS) * (best.distance + EPS) {
            return;
        }
        let distance = hypot(gx, gy);
        if distance < best.distance || distance == best.distance && i < *best_index {
            *best = Face {
                x: q[0],
                y: q[1],
                distance,
                nx: e.nx,
                ny: e.ny,
                interior: (0.02..=0.98).contains(&t),
            };
            *best_index = i;
        }
    }
    fn face_branch(
        &self,
        at: usize,
        p: Point,
        hint: usize,
        best: &mut Face,
        best_index: &mut usize,
    ) {
        let branch = &self.edge_tree[at];
        let [left, right, top, bottom] = branch.bounds;
        let dx = (left - p[0]).max(p[0] - right).max(0.0);
        let dy = (top - p[1]).max(p[1] - bottom).max(0.0);
        // Bounds prune only edges that cannot beat the current exact distance.
        // Extra tolerance retains boundary/nearest-face ties, including hints.
        let margin = self.query_margin;
        if dx * dx + dy * dy > (best.distance + margin) * (best.distance + margin) {
            return;
        }
        if let Some([a, b]) = branch.children {
            self.face_branch(a, p, hint, best, best_index);
            self.face_branch(b, p, hint, best, best_index);
        } else {
            for &i in &self.edge_order[branch.start..branch.end] {
                if i != hint {
                    self.face_candidate(i, p, best, best_index);
                }
            }
        }
    }
    fn face(&self, p: Point) -> Face {
        // A single hint is continually replaced by contacts on the opposite
        // side of a round hull. Spatial hints retain locality across particles
        // and passes; they only seed the exact nearest-face/certificate query.
        let region = if self.region_nearest.is_empty() {
            None
        } else {
            let x = (((p[0] - self.bounds[0]) * self.region_scale[0]) as usize).min(15);
            let y = (((p[1] - self.bounds[1]) * self.region_scale[1]) as usize).min(15);
            Some(y * 16 + x)
        };
        let hint = region.map_or_else(|| self.nearest.get(), |i| self.region_nearest[i].get());
        let mut best_index = hint;
        let candidate = |e: &Edge| {
            let t = clamp(((p[0] - e.a[0]) * e.dx + (p[1] - e.a[1]) * e.dy) / e.squared);
            ([e.a[0] + e.dx * t, e.a[1] + e.dy * t], t)
        };
        let e = &self.edges[hint];
        let (q, t) = candidate(e);
        let mut best = Face {
            x: q[0],
            y: q[1],
            distance: hypot(q[0] - p[0], q[1] - p[1]),
            nx: e.nx,
            ny: e.ny,
            interior: (0.02..=0.98).contains(&t),
        };
        // An outward point projected inside a convex supporting face has that
        // face as its unique nearest boundary. Near vertices/ties still scan.
        if self.convex_certificate
            && best.interior
            && best.distance > 1e-4
            && best.distance < 4.0
            && (p[0] - q[0]) * e.nx + (p[1] - q[1]) * e.ny > 1e-4
        {
            return best;
        }
        if self.edge_tree.is_empty() {
            for i in 0..self.edges.len() {
                if i != hint {
                    self.face_candidate(i, p, &mut best, &mut best_index);
                }
            }
        } else {
            self.face_branch(0, p, hint, &mut best, &mut best_index);
        }
        self.nearest.set(best_index);
        if let Some(i) = region {
            self.region_nearest[i].set(best_index);
        }
        best
    }
    fn inside_nearest(&self, p: Point, face: Face) -> bool {
        if !(self.convex_certificate
            && face.interior
            && face.distance > 1e-4
            && face.distance < 4.0)
        {
            return self.inside(p);
        }
        if self.outside(p, p, 0.0, false) {
            return false;
        }
        let side = (p[0] - face.x) * face.nx + (p[1] - face.y) * face.ny;
        if side.abs() > 1e-4 {
            return side < 0.0;
        }
        self.inside(p)
    }
    fn blocked(&self, a: Point, b: Point) -> bool {
        if self.outside(a, b, 0.0, false) {
            return false;
        }
        let rx = b[0] - a[0];
        let ry = b[1] - a[1];
        let margin = EPS * 2.0
            + a.iter()
                .chain(b.iter())
                .fold(0.0_f64, |v, p| v.max(p.abs()))
                * f64::EPSILON
                * 8.0;
        let left = a[0].min(b[0]) - margin;
        let right = a[0].max(b[0]) + margin;
        let top = a[1].min(b[1]) - margin;
        let bottom = a[1].max(b[1]) + margin;
        for e in &self.edges {
            if right < e.bounds[0]
                || left > e.bounds[1]
                || bottom < e.bounds[2]
                || top > e.bounds[3]
            {
                continue;
            }
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
        let margin = CLEARANCE
            + EPS * 2.0
            + a.iter()
                .chain(b.iter())
                .fold(0.0_f64, |v, p| v.max(p.abs()))
                * f64::EPSILON
                * 8.0;
        let left = a[0].min(b[0]) - margin;
        let right = a[0].max(b[0]) + margin;
        let top = a[1].min(b[1]) - margin;
        let bottom = a[1].max(b[1]) + margin;
        for corner in &self.corners {
            let p = corner.point;
            // A corner farther than the rope radius from the span's bounding
            // box cannot satisfy the original exact distance predicate.
            if p[0] < left || p[0] > right || p[1] < top || p[1] > bottom {
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
            if right < e.bounds[0]
                || left > e.bounds[1]
                || bottom < e.bounds[2]
                || top > e.bounds[3]
            {
                continue;
            }
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
fn blocked(a: Point, b: Point, terrain: &[Rc<Shape>]) -> bool {
    terrain.iter().any(|s| s.blocked(a, b))
}
fn bend(a: Point, b: Point, terrain: &[Rc<Shape>]) -> Option<Point> {
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
        for corner in &s.corners {
            let p = corner.point;
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
            let c = corner.bend;
            let along = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / denominator;
            if along <= EPS || along >= 1.0 - EPS {
                continue;
            }
            let limit = direct + CLEARANCE * 6.0 + EPS * 2.0;
            let ax = c[0] - a[0];
            let ay = c[1] - a[1];
            let bx = c[0] - b[0];
            let by = c[1] - b[1];
            if ax * ax + ay * ay > limit * limit || bx * bx + by * by > limit * limit {
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
fn clear(nodes: &[Node], bends: &[Option<Point>], terrain: &[Rc<Shape>]) -> bool {
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
    #[inline(never)]
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
                // Many ropes visit the same moving collider during one tick.
                // Share its immutable prepared geometry across those calls.
                // Hashing only selects a candidate: exact coordinates still
                // verify the hit, including outlines edited in place.
                let mut key = 0xcbf29ce484222325_u64;
                for value in b.iter().chain(self.packet[offset..offset + n * 2].iter()) {
                    key = (key ^ value.to_bits()).wrapping_mul(0x100000001b3);
                }
                let cached = self
                    .prepared
                    .get(&key)
                    .filter(|s| {
                        s.bounds == b
                            && s.points.len() == n
                            && s.points.iter().enumerate().all(|(j, p)| {
                                p[0] == self.packet[offset + j * 2]
                                    && p[1] == self.packet[offset + j * 2 + 1]
                            })
                    })
                    .cloned();
                let shape = if let Some(cached) = cached {
                    cached
                } else {
                    let points = (0..n)
                        .map(|j| [self.packet[offset + j * 2], self.packet[offset + j * 2 + 1]])
                        .collect();
                    let shape = Rc::new(Shape::new(b, points));
                    // A FIFO bounds retained geometry to 256 shapes / 16K
                    // vertices. Hash collisions use an uncached exact shape.
                    if !self.prepared.contains_key(&key) {
                        while self.prepared.len() >= 256 || self.prepared_vertices + n > 16384 {
                            let Some(old) = self.prepared_order.pop_front() else {
                                break;
                            };
                            if let Some(old) = self.prepared.remove(&old) {
                                self.prepared_vertices -= old.points.len();
                            }
                        }
                        self.prepared_vertices += n;
                        self.prepared_order.push_back(key);
                        self.prepared.insert(key, Rc::clone(&shape));
                    }
                    shape
                };
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
        if self.active {
            self.constraint_memo
                .resize(count - 1, ConstraintMemo::default());
            self.constraint_memo.fill(ConstraintMemo::default());
            self.contact_memo.resize(count, ContactMemo::default());
            self.contact_memo.fill(ContactMemo::default());
        }
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
        if self.active {
            let visits = (passes * (count - 1)) as u32;
            self.active_stats[0] = self.active_stats[0].wrapping_add(visits);
            self.active_stats[2] = self.active_stats[2].wrapping_add(visits);
        }
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
                let positions = [a.x.to_bits(), a.y.to_bits(), b.x.to_bits(), b.y.to_bits()];
                if self.active {
                    let memo = self.constraint_memo[i - 1];
                    if memo.valid
                        && same_bend(memo.bend, self.bends[i - 1])
                        && (memo.positions == positions
                            || memo.bend.is_none()
                                && memo.radius > 0.0
                                && positions.iter().zip(memo.positions).all(|(&p, q)| {
                                    (f64::from_bits(p) - f64::from_bits(q)).abs() < memo.radius
                                }))
                    {
                        self.active_stats[1] = self.active_stats[1].wrapping_add(1);
                        continue;
                    }
                    self.constraint_memo[i - 1].valid = false;
                }
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
                        if self.active {
                            self.constraint_memo[i - 1] = ConstraintMemo {
                                valid: true,
                                positions,
                                bend: self.bends[i - 1],
                                // Manhattan distance bounds Euclidean distance.
                                // Moving both endpoints within this square can
                                // consume at most half the certified slack.
                                radius: if positions.iter().all(|&v| f64::from_bits(v).abs() <= 1e6)
                                {
                                    (span - dx.abs() - dy.abs() - 1e-4).max(0.0) * 0.125
                                } else {
                                    0.0
                                },
                            };
                        }
                        continue;
                    }
                    let actual = squared.sqrt();
                    let correction = (actual - span) / actual / (wa + 1.0);
                    self.nodes[i - 1].x += dx * correction * wa;
                    self.nodes[i - 1].y += dy * correction * wa;
                    self.nodes[i].x -= dx * correction;
                    self.nodes[i].y -= dy * correction;
                }
                if self.active
                    && positions
                        == [
                            self.nodes[i - 1].x.to_bits(),
                            self.nodes[i - 1].y.to_bits(),
                            self.nodes[i].x.to_bits(),
                            self.nodes[i].y.to_bits(),
                        ]
                {
                    self.constraint_memo[i - 1] = ConstraintMemo {
                        valid: true,
                        positions,
                        bend: self.bends[i - 1],
                        radius: 0.0,
                    };
                }
            }
            for i in 1..count {
                let n = &mut self.nodes[i];
                let input = [n.x.to_bits(), n.y.to_bits()];
                if self.active {
                    let memo = self.contact_memo[i];
                    if memo.valid && memo.input == input {
                        n.x = memo.output[0];
                        n.y = memo.output[1];
                        self.active_stats[3] = self.active_stats[3].wrapping_add(1);
                        continue;
                    }
                    if memo.valid
                        && memo.radius > 0.0
                        && (n.x - f64::from_bits(memo.input[0])).abs() < memo.radius
                        && (n.y - f64::from_bits(memo.input[1])).abs() < memo.radius
                    {
                        // The cached region excludes every expanded solid.
                        // Preserve the current coordinates, not the old output.
                        self.active_stats[3] = self.active_stats[3].wrapping_add(1);
                        continue;
                    }
                }
                let mut free_gap = f64::INFINITY;
                for s in &self.terrain {
                    if s.outside([n.x, n.y], [n.x, n.y], CLEARANCE, true) {
                        if self.active {
                            let [x, y, w, h] = s.bounds;
                            let gap = (x - CLEARANCE - n.x)
                                .max(n.x - (x + w + CLEARANCE))
                                .max(y - CLEARANCE - n.y)
                                .max(n.y - (y + h + CLEARANCE));
                            free_gap = free_gap.min(gap - 1e-4);
                        }
                        continue;
                    }
                    let e = s.face([n.x, n.y]);
                    if s.inside_nearest([n.x, n.y], e) {
                        free_gap = 0.0;
                        n.x = e.x + e.nx * CLEARANCE;
                        n.y = e.y + e.ny * CLEARANCE;
                    } else if e.distance < CLEARANCE {
                        free_gap = 0.0;
                        let scale = CLEARANCE / e.distance;
                        n.x = e.x + (n.x - e.x) * scale;
                        n.y = e.y + (n.y - e.y) * scale;
                    } else if self.active {
                        // Outside a polygon, nearest-boundary distance is a
                        // lower bound for any new contact until the point moves
                        // that far. Use a wide numerical margin and a small
                        // fraction of the gap; large-coordinate hulls fall back.
                        let gap = if s.bounds.iter().all(|v| v.abs() <= 1e6)
                            && s.query_margin <= EPS * 2.0 + 1e6 * f64::EPSILON * 8.0
                        {
                            (e.distance - CLEARANCE) * 0.25 - 1e-4 - s.query_margin * 32.0
                        } else {
                            0.0
                        };
                        free_gap = free_gap.min(gap);
                    }
                }
                if self.active {
                    self.contact_memo[i] = ContactMemo {
                        valid: true,
                        input,
                        output: [n.x, n.y],
                        radius: if input == [n.x.to_bits(), n.y.to_bits()]
                            && n.x.abs() <= 1e6
                            && n.y.abs() <= 1e6
                        {
                            (free_gap * 0.25).clamp(0.0, 16.0)
                        } else {
                            0.0
                        },
                    };
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
fn same_bend(a: Option<Point>, b: Option<Point>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => a[0].to_bits() == b[0].to_bits() && a[1].to_bits() == b[1].to_bits(),
        (None, None) => true,
        _ => false,
    }
}
#[no_mangle]
pub extern "C" fn set_active_solver(value: u32) {
    SOLVER.with(|cell| {
        let mut s = cell.borrow_mut();
        s.active = value != 0;
        s.active_stats = [0; 4];
    });
}
#[no_mangle]
pub extern "C" fn active_stats(index: usize) -> u32 {
    SOLVER.with(|cell| cell.borrow().active_stats.get(index).copied().unwrap_or(0))
}
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
