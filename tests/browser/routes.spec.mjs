import { test, expect } from './helpers/test.mjs'

const games=[['hard-vacuum','Hard Vacuum'],['bumper-ball','BUMPER BALL'],['no-exit','No Exit'],['final-approach','Final Approach'],['urban-fire','Urban Fire'],['sling-load','Sling Load'],['hello-world',null]]
for(const [path,title]of games) test(`${path}: direct route, compatibility redirect, rendering and exit`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  for(const prefix of ['', '/games']) {
    await page.goto(`${prefix}/${path}`)
    await expect(page).toHaveURL(new RegExp(`/${path}$`))
    if(title)await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible()
    else await expect(page.getByRole('button',{name:'Back',exact:true})).toBeVisible()
    await expect(page.locator('canvas')).toBeVisible()
    await page.evaluate(()=>new Promise(requestAnimationFrame))
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading',{name:'Select Game'})).toBeVisible()
    await expect(page.getByRole('button',{name:'Hard Vacuum',exact:true})).toBeFocused()
  }
  expect(errors).toEqual([])
})

test('selector loads no games and navigation restores keyboard focus',async({page})=>{
  const scripts=[];page.on('request',r=>{if(r.resourceType()==='script')scripts.push(r.url())})
  await page.goto('/')
  await expect(page.getByRole('button',{name:'Hard Vacuum',exact:true})).toBeFocused()
  expect(scripts.filter(url=>/Game-[^/]+\.js/.test(url))).toEqual([])
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter')
  await expect(page.getByRole('heading',{name:'BUMPER BALL',exact:true})).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('button',{name:'Bumper Ball',exact:true})).toBeFocused()
  await page.goForward()
  await expect(page.getByRole('heading',{name:'BUMPER BALL',exact:true})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button',{name:'Bumper Ball',exact:true})).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button',{name:'No Exit',exact:true})).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/no-exit$/)
})

test('a direct Hard Vacuum visit does not request unrelated game implementations',async({page})=>{
  const scripts=[];page.on('request',r=>{if(r.resourceType()==='script')scripts.push(r.url())})
  await page.goto('/hard-vacuum')
  await expect(page.getByRole('heading',{name:'Hard Vacuum',exact:true})).toBeVisible()
  expect(scripts.some(url=>/HardVacuumGame-[^/]+\.js/.test(url))).toBe(true)
  expect(scripts.filter(url=>/(HelloWorld|Kickball|FinalApproach|NoExit|SlingLoad|UrbanFire)Game-[^/]+\.js/.test(url))).toEqual([])
})

test('slow chunk loading is announced and failed chunks have working reload recovery',async({page})=>{
  let release
  const gate=new Promise(resolve=>{release=resolve})
  await page.route('**/assets/HardVacuumGame-*.js',async route=>{await gate;await route.abort('failed')})
  const navigation=page.goto('/hard-vacuum')
  await expect(page.getByRole('status')).toContainText('Loading game')
  await expect(page.getByRole('button',{name:'Back to game selector',exact:true})).toBeFocused()
  release();await navigation
  await expect(page.getByRole('alert')).toContainText('This game could not be loaded')
  await page.unroute('**/assets/HardVacuumGame-*.js')
  await page.getByRole('button',{name:'Reload game',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Hard Vacuum',exact:true})).toBeVisible()
})
