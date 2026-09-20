import type { RoomId, GateId, CircuitId, CacheId, ProgressionId } from './stationIds'
import type { Vector2 } from './types'

export const STATION_WIDTH = 9600
export const STATION_HEIGHT = 5100
const p = (x: number, y: number): Vector2 => ({ x, y })
const poly = (points: number[][]) => points.map(([x, y]) => p(x, y))
export const IGNITION_CRADLE = p(9100,3550)
export const IGNITION_CRADLE_ANGLE = -Math.PI/2
export const CORE_RETURN_ROUTE = [[6090,4490],[6400,4630],[7060,4630],[7620,4270],[8180,4270],[8180,3840]].map(([x,y])=>p(x,y))

// Bays follow the original excavation. Their dimensions come from the work
// performed there: a wide freight turn, narrow service galleries, refuge spurs.
const bays = [
  ['breach', 'The Breach', 8000, 3550, 1120, 820],
  ['rescue', 'Rescue locker', 7040, 3560, 480, 460],
  ['baggage', 'Ignition Cradle', 9080, 3550, 440, 440],
  ['freight', 'Freight Galleries', 8000, 1250, 1040, 700],
  ['stores', 'Freight stores', 7010, 1160, 680, 640],
  ['dispatch', 'Dispatch', 8000, 410, 860, 540],
  ['manifest', 'Cargo hold 6', 8840, 530, 580, 480],
  ['works', 'The Works', 4900, 1180, 1060, 720],
  ['service', 'Tool crib', 5910, 650, 600, 500],
  ['workshop', 'Maintenance control', 3970, 1120, 680, 640],
  ['capacitors', 'Capacitor store', 4900, 1880, 780, 510],
  ['refuge-entry', 'Refuge Approach', 1500, 2740, 860, 600],
  ['refuge', 'Medical transfer', 1500, 3590, 1020, 740],
  ['infirmary', 'Triage', 530, 3510, 640, 650],
  ['transfer', 'Suspension ward', 2530, 3530, 700, 680],
  ['heart-hub', 'The Heart', 4100, 3540, 1000, 780],
  ['heart-control', 'Field control', 5320, 3480, 760, 640],
  ['heart-coils', 'Induction gallery', 4100, 4430, 1000, 580],
  ['ignition', 'Ignition well', 5750, 4400, 900, 720],
] as const
export const CAMPAIGN_SECTORS = bays.map(([id, name, x, y, w, h]) => ({ id, name, x: x - w / 2, y: y - h / 2, w, h, color: id.startsWith('heart') || id === 'ignition' ? '#ffc977' : id === 'refuge' || id === 'transfer' ? '#b8a0ff' : '#8cbdac', subtitle: '' }))
const fractures = [
  [[-.49,-.19],[-.35,-.45],[-.12,-.5],[.10,-.45],[.31,-.49],[.48,-.28],[.5,.03],[.43,.29],[.21,.48],[-.04,.5],[-.3,.40],[-.48,.17]],
  [[-.5,-.12],[-.42,-.36],[-.2,-.50],[0,-.45],[.23,-.40],[.47,-.2],[.50,.10],[.36,.40],[.12,.49],[-.19,.5],[-.4,.27],[-.49,.1]],
  [[-.5,-.15],[-.30,-.45],[-.08,-.39],[.18,-.5],[.42,-.32],[.5,-.05],[.42,.24],[.29,.46],[.08,.39],[-.12,.5],[-.38,.35],[-.46,.08]],
  [[-.5,-.21],[-.35,-.28],[-.23,-.46],[.13,-.5],[.35,-.35],[.48,-.14],[.46,.12],[.35,.23],[.24,.49],[-.13,.47],[-.33,.27],[-.5,.20]],
]
export const CAMPAIGN_CHAMBERS = Object.fromEntries(bays.map(([id, , x, y, w, h], i) => [id, poly(fractures[i % fractures.length].map(([a,b]) => [x + a * w, y + b * h]))]))

