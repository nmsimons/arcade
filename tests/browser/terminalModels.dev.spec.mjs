import { test, expect } from './helpers/test.mjs'

test('all eight recorders share one model without control hints at every flight scale',async({page},info)=>{
  await page.goto('/')
  const result=await page.evaluate(async()=>{
    const [{drawTerminals},{TERMINALS},{freshTraining},{freshExpedition}]=await Promise.all([
      import('/src/games/hardVacuum/terminalRender.ts'),import('/src/games/hardVacuum/terminals.ts'),
      import('/src/games/hardVacuum/training.ts'),import('/src/games/hardVacuum/expedition.ts'),
    ])
    const terminals=[...TERMINALS,freshTraining().terminal],state=freshExpedition()
    state.power['heart-power']='heart-power'
    const sheet=document.createElement('canvas');sheet.width=1280;sheet.height=720
    document.body.replaceChildren(sheet);document.body.style.margin='0'
    const ctx=sheet.getContext('2d');ctx.fillStyle='#040b0c';ctx.fillRect(0,0,sheet.width,sheet.height)
    const differences=[]
    for(const [row,mode] of ['unread','downloaded','connected'].entries()) {
      state.campaign.records=mode==='unread' ? [] : terminals.map(t=>t.terminalId)
      for(const zoom of [.58,1,2]) {
        let reference
        for(const [col,terminal] of terminals.entries()) {
          const tile=document.createElement('canvas');tile.width=320;tile.height=320
          const ink=tile.getContext('2d');ink.translate(160,130);ink.scale(zoom,zoom)
          const words=[],original=ink.fillText.bind(ink)
          ink.fillText=(text,...args)=>{words.push(text);original(text,...args)}
          drawTerminals(ink,state,{elapsed:1,connectedTerminal:mode==='connected' ? terminal.terminalId : undefined},{pos:{x:70,y:0}},[{...terminal,pos:{x:0,y:0}}])
          const pixels=ink.getImageData(0,0,320,320).data
          if(reference && pixels.some((value,index)=>value!==reference[index]))differences.push({mode,zoom,id:terminal.terminalId})
          reference??=pixels
          if(words.length!==1 || words[0]!=='LOG')differences.push({mode,id:terminal.terminalId,words})
          if(zoom===2) {
            ctx.drawImage(tile,col*160,row*240,160,160)
            ctx.fillStyle='#a0b5b0';ctx.font='11px monospace';ctx.textAlign='center'
            ctx.fillText(terminal.terminalId,col*160+80,row*240+190)
            ctx.fillText(mode,col*160+80,row*240+212)
          }
        }
      }
    }
    return {count:terminals.length,differences}
  })
  expect(result).toEqual({count:8,differences:[]})
  await page.screenshot({path:info.outputPath('shared-recorder-models.png')})
})
