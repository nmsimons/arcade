import {blankTrial} from '../../src/games/jumping/level.ts'
import {NEUTRAL_INPUT} from '../../src/games/jumping/model.ts'
import {keyboardMovement} from '../../src/games/jumping/input.ts'

/** Isolated valid contact encounters; no authored map or medal is changed. */
export function downhillBallLevel(size=100,direction=1,slope=.3) {
  const x=4000,y=3000,grade=slope*direction
  const surface=at=>y+grade*(at-x)
  const spawnX=x-direction*(size/2+25.5)
  return {...blankTrial(),version:2,name:`Downhill ${size} ball`,width:8000,height:6000,floor:6000,
    spawn:{x:spawnX,y:surface(spawnX)},goal:{x:7820,y:6000},
    platforms:[{x:200,y:0,w:7600,h:6000,profile:[[0,surface(200)],[7600,surface(7800)]]}],
    props:[{kind:'ball',x,y,size}],lighting:{nightMode:false,ambient:0,lights:[]}}
}

export function downhillBallInput(mode,direction) {
  const keys=new Set([direction>0?'KeyD':'KeyA',...(mode==='walk'?['ShiftLeft']:[])])
  return {...NEUTRAL_INPUT,move:keyboardMovement(keys),
    ...(mode==='crouch'?{drop:true,descend:true,crouch:true}:{})}
}