// A bent passage is the union of its swept segments. Gate sections are always
// exactly 200 wide; they close the actual tunnel, not an invisible room edge.
const corridor = (rooms: RoomId[], points: number[][], gate?: GateId) => points.slice(1).map((end, i) => {
  const start = points[i], dx = end[0] - start[0], dy = end[1] - start[1], len = Math.hypot(dx, dy)
  const nx = -dy / len * 100, ny = dx / len * 100
  // A small longitudinal overlap seals angled joins without square props.
  const ex = dx / len * 45, ey = dy / len * 45
  return { rooms, gate, centerline: [p(start[0],start[1]),p(end[0],end[1])], shape: poly([[start[0]-ex+nx,start[1]-ey+ny],[end[0]+ex+nx,end[1]+ey+ny],[end[0]+ex-nx,end[1]+ey-ny],[start[0]-ex-nx,start[1]-ey-ny]]) }
})
export const CAMPAIGN_PASSAGES = [
  ...corridor(['breach','rescue'], [[7600,3550],[7300,3620],[7200,3560]]),
  ...corridor(['breach','baggage'], [[8390,3550],[8980,3550]], 'baggage-door'),
  ...corridor(['breach','freight'], [[8000,3270],[8000,2600],[8180,2300],[8180,1900],[8000,1650],[8000,1450]], 'breach-link'),
  ...corridor(['freight','stores'], [[7660,1220],[7400,1160],[7220,1160]]),
  ...corridor(['freight','dispatch'], [[8000,1020],[8000,610]], 'freight-lift'),
  ...corridor(['dispatch','manifest'], [[8240,440],[8610,530]]),
  ...corridor(['stores','dispatch'], [[7010,970],[7010,500],[7260,410],[7750,410]], 'freight-return'),
  ...corridor(['stores','works'], [[6800,1150],[6100,1150],[5870,1330],[5570,1310],[5300,1150]], 'freight-link'),
  ...corridor(['works','service'], [[5200,1000],[5400,650],[5700,650]], 'tool-door'),
  ...corridor(['works','workshop'], [[4570,1150],[4200,1150]], 'works-bus'),
  ...corridor(['works','capacitors'], [[4900,1430],[4900,1700]], 'store-door'),
  ...corridor(['workshop','haven'], [[3970,900],[3970,660],[2800,660],[2560,580],[2310,660],[2150,660],[1800,880]], 'ring-link'),
  ...corridor(['vault','refuge-entry'], [[1500,1870],[1500,2530]], 'refuge-link'),
  ...corridor(['refuge-entry','refuge'], [[1500,2940],[1500,3370]], 'refuge-air'),
  ...corridor(['refuge','infirmary'], [[1130,3540],[900,3510],[750,3510]]),
  ...corridor(['refuge','transfer'], [[1850,3500],[2300,3500]], 'ward-link'),
  ...corridor(['infirmary','transfer'], [[530,3700],[700,4090],[2300,4090],[2530,3770]], 'medical-return'),
  ...corridor(['transfer','heart-hub'], [[2770,3500],[3300,3500],[3500,3360],[3780,3500]], 'heart-link'),
  ...corridor(['heart-hub','heart-control'], [[4440,3500],[5050,3500]], 'field-door'),
  ...corridor(['heart-hub','heart-coils'], [[4100,3800],[4100,4210]], 'coil-link'),
  ...corridor(['heart-coils','ignition'], [[4450,4350],[5430,4350]], 'well-link'),
  ...corridor(['heart-control','ignition'], [[5320,3650],[5750,3800],[5750,4160]], 'heart-return'),
  ...corridor(['ignition','breach'], CORE_RETURN_ROUTE.map(p=>[p.x,p.y]), 'breach-return'),
]
const gate = (id: GateId, x: number, y: number, vertical = false, blast = false) => ({ id, kind: blast ? 'blast' : 'socket', label: blast ? 'SEALED BULKHEAD' : 'POWER OFF', x, y, w: vertical ? 30 : 200, h: vertical ? 200 : 30, color: blast ? '#ff665e' : '#65baff' })
export const CAMPAIGN_GATES = [
  gate('breach-link',7900,2780), gate('baggage-door',8700,3450,true,true),
  gate('freight-lift',7900,790), gate('freight-link',6410,1050,true),
  gate('tool-door',5510,550,true,true), gate('works-bus',4340,1050,true), gate('store-door',4800,1550,false,true),
  gate('ring-link',3100,560,true), gate('refuge-link',1400,2210), gate('refuge-air',1400,3130),
  gate('ward-link',2010,3400,true), gate('heart-link',3110,3400,true),
  gate('field-door',4710,3400,true,true), gate('coil-link',4000,3980), gate('well-link',4820,4250,true),
  gate('freight-return',7410,310,true), gate('medical-return',1690,3990,true), gate('heart-return',5650,3900),
  gate('breach-return',8080,4000),
]
const socket = (id: CircuitId, label: string, x: number, y: number, sx: number, sy: number, gates: GateId[], flags: ProgressionId[] = []) => ({ id, label, pos: p(x,y), source: p(sx,sy), gates, flags })
export const CAMPAIGN_SOCKETS = [
  socket('breach-power','FREIGHT TRANSIT',8150,3310,7040,3460,['breach-link']),
  // Enter Dispatch through the irradiated Stores tube first. Its own receiver
  // unlocks the short lift home and the onward Works route from the far side.
  socket('freight-power','DISPATCH SERVICE ACCESS / BERTH',8100,1080,7020,1080,['freight-return']),
  socket('dispatch-power','FREIGHT LIFT / WORKS EXIT',7870,420,8860,470,['freight-lift','freight-link']),
  socket('works-power','MAINTENANCE BUS',4730,1000,5900,600,['works-bus']),
  socket('ring-power','RING DISTRIBUTION',3990,1300,5000,1840,['ring-link']),
  socket('refuge-power','MEDICAL TRANSFER / SERVICE ACCESS',1640,2760,1300,1820,['refuge-air','medical-return']),
  // The isolation door is controlled from inside the ward. Reach its receiver
  // through the irradiated service tube, then reopen the short route to Haven.
  socket('ward-power','WARD BUS / TRANSFER RETURN',2350,3640,510,3430,['ward-link']),
  socket('heart-route','IGNITION ACCESS',2590,3310,1430,3770,['heart-link']),
  socket('heart-power','INDUCTION / SERVICE BERTH',4260,3320,2520,3690,['coil-link']),
  socket('coil-power','IGNITION WELL / FIELD RETURN',4140,4320,5320,3370,['well-link','heart-return']),
  socket('ignition-power','CORE RELEASE / BREACH RETURN',5590,4480,3930,4540,['breach-return'],['ignition-ready']),
]
export const CAMPAIGN_CACHES: readonly { id: CacheId; pos: Vector2; value: number; sector: RoomId }[] = [
  { id:'rescue-cache',pos:p(6950,3610),value:250,sector:'rescue' },
  { id:'baggage-cache',pos:p(9050,3410),value:1500,sector:'baggage' },
  { id:'manifest-cache',pos:p(8970,600),value:1800,sector:'manifest' },
  { id:'tools-cache',pos:p(6030,700),value:2200,sector:'service' },
  { id:'store-cache',pos:p(4750,1920),value:2500,sector:'capacitors' },
  { id:'triage-cache',pos:p(420,3630),value:3000,sector:'infirmary' },
  { id:'ward-cache',pos:p(2670,3620),value:3500,sector:'transfer' },
  { id:'field-cache',pos:p(5480,3580),value:4000,sector:'heart-control' },
  { id:'medical-cache',pos:p(1910,4080),value:4000,sector:'refuge' },
]
export const IGNITION_POSITION = p(5930,4370)
// Four medical banks, 78 suspension circuits each. They are solid equipment,
// with telemetry connected to the ward bus, not scenery scattered in space.
export const WARD_BANKS = [2380,2490,2600,2710].map(x => ({ x,y:3410,w:60,h:48 }))
export const REGIONS = [
  { id:'breach',name:'The Breach',rooms:['breach','rescue','baggage'],bounds:[6700,3000,2750,1200] },
  { id:'freight',name:'Freight Galleries',rooms:['freight','stores','dispatch','manifest'],bounds:[6300,70,3100,1700] },
  { id:'works',name:'The Works',rooms:['works','service','workshop','capacitors'],bounds:[3200,200,3100,2100] },
  { id:'ring',name:'The Broken Ring',rooms:['haven','salvage','foundry','archive','reactor','engine','vault'],bounds:[80,80,2850,2130] },
  { id:'refuge',name:'Refuge Approach',rooms:['refuge-entry','refuge','infirmary','transfer'],bounds:[80,2300,2950,1950] },
  { id:'heart',name:'The Heart',rooms:['heart-hub','heart-control','heart-coils','ignition'],bounds:[3200,3000,3100,1950] },
] as const
export const BERTHS = [
  { id:'breach',name:'Breach anchorage',pos:p(8000,3560),room:'breach',power:undefined },
  { id:'freight',name:'Freight turn',pos:p(8010,1350),room:'freight',power:'freight-power' },
  { id:'works',name:'Maintenance berth',pos:p(4910,1240),room:'works',power:'works-power' },
  { id:'ring',name:'Ring service hub',pos:p(1500,1100),room:'haven',power:'relay' },
  { id:'refuge',name:'Medical transfer berth',pos:p(1490,3600),room:'refuge',power:'refuge-power' },
  { id:'heart',name:'Ignition service berth',pos:p(4100,3570),room:'heart-hub',power:'heart-power' },
] as const
export type BerthId = typeof BERTHS[number]['id']
export const SERVICE_ROUTES = [
  { from:'breach',to:'freight',gates:['breach-link'],points:[p(8000,3560),p(7980,3400),p(7980,3230),p(8000,3090),p(8000,2600),p(8180,2300),p(8180,1900),p(8000,1650),p(8010,1350)] },
  { from:'freight',to:'works',gates:['freight-link'],points:[p(8010,1350),p(7700,1250),p(7300,1160),p(7100,1190),p(6930,1190),p(6800,1150),p(6100,1150),p(5870,1330),p(5570,1310),p(5300,1150),p(4910,1150),p(4910,1240)] },
  { from:'works',to:'ring',gates:['works-bus','ring-link'],points:[p(4910,1240),p(4610,1150),p(3970,1150),p(3970,730),p(3900,660),p(2800,660),p(2560,580),p(2310,660),p(2150,660),p(1800,880),p(1755,910),p(1755,955),p(1745,985),p(1710,1015),p(1630,1040),p(1500,1100)] },
  { from:'ring',to:'refuge',gates:['blast','refuge-link','refuge-air'],points:[p(1500,1100),p(1500,1770),p(1500,2450),p(1480,2650),p(1480,2870),p(1500,3300),p(1490,3600)] },
  { from:'refuge',to:'heart',gates:['ward-link','heart-link'],points:[p(1490,3600),p(1870,3500),p(2270,3520),p(2800,3520),p(2850,3500),p(3300,3500),p(3500,3360),p(3780,3500),p(4100,3570)] },
] as const
