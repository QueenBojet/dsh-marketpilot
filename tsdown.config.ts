import { defineConfig } from 'tsdown'

/**
 * Browser half of the MarketPilot plugin: one CJS closure-factory artifact at
 * client/client.js following the DSH client-module contract — the bundle calls
 * window.__ModuleLoader__.load({ id, factory }) and resolves the platform
 * baseline (react, cordis client services) through the injected require.
 */
const ID = 'dsh-marketpilot'

export default defineConfig([{
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'client',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: false,
  clean: false,
  deps: {
    neverBundle: specifier => specifier === 'react' || specifier.startsWith('react/') || specifier.startsWith('@deepseek-ai/'),
    alwaysBundle: () => false,
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
}])
