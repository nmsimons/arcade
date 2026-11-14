// Scans golden routes for pose flickers on a worker thread (jumping-flicker.mjs).
import { parentPort, workerData } from 'node:worker_threads'
import { goldenScripts, loadGame } from './jumping-golden.mjs'
import { scanScript } from './jumping-flicker.mjs'

const game = await loadGame(workerData.source)
const scripts = new Map(goldenScripts(game).map(entry => [entry.key, entry]))
parentPort.on('message', key => {
  try {
    const { url, script } = scripts.get(key)
    parentPort.postMessage({ key, result: scanScript(game, url, script, workerData.thresholds) })
  } catch (error) { parentPort.postMessage({ key, error: error?.stack ?? String(error) }) }
})
