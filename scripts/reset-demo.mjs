import { access, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, basename, join, resolve } from 'node:path'

const base = resolve(fileURLToPath(new URL('../.marketpilot/', import.meta.url)))
const target = resolve(base, 'demo')
if (dirname(target) !== base || basename(target) !== 'demo') throw new Error('Unsafe demo reset target')
await access(join(target, '.marketpilot-demo'))
const backup = join(base, `demo-archive-${Date.now()}`)
await rename(target, backup)
console.log(`Demo data archived to ${backup}; fixture inputs preserved. Next demo creates a fresh store.`)
