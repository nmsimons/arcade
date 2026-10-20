import { allSelections } from './editor.ts'
import { copyableSelection } from './editorSelection.ts'
import type { EditorClipboard } from './editorSelection.ts'
import { copyLevel, parseLevel } from './level.ts'
import { MAX_LEVEL_BYTES, textBytes } from './levelLimits.ts'

const FORMAT = 'lab-editor-objects'
const STORAGE_KEY = 'jumping:editor-clipboard'
export const MAX_CLIPBOARD_BYTES = MAX_LEVEL_BYTES * 2
let remembered = ''

function checkSize(text: string) {
  if (text.length > MAX_CLIPBOARD_BYTES || textBytes(text) > MAX_CLIPBOARD_BYTES) {
    throw new Error('The copied objects exceed the clipboard size limit.')
  }
}

/** Keep the source snapshot so existing attachment and same-level wiring rules apply. */
export function encodeEditorClipboard(clipboard: EditorClipboard): string {
  const level = copyLevel(clipboard.level)
  // Rope rests are derived, potentially unfinished previews, never clipboard data.
  for (const rope of level.climbables.ropes) delete rope.rest
  const text = JSON.stringify({ format: FORMAT, version: 1, level, selections: clipboard.selections })
  checkSize(text)
  return text
}

/** Clipboard text is external input; validate it before it can reach an editor draft. */
export function decodeEditorClipboard(text: string): EditorClipboard | null {
  checkSize(text)
  let data: unknown
  try { data = JSON.parse(text) } catch { return null }
  if (!data || typeof data !== 'object' || !('format' in data) || data.format !== FORMAT) return null
  if (!('version' in data) || data.version !== 1) throw new Error('These clipboard objects use an unsupported version.')
  if (!('level' in data) || !('selections' in data) || !Array.isArray(data.selections)
    || !data.selections.length || data.selections.length > 1000) throw new Error('The clipboard contains invalid level objects.')
  const level = parseLevel(data.level)
  const available = new Map(allSelections(level).filter(copyableSelection).map(s => [`${s.kind}:${s.index}`, s]))
  const selections = data.selections.map((value: unknown) => {
    if (!value || typeof value !== 'object' || !('kind' in value) || !('index' in value)
      || typeof value.kind !== 'string' || !Number.isInteger(value.index)) throw new Error('The clipboard contains an invalid selection.')
    const selection = available.get(`${value.kind}:${value.index}`)
    if (!selection) throw new Error('The clipboard contains an invalid selection.')
    return selection
  })
  if (new Set(selections).size !== selections.length) throw new Error('The clipboard contains repeated selections.')
  return { level, selections }
}

/** The in-app fallback survives editor remounts and reloads without clipboard permission. */
export function readEditorClipboard(): string {
  if (remembered) return remembered
  try {
    const text = sessionStorage.getItem(STORAGE_KEY) ?? ''
    checkSize(text); remembered = text
  } catch { /* A private or storage-restricted window still has the memory fallback. */ }
  return remembered
}

export function rememberEditorClipboard(text: string) {
  checkSize(text); remembered = text
  try { sessionStorage.setItem(STORAGE_KEY, text) } catch { /* Keep the in-memory copy. */ }
}
