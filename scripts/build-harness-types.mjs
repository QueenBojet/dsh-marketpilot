// Compile the plugin's official dependency graph, using each owner's tsconfig.
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'

const repository = fileURLToPath(new URL('../../deepseek-harness/', import.meta.url))
const typeRoots = fileURLToPath(new URL('../node_modules/@types', import.meta.url))
const projects = []
const visited = new Set()
function visit(directory) {
  const configPath = join(directory, 'tsconfig.json')
  if (visited.has(configPath)) return
  visited.add(configPath)
  const result = ts.readConfigFile(configPath, ts.sys.readFile)
  if (result.error) throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, '\n'))
  for (const reference of result.config.references ?? []) visit(resolve(dirname(configPath), reference.path))
  projects.push(directory)
}
for (const project of ['packages/storage/storage-domain', 'packages/storage/storage-json',
  'packages/storage/storage-sqlite', 'packages/core/tools', 'packages/interaction/user-questions', 'packages/fs/fs-local',
  'packages/subagent/subagent', 'packages/web/web']) {
  visit(resolve(repository, project))
}

for (const project of projects) {
  const configPath = join(project, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, project, undefined, configPath)
  const builder = ts.createIncrementalProgram({ rootNames: parsed.fileNames, projectReferences: parsed.projectReferences,
    options: { ...parsed.options, typeRoots: [typeRoots], noEmitOnError: true,
      paths: { ...parsed.options.paths, 'js-yaml': [join(typeRoots, 'js-yaml/index.d.ts')],
        semver: [join(typeRoots, 'semver/index.d.ts')],
        commander: [resolve(typeRoots, '../commander/typings/index.d.ts')],
        esbuild: [resolve(typeRoots, '../esbuild/lib/main.d.ts')],
        '@babel/code-frame': [join(typeRoots, 'babel__code-frame/index.d.ts')],
        picomatch: [join(typeRoots, 'picomatch/index.d.ts')] },
      incremental: true, tsBuildInfoFile: join(project, 'lib/marketpilot.tsbuildinfo'),
    },
  })
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(builder.getProgram())]
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: name => name, getCurrentDirectory: () => repository, getNewLine: () => '\n',
    }))
    process.exit(1)
  }
  const emitted = builder.emit()
  if (emitted.emitSkipped) throw new Error(`Type emit failed: ${project}`)
}
console.log(`Built ${projects.length} Harness dependency projects.`)
