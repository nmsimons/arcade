import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

/** Build an isolated diagnostic kernel. Phase boundaries inhibit inlining only
 * here; production source, binary and build provenance are never overwritten.
 * Sampling percentages locate work, not production timing or FPS gains. */
export function buildPhaseProfile() {
  let source = readFileSync('native/lab-rope/src/lib.rs', 'utf8')
  const take = (start, end) => {
    const a = source.indexOf(start), b = source.indexOf(end, a + start.length)
    if (a < 0 || b < 0) throw new Error(`Diagnostic phase boundary missing: ${start}`)
    return { a, b, text: source.slice(a, b) }
  }
  const recovery = take('        if was_clear && !clear(', '        for i in 0..count {\n            let n = self.nodes[i];')
  source = source.slice(0, recovery.a) + '        self.clearance_recovery(was_clear);\n' + source.slice(recovery.b)
  const passes = take('        for pass in 0..passes {', '        self.clearance_recovery(was_clear);')
  const anchor = passes.text.indexOf('            self.nodes[0].x = ax;')
  const nodeStart = passes.text.indexOf('            for i in 1..count {')
  const spanStart = passes.text.indexOf('            if pass % 8 == 7 && self.terrain.is_empty() {')
  if ([anchor, nodeStart, spanStart].some(x => x < 0)) throw new Error('Diagnostic loop boundary missing')
  const constraint = passes.text.slice(anchor, nodeStart)
  const nodes = passes.text.slice(nodeStart, spanStart)
  const spans = passes.text.slice(spanStart, passes.text.lastIndexOf('        }'))
  source = source.slice(0, passes.a) + `        for pass in 0..passes {
            self.constraint_pass(pass, ax, ay);
            self.node_contacts();
            self.span_contacts(pass);
        }
` + source.slice(passes.b)
  const helpers = `
    #[inline(never)]
    fn constraint_pass(&mut self, pass: usize, ax: f64, ay: f64) {
        let count = self.count;
${constraint}    }
    #[inline(never)]
    fn node_contacts(&mut self) {
        let count = self.count;
${nodes}    }
    #[inline(never)]
    fn span_contacts(&mut self, pass: usize) {
        let count = self.count;
${spans}    }
    #[inline(never)]
    fn clearance_recovery(&mut self, was_clear: bool) {
        let count = self.count;
${recovery.text}    }
`
  source = source.replace('impl Solver {', `impl Solver {${helpers}`)
  const directory = resolve('.local/lab-rope-phase-profile')
  mkdirSync(`${directory}/src`, { recursive: true })
  writeFileSync(`${directory}/src/lib.rs`, source)
  writeFileSync(`${directory}/Cargo.toml`, readFileSync('native/lab-rope/Cargo.toml'))
  writeFileSync(`${directory}/Cargo.lock`, readFileSync('native/lab-rope/Cargo.lock'))
  const local = resolve('.local/cargo/bin/cargo.exe')
  const cargo = process.env.LAB_CARGO ?? (existsSync(local) ? local : 'cargo')
  const env = { ...process.env, ...(existsSync(local) && !process.env.LAB_CARGO ? {
    CARGO_HOME: resolve('.local/cargo'), RUSTUP_HOME: resolve('.local/rustup'),
  } : {}) }
  const result = spawnSync(cargo, ['build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '--manifest-path', `${directory}/Cargo.toml`], { env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Diagnostic Cargo build failed: ${result.status}`)
  return `${directory}/target/wasm32-unknown-unknown/release/lab_rope.wasm`
}
