import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance } from './helpers/jumpingLevels.mjs'
import { readFileSync } from 'node:fs'
import { parseLevel } from '../../src/games/jumping/level.ts'
import { parseCampaign } from '../../src/games/jumping/campaign.ts'
import { resolveCampaign } from '../../src/games/jumping/facility.ts'
import { gradeTimes } from '../../src/games/jumping/grading.ts'
import { releaseCertificate } from '../../src/games/jumping/releaseCertificate.ts'

// The built-in collection and its campaign, as the facility reads them.
const levels = new URL('../../public/levels/jumping/', import.meta.url)
const files = JSON.parse(readFileSync(new URL('index.json', levels), 'utf8')).levels
const parsed = files.map(file => [file, parseLevel(JSON.parse(readFileSync(new URL(encodeURIComponent(file), levels), 'utf8')))])
const byId = new Map(parsed.map(([, level]) => [level.id, level]))
const campaign = resolveCampaign(parseCampaign(JSON.parse(readFileSync(new URL('../jumping-campaign.json', levels), 'utf8'))), byId)
// Every required course passed: mostly at its A time, some at B and a few at C.
const completed = {}, times = {}
campaign.wings.flatMap(wing => wing.courses).forEach((id, i) => {
  completed[id] = true
  const level = byId.get(id)
  if (level?.times) { const t = gradeTimes(level); times[id] = i % 7 === 3 ? t.c : i % 3 === 1 ? t.b : t.a }
})
// The escape route's last level, Exit, with its entrance beside the bus stop, and the concourse to return to.
const [exitFile, exitLevel] = parsed.find(([, level]) => level.goal?.kind === 'bus')
const nearBus = { ...JSON.parse(readFileSync(new URL(encodeURIComponent(exitFile), levels), 'utf8')), entrance: { x: exitLevel.goal.x - 960, y: exitLevel.goal.y } }
const concourse = parsed.map(([, level]) => level).find(level => level.kind === 'hub' && level.courseDoors.some(door => campaign.release && door.course === campaign.release.course))
  ?? parsed.map(([, level]) => level).find(level => /concourse/i.test(level.name))
const place = { kind: 'course', level: exitLevel.id, back: { kind: 'hub', level: concourse.id, arrival: { kind: 'entrance' } }, via: 'exit' }
const expected = releaseCertificate({ passed: campaign.wings.flatMap(wing => wing.courses).length, required: campaign.wings.flatMap(wing => wing.courses).length,
  wings: [{ id: 'all', name: 'All', open: true, passed: 0, courses: Object.keys(completed).map(id => ({ state: 'passed', id, name: id, best: times[id] ?? null,
    grade: times[id] === undefined ? null : times[id] <= gradeTimes(byId.get(id)).a + 1e-7 ? 'A' : times[id] <= gradeTimes(byId.get(id)).b + 1e-7 ? 'B' : 'C', deadline: null })) }] })

test('finishing the game ends on the release certificate, and the start screen keeps the mark', async ({ page }, info) => {
  test.setTimeout(180000)
  await page.addInitScript(([completed, times, place]) => {
    if (sessionStorage.getItem('release-test-seeded')) return
    sessionStorage.setItem('release-test-seeded', '1')
    localStorage.setItem('arcade.jumping.completed.v1', JSON.stringify(completed))
    localStorage.setItem('arcade.jumping.times.v1', JSON.stringify(times))
    localStorage.setItem('arcade.jumping.facility.v1', JSON.stringify({ place }))
  }, [completed, times, place])
  // Development reads the catalog through its file API: move Exit's entrance there.
  await page.route('**/__arcade/jumping-levels', async route => {
    if (route.request().method() !== 'POST' || route.request().postDataJSON()?.method !== 'read') return route.continue()
    const response = await route.fetch(), body = await response.json()
    for (const file of body.files ?? []) if (file.fileName === exitFile) { file.level = nearBus; file.sourceText = JSON.stringify(nearBus) }
    return route.fulfill({ response, json: body })
  })
  await page.clock.install({ time: new Date('2026-11-13T12:00:00Z') })
  await page.goto('/lab/facility?renderControl=1')
  const canvas = page.locator('.jumping-game > canvas[role="img"]')
  await expect(canvas).toHaveAttribute('aria-label', new RegExp(`^${exitLevel.name}`), { timeout: 60000 })
  await page.clock.pauseAt(new Date('2026-11-13T13:00:00Z'))
  await finishJumpingEntrance(page)
  // Walking into the bus boards it; the departure then plays out, and Space skips to the end.
  await page.keyboard.down('ArrowRight')
  const departure = page.getByRole('status', { name: 'Bus departure', exact: true })
  for (let elapsed = 0; elapsed < 12000 && !await departure.count(); elapsed += 100) await page.clock.runFor(100)
  await expect(departure).toHaveCount(1)
  await page.keyboard.up('ArrowRight')
  await page.clock.runFor(500)
  await page.keyboard.press('Space')

  const ending = page.getByRole('dialog', { name: 'Game complete', exact: true })
  await expect(ending).toBeVisible()
  await expect(ending.getByRole('heading', { name: 'Released.' })).toBeVisible()
  const certificate = ending.getByRole('region', { name: 'Release certificate' })
  await expect(certificate).toContainText(expected.rating)
  await expect(certificate).toContainText(`${expected.passed} / ${expected.required}`)
  await expect(certificate).toContainText(`A ${expected.grades.A} · B ${expected.grades.B} · C ${expected.grades.C} · D 0`)
  await expect(ending.getByRole('button', { name: /^Return to the facility/ })).toBeFocused()
  await page.screenshot({ path: info.outputPath('release-certificate.png') })
  // Progress opens on the certificate, then the full evaluation; Back returns to the menu.
  await ending.getByRole('button', { name: 'Progress', exact: true }).click()
  const progress = page.getByRole('region', { name: 'Evaluation progress' })
  await expect(progress.getByRole('region', { name: 'Release certificate' })).toContainText(expected.rating)
  await expect(progress).toContainText('Evaluation complete. Unit released for dispatch.')
  await page.keyboard.press('Escape')
  await expect(ending.getByRole('heading', { name: 'Released.' })).toBeVisible()
  // Return to the facility goes back to the route's start, as the old closing card did.
  await ending.getByRole('button', { name: /^Return to the facility/ }).click()
  await expect(ending).toHaveCount(0)
  await expect(canvas).not.toHaveAttribute('aria-label', new RegExp(`^${exitLevel.name}`), { timeout: 60000 })

  // The start screen carries the release from now on. Its opening runs on the ordinary clock.
  await page.clock.resume()
  await page.goto('/lab?renderControl=1')
  const start = page.getByRole('dialog', { name: 'Game start', exact: true })
  await expect(start).toBeVisible({ timeout: 60000 })
  await expect(start.getByText(`Released for dispatch · ${expected.rating}`, { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('release-start-screen.png') })
})
