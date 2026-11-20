import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel, isHubLevel } from '../src/games/jumping/level.ts'
import { parseCampaign } from '../src/games/jumping/campaign.ts'
import { resolveCampaign } from '../src/games/jumping/facility.ts'
import { librarySections } from '../src/games/jumping/libraryOrder.ts'
import { builtinLevels, BUILTIN_LEVELS_ROOT } from './helpers/jumping-builtin-levels.mjs'

// The level library lists the facility in the order it is played (libraryOrder.ts).

const entries = builtinLevels().map(({ file }) => ({ fileName: file,
  level: parseLevel(JSON.parse(readFileSync(new URL(encodeURIComponent(file), BUILTIN_LEVELS_ROOT), 'utf8'))) }))
const levels = new Map(entries.map(entry => [entry.level.id, entry.level]))
const campaign = resolveCampaign(parseCampaign(JSON.parse(readFileSync(new URL('../public/levels/jumping-campaign.json', import.meta.url), 'utf8'))), levels)
const sections = librarySections(entries, entry => entry.level, campaign)
const ids = section => section.entries.map(entry => entry.level.id)

test('facility areas head the library, then the wings in the order the concourse opens them, each with its courses in door order', () => {
  const areas = sections.filter(section => section.kind === 'area').map(section => section.hub.level.id)
  assert.deepEqual(areas, campaign.areas.filter(id => !campaign.wings.some(wing => wing.level === id)), 'areas without level doors come first, nearest the start first')
  assert.equal(areas[0], campaign.start)
  const wings = sections.filter(section => section.kind === 'wing')
  assert.deepEqual(wings.map(section => section.hub.level.id), campaign.wings.map(wing => wing.level))
  assert.deepEqual(wings.map(section => section.order), wings.map((_, index) => index + 1))
  for (const [index, section] of wings.entries()) {
    const doors = campaign.wings[index].courses
    assert.deepEqual(ids(section).filter(id => doors.includes(id)), doors, `${section.hub.level.name}: courses in the order their doors open`)
  }
  const kinds = sections.map(section => section.kind)
  assert.ok(kinds.indexOf('wing') > kinds.lastIndexOf('area') || !kinds.includes('area'), 'areas before wings')
})

test('the dispatch course and the courses its exits lead to come after every wing, in the order they are played', () => {
  const dispatch = sections.find(section => section.kind === 'dispatch')
  assert.ok(dispatch, 'a dispatch section')
  assert.equal(dispatch.hub.level.id, campaign.dispatch.area)
  assert.equal(ids(dispatch)[0], campaign.finalCourse)
  for (let i = 1; i < dispatch.entries.length; i++) {
    const before = dispatch.entries[i - 1].level
    assert.equal(before.goal?.leadsTo?.level, dispatch.entries[i].level.id, `${before.name} leads on to ${dispatch.entries[i].level.name}`)
  }
  assert.ok(sections.indexOf(dispatch) > sections.findLastIndex(section => section.kind === 'wing'))
})

test('every built-in level appears once, with levels the campaign never reaches last and no facility area listed as a course', () => {
  // The dispatch section names the area its door is in, which heads its own section too.
  const listed = sections.flatMap(section => [...section.hub && section.kind !== 'dispatch' ? [section.hub] : [], ...section.entries])
  assert.equal(listed.length, entries.length)
  assert.equal(new Set(listed).size, entries.length)
  for (const section of sections) for (const entry of section.entries) assert.ok(!isHubLevel(entry.level), `${entry.level.name} is a course`)
  const outside = sections.at(-1)
  assert.equal(outside.kind, 'outside')
  const placed = new Set([...campaign.wings.flatMap(wing => wing.courses), ...Object.keys(campaign.chained), campaign.finalCourse])
  for (const entry of outside.entries) assert.ok(!placed.has(entry.level.id), `${entry.level.name} is outside the campaign`)
})

test('without a campaign that fits, the library is one plain list of courses in the order given', () => {
  const plain = librarySections(entries, entry => entry.level, null)
  assert.equal(plain.length, 1)
  assert.equal(plain[0].kind, 'outside')
  assert.deepEqual(plain[0].entries, entries.filter(entry => !isHubLevel(entry.level)))
  const elsewhere = librarySections(entries.filter(entry => entry.level.id !== campaign.start), entry => entry.level, campaign)
  assert.equal(elsewhere.length, 1, 'a collection without the start stands outside the campaign')
})
