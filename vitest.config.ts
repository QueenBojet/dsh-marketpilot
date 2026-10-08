import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import ts from 'typescript'

const source = new URL('../deepseek-harness/tsconfig.base.json', import.meta.url)
const config = ts.readConfigFile(fileURLToPath(source), ts.sys.readFile).config as {
  compilerOptions: { paths: Record<string, string[]> }
}

export default defineConfig({
  plugins: [{
    name: 'harness-standard-decorators', enforce: 'pre',
    transform(code, id) {
      if (!/\.[cm]?tsx?$/.test(id) || !/^\s*@[A-Za-z_$][\w$]*/m.test(code)) return
      const result = ts.transpileModule(code, { fileName: id, compilerOptions: {
        target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, sourceMap: true,
      } })
      return { code: result.outputText, map: result.sourceMapText ?? null }
    },
  }],
  resolve: {
    alias: Object.entries(config.compilerOptions.paths).filter(([name]) => !name.includes('*')).map(([name, paths]) => ({
      find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      replacement: fileURLToPath(new URL(paths[0]!, source)),
    })),
  },
  test: { include: ['tests/**/*.spec.ts'], environment: 'node' },
})
