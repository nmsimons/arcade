import { parentPort, workerData } from 'node:worker_threads'
import { goldenScripts, loadGame, traceScript } from './jumping-golden.mjs'

const game = await loadGame(workerData.source)
const scripts = new Map(goldenScripts(game).map(entry => [entry.key, entry]))
parentPort.on('message', key => {
  try {
    const { url, script } = scripts.get(key)
    parentPort.postMessage({ key, result: traceScript(game, url, script, { kinds: workerData.kinds, cadence: workerData.cadence }) })
  } catch (error) { parentPort.postMessage({ key, error: error?.stack ?? String(error) }) }
})
