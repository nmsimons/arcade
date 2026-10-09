import { test, expect } from './helpers/test.mjs'

test('the native quiet standing and crouched silhouettes expose both arms at gameplay scale', async ({ page }, info) => {
  await page.goto('/untitled-jumping-game')
  const samples = await page.evaluate(async () => {
    const [{ createRun, stepRun }, { blankTrial }, { athletePose, drawAthlete }, { NEUTRAL_INPUT }, { athleteSkin }] = await Promise.all([
      import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
      import('/src/games/jumping/athlete.ts'), import('/src/games/jumping/model.ts'), import('/tests/helpers/jumpingSkin.mjs'),
    ])
    const results = []
    for (const facing of [-1, 1]) for (const crouch of [false, true]) for (const scale of [.6, .72]) {
      const run = createRun({ ...blankTrial(), spawn: { x: 800, y: 920 } }), p = run.player
      if (crouch || facing < 0) {
        for (let i = 0; i < 4; i++) stepRun(run, { ...NEUTRAL_INPUT, move: facing, crouch })
        for (let i = 0; i < 360; i++) stepRun(run, { ...NEUTRAL_INPUT, crouch })
      }
      const pose = athletePose(p), canvas = document.createElement('canvas')
      canvas.width = 128; canvas.height = 96
      const ctx = canvas.getContext('2d')
      const transform = c => { c.translate(64, 88); c.scale(scale, scale); c.translate(-p.x, -p.y) }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 96); ctx.save(); transform(ctx); drawAthlete(ctx, p); ctx.restore()
      const actual = ctx.getImageData(0, 0, 128, 96).data, shapes = athleteSkin(p)
      const mask = select => {
        const target = document.createElement('canvas'); target.width = 128; target.height = 96
        const c = target.getContext('2d'); transform(c); c.fillStyle = '#000000'
        for (const shape of shapes.filter(select)) {
          c.beginPath(); shape.points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill()
        }
        return c.getImageData(0, 0, 128, 96).data
      }
      const exposed = ['frontArm', 'backArm'].map(name => {
        const own = mask(shape => shape.name.startsWith(name + ':')), other = mask(shape => !shape.name.startsWith(name + ':'))
        let count = 0
        for (let i = 0; i < actual.length; i += 4)
          if (own[i + 3] > 100 && other[i + 3] < 80 && actual[i] < 220) count++
        return count
      })
      results.push({ facing, crouch, scale, exposed, handSeparation: Math.hypot(...pose.frontArm.end.map((v, i) => v - pose.backArm.end[i])), image: canvas.toDataURL('image/png') })
    }
    return results
  })
  await info.attach('quiet-arm-visibility', { body: JSON.stringify(samples.map(({ image: _image, ...sample }) => sample)), contentType: 'application/json' })
  for (const sample of samples) {
    expect(sample.handSeparation).toBeGreaterThan(6)
    for (const exposed of sample.exposed) expect(exposed, `${sample.facing}/${sample.crouch}/${sample.scale}: visible pixels unique to each arm`).toBeGreaterThan(1)
    await info.attach(`quiet-${sample.facing}-${sample.crouch}-${sample.scale}`, { body: Buffer.from(sample.image.split(',')[1], 'base64'), contentType: 'image/png' })
  }
})
