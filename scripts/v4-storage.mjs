#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { convertStorage, validateBundle, DowngradeError } from '../lib/storage/downgrade.js'

try {
  const { values } = parseArgs({ options: {
    mode: { type: 'string' }, source: { type: 'string' }, output: { type: 'string' },
    bundle: { type: 'string' }, 'dry-run': { type: 'boolean', default: false },
  } })
  if (values.mode === 'validate' && values.bundle) {
    const { manifest } = await validateBundle(values.bundle)
    console.log(JSON.stringify({ valid: true, manifest }, null, 2))
  } else {
    if (!['downgrade', 'restore'].includes(values.mode) || !values.source || !values.output) {
      throw new DowngradeError('USAGE', 'Use --mode downgrade|restore --source <marketpilot.json copy> --output <new directory> [--bundle <downgrade directory>] [--dry-run]; or --mode validate --bundle <directory>.')
    }
    console.log(JSON.stringify(await convertStorage({ mode: values.mode, source: values.source, output: values.output,
      ...(values.bundle ? { bundle: values.bundle } : {}), dryRun: values['dry-run'] }), null, 2))
  }
} catch (error) {
  // Do not print untrusted project values, stack traces or credential-bearing config.
  const code = error instanceof DowngradeError ? error.code : 'IO_OR_ARGUMENT_ERROR'
  console.error(JSON.stringify({ ok: false, code, message: error instanceof DowngradeError ? error.message : 'Operation failed; check arguments and file access. No source data was overwritten.' }))
  process.exitCode = code === 'USAGE' ? 2 : 1
}
