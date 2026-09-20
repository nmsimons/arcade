import { test, expect } from './helpers/test.mjs'
import { setup, tap, saved, armed } from './helpers/controller.mjs'
import { advanceSimulation } from './helpers/simulation.mjs'

test('batched browser waits preserve elapsed gameplay without rendering every physics tick',async({page})=>{
  await setup(page,armed());await tap(page,0);await tap(page,9)
  const before=(await saved(page)).campaign.playedSeconds
  await page.keyboard.press('p')
  await page.evaluate(()=>{
    window.simulationFrames=0
    const count=()=>{window.simulationFrames++;requestAnimationFrame(count)}
    requestAnimationFrame(count)
  })
  await advanceSimulation(page,2000)
  await page.keyboard.press('p')
  const elapsed=(await saved(page)).campaign.playedSeconds-before
  expect(Math.abs(elapsed-2)).toBeLessThan(1/60+1e-6)
  const frames=await page.evaluate(()=>window.simulationFrames)
  expect(frames).toBeGreaterThanOrEqual(20)
  expect(frames).toBeLessThanOrEqual(22)
})
