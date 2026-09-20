import type { CircuitId, GateId } from './stationIds'
import type { BerthId } from './campaignWorld'
import { BERTHS, WARD_BANKS } from './campaignWorld.ts'
import { SOCKETS, CORE_POSITION } from './stationDefinitions.ts'
import { BOT_STATIONS } from './stationBots.ts'
import type { Vector2 } from './types'

export const CIRCUIT_STEPS: readonly { id: CircuitId; title: string; detail: string; region: BerthId; barriers: readonly GateId[] }[] = [
  { id:'breach-power',title:'Restore freight transit',detail:'Tow the rescue-locker cell to the receiver in the Breach.',region:'breach',barriers:[] },
  { id:'freight-power',title:'Open the Dispatch service route',detail:'Bring the Freight Stores cell to the gallery receiver. It opens the far end of the radioactive Stores tunnel and powers Haven’s berth, not the direct lift. Recover the radiation module before crossing.',region:'freight',barriers:[] },
  { id:'dispatch-power',title:'Open the shortcut and Works exit',detail:'Reach Dispatch through the radioactive tunnel from Stores. Supply its receiver from Cargo hold 6 to open the short lift back to Freight and the Works exit.',region:'freight',barriers:[] },
  { id:'works-power',title:'Wake the Works',detail:'Use the recovered blaster to breach the eastern tool crib and return its cell to the Works receiver. The bus supplies both Haven’s berth and security.',region:'works',barriers:["tool-door"] },
  { id:'ring-power',title:'Reach the Broken Ring',detail:'Blast open the capacitor store below the Works. Tow its cell to Maintenance control in the west. A teleporter module is also stored there; tow it to Haven to install.',region:'works',barriers:["store-door"] },
  { id:'foundry',title:'Reach the Foundry',detail:'Clear the western barrier in the Ring. A cell in the service hub powers the Foundry entrance from Wreckwater.',region:'ring',barriers:["rubble"] },
  { id:'relay',title:'Restore the ring relay',detail:'Tow the Foundry reserve back to the relay in the service hub.',region:'ring',barriers:[] },
  { id:'heart',title:'Restore reactor containment',detail:'Let radiation shielding recharge outside the field. Retrieve the eastern reactor cell and tow it south to the engine before the reserve runs out. Power opens the safe western return.',region:'ring',barriers:["blast"] },
  { id:'refuge-power',title:'Restore medical transfer',detail:'Tow the vault reserve to the receiver in Refuge Approach.',region:'refuge',barriers:[] },
  { id:'ward-power',title:'Reach the ward from behind',detail:'Let radiation shielding recharge outside the field. Tow the triage reserve through the irradiated service tunnel below Triage to the receiver inside the ward. Power it to open the safe return to Medical transfer.',region:'refuge',barriers:[] },
  { id:'heart-route',title:'Reach the ignition system',detail:'Bring a transfer-room cell to the ward’s eastern access receiver.',region:'refuge',barriers:[] },
  { id:'heart-power',title:'Restore the induction bus',detail:'Bring the ward service reserve to the Heart’s receiver. Haven can then move to the ignition berth.',region:'heart',barriers:[] },
  { id:'coil-power',title:'Ground the ignition field',detail:'Open Field control to the east. Deliver its cell to the lower induction gallery.',region:'heart',barriers:["field-door"] },
  { id:'ignition-power',title:'Release the ignition core',detail:'Bring the lower gallery’s reserve cell into the ignition well.',region:'heart',barriers:[] },
  ]

export type CircuitLoad = { circuit: CircuitId; target: string } & (
  | { kind: 'door'; gate: GateId }
  | { kind: 'core' | 'berth' | 'bot' | 'ward'; end: Vector2; exit: Vector2 }
)
/** Ordered guidance, not additional locks: players may solve accessible circuits out of order. */
export const CIRCUIT_PREREQUISITES = CIRCUIT_STEPS.map((step, index) => ({
  circuit: step.id, requires: index ? [CIRCUIT_STEPS[index - 1].id] : [],
}))
/** Every fixed consumer of a circuit, shared by validation and wire routing. */
export const CIRCUIT_LOADS: readonly CircuitLoad[] = SOCKETS.flatMap(socket => {
  const loads: CircuitLoad[] = socket.gates.map(gate => ({ circuit: socket.id, target: gate, kind: 'door', gate }))
  if (socket.flags?.includes('ignition-ready')) loads.push({circuit:socket.id,target:'ignition-ready',kind:'core',end:{x:CORE_POSITION.x-33,y:CORE_POSITION.y},exit:{x:CORE_POSITION.x-65,y:CORE_POSITION.y}})
  for(const berth of BERTHS) if(berth.power===socket.id) loads.push({circuit:socket.id,target:'berth:'+berth.id,kind:'berth',end:{x:berth.pos.x,y:berth.pos.y-145},exit:{x:berth.pos.x,y:berth.pos.y-177}})
  for(const bot of BOT_STATIONS) if(bot.power===socket.id) loads.push({circuit:socket.id,target:'bot:'+bot.id,kind:'bot',end:{x:bot.home.x-35,y:bot.home.y},exit:{x:bot.home.x-67,y:bot.home.y}})
  if(socket.id==='ward-power') WARD_BANKS.forEach((bank,i)=>loads.push({circuit:socket.id,target:'ward:'+i,kind:'ward',end:{x:bank.x,y:bank.y+bank.h/2},exit:{x:bank.x,y:bank.y+bank.h/2+32}}))
  return loads
})
