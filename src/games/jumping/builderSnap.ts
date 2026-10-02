import type { Selection, Tool } from './editor.ts'
import { LEVEL_GRID_SIZE } from './level.ts'

export const ITEM_GRID_SIZE = 5

export const selectionGridSize = (selection: Selection) => selection.kind === 'platform' ? LEVEL_GRID_SIZE : ITEM_GRID_SIZE

export const toolGridSize = (tool: Tool) => ['node', 'platform', 'steps-narrow', 'steps-wide', 'pillar', 'ramp', 'rough', 'pit'].includes(tool)
  ? LEVEL_GRID_SIZE : ITEM_GRID_SIZE
