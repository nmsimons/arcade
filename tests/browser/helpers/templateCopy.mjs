import { expect } from '@playwright/test'
import { parseLevel, prepareLevelRopes } from '../../../src/games/jumping/level.ts'

const connectedItems = level => [...level.mechanisms ?? [], ...level.lighting?.lights ?? [], ...level.goal?.id ? [level.goal] : []]

/** Copies keep all content and connections while receiving independent identities. */
export function expectIndependentTemplateCopy(copy, source) {
  const expected = parseLevel(prepareLevelRopes(source)), actual = structuredClone(copy)
  const originals = [expected, ...connectedItems(expected)], copies = [actual, ...connectedItems(actual)]
  expect(copies).toHaveLength(originals.length)
  const oldIds = new Set(originals.map(item => item.id)), ids = new Map()
  for (let i = 0; i < copies.length; i++) {
    expect(copies[i].id).toBeTruthy()
    expect(oldIds.has(copies[i].id)).toBe(false)
    ids.set(copies[i].id, originals[i].id)
  }
  expect(ids.size).toBe(copies.length)
  for (const item of copies) item.id = ids.get(item.id)
  for (const trigger of actual.triggers ?? []) {
    if (trigger.targets) trigger.targets = trigger.targets.map(id => ids.get(id) ?? id)
    else if (trigger.target) trigger.target = ids.get(trigger.target) ?? trigger.target
  }
  expect(actual.name).toBe(`${source.name.slice(0, 73)} — copy`)
  actual.name = expected.name
  expect(actual).toEqual(expected)
}
