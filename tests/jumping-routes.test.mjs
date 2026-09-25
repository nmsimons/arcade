import test from 'node:test'
import assert from 'node:assert/strict'
import { jumpingRoute, levelPath, JUMPING_MENU, JUMPING_BUILDER, JUMPING_PLAYTEST } from '../src/games/jumping/routes.ts'

test('level links preserve filenames with spaces, Unicode, percent, query and hash characters', () => {
  for (const source of ['built-in', 'local']) for (const edit of [true, false]) {
    const fileName = '03-café #1? 100%.json'
    assert.deepEqual(jumpingRoute(levelPath(source, fileName, edit)), edit
      ? { screen: 'builder', file: { source, fileName } } : { screen: 'level', source, fileName })
  }
})

test('menu, draft builder and session playtest have distinct routes', () => {
  assert.deepEqual(jumpingRoute(JUMPING_MENU + '/'), { screen: 'menu' })
  assert.deepEqual(jumpingRoute(JUMPING_BUILDER), { screen: 'builder' })
  assert.deepEqual(jumpingRoute(JUMPING_PLAYTEST), { screen: 'playtest' })
})

test('malformed and nested file links cannot resolve to another file', () => {
  for (const tail of ['levels/local/%ZZ.json', 'levels/local/a%2Fb.json', 'levels/local/a%5Cb.json', 'levels/remote/a.json', 'builder/local', 'levels/local/a.json/extra'])
    assert.deepEqual(jumpingRoute(`${JUMPING_MENU}/${tail}`), { screen: 'missing' })
})
