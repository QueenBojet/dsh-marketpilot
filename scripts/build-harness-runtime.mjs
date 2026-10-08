// Build only runtime imports needed by the keyless demo, using official sources and package export paths.
import { build } from 'esbuild'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, join, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const repository = fileURLToPath(new URL('../../deepseek-harness/', import.meta.url))
const config = ts.readConfigFile(join(repository, 'tsconfig.base.json'), ts.sys.readFile).config
const visited = new Set()
const imports = {}
async function compile(name) {
  if (visited.has(name)) return
  visited.add(name)
  const source = config.compilerOptions.paths[name]?.[0]
  if (!source) throw new Error(`No official source mapping for ${name}`)
  const entry = resolve(repository, source)
  let directory = dirname(entry)
  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Package not found for ${name}`)
    directory = parent
  }
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const key = name === manifest.name ? '.' : `.${name.slice(manifest.name.length)}`
  const exported = manifest.exports?.[key]
  const target = typeof exported === 'string' ? exported : exported?.import ?? exported?.default ?? (key === '.' ? manifest.main : undefined)
  if (!target || !/\.[cm]?js$/.test(target)) throw new Error(`No runtime export for ${name}`)
  const outfile = resolve(directory, target)
  imports[name] = pathToFileURL(outfile).href
  if (!outfile.startsWith(join(directory, 'lib') + '\\') && !outfile.startsWith(join(directory, 'lib') + '/')) throw new Error(`Refuse source overwrite: ${outfile}`)
  const result = await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external',
    platform: 'node', format: 'esm', target: 'node24', metafile: true, logLevel: 'warning',
    plugins: [{ name: 'preserve-shared-package-instances', setup(build) {
      build.onResolve({ filter: /^[^./]/ }, args => args.kind === 'entry-point' || isAbsolute(args.path)
        ? undefined : { path: args.path, external: true })
    } }],
  })
  for (const output of Object.values(result.metafile.outputs)) for (const imported of output.imports) {
    if (imported.external && imported.path.startsWith('@deepseek-ai/')) await compile(imported.path)
  }
}
for (const name of ['@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/cordis-plugin-include', '@deepseek-ai/dsh-storage-domain', '@deepseek-ai/dsh-storage-json',
  '@deepseek-ai/dsh-storage-sqlite', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-user-questions', '@deepseek-ai/dsh-fs-local']) await compile(name)
const output = fileURLToPath(new URL('../.marketpilot/runtime-imports.json', import.meta.url))
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(imports, null, 2) + '\n')
console.log(`Built ${visited.size} official runtime exports; upstream source files unchanged.`)
