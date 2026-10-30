import test from 'node:test'
import assert from 'node:assert/strict'
import { EnvironmentTerrainField } from '../src/games/jumping/environmentTerrainField.ts'

test('camera movement reuses world samples and evaluates only entering rows and columns', () => {
  const field = new EnvironmentTerrainField(), revision = {}; let calls = 0
  const query = (x,y) => { calls++; return (x+y+100)/255 }
  const a = field.update(revision, 2, 3, 8, 6, 10, 10, query)
  assert.equal(calls, 80)
  assert.equal(field.update(revision, 8, 9, 8, 6, 10, 10, query), a)
  assert.equal(calls, 80)
  const b = field.update(revision, 12, 3, 8, 6, 10, 10, query)
  assert.equal(calls, 88)
  for (let row=0;row<8;row++) for(let col=0;col<9;col++)
    assert.equal(b.pixels[(row*10+col)*4], a.pixels[(row*10+col+1)*4])
  field.update(revision, 12, 13, 8, 6, 10, 10, query)
  assert.equal(calls, 98)
})

test('revisions, resolution changes, distant cameras and release invalidate the bounded sample window', () => {
  const field = new EnvironmentTerrainField(), revision = {}; let calls = 0
  const sample = () => { calls++; return .35 }
  field.update(revision, 0, 0, 8, 6, 10, 10, sample)
  field.update({}, 0, 0, 8, 6, 10, 10, sample); assert.equal(calls, 160)
  field.update(revision, 0, 0, 8, 6, 10, 10, sample); assert.equal(calls, 240)
  field.update(revision, 1000, 1000, 8, 6, 10, 10, sample); assert.equal(calls, 320)
  field.update(revision, 1000, 1000, 8, 6, 20, 10, sample); assert.equal(calls, 400)
  field.clear(); field.update(revision, 0, 0, 8, 6, 10, 10, sample); assert.equal(calls, 480)
})
