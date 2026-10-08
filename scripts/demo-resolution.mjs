// Development-only peer resolution for the filtered checkout; production dsh owns its own resolver.
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
const imports = JSON.parse(readFileSync(new URL('../.marketpilot/runtime-imports.json', import.meta.url), 'utf8'))
registerHooks({ resolve(specifier, context, nextResolve) {
  return imports[specifier] ? { url: imports[specifier], shortCircuit: true } : nextResolve(specifier, context)
} })
