import { CITY } from './cityPlan.ts'
import type { CollisionMaterial, Wall } from './types'
import { isSolidProp, isMovableProp } from './cityLifePlan.ts'

export function createStaticCityWalls(): Wall[] {
  const shape=({x,y,width,height}:Wall,impactMaterial:CollisionMaterial):Wall=>({x,y,width,height,impactMaterial})
  return [
    ...[...CITY.buildings,...CITY.ruins.flatMap(ruin=>[...ruin.walls,...ruin.roofRemnants]),...CITY.closures,...CITY.edgeBuildings,...CITY.edgeRubble]
      .map(wall=>shape(wall,'masonry')),
    ...CITY.props.filter(p=>isSolidProp(p)&&!isMovableProp(p)).map(prop=>shape(prop,
      prop.kind==='tent'||prop.kind==='sandbags'?'soft':prop.kind==='tree'||prop.kind==='bench'||prop.kind==='supplies'?'wood':'metal')),
  ]
}

/** Authored starting cover for layout validation. Runtime cars own their poses. */
export function createCityWalls(): Wall[] {
  return [...createStaticCityWalls(),...CITY.props.filter(isMovableProp).map(({x,y,width,height}):Wall=>({x,y,width,height,impactMaterial:'metal'}))]
}
