import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { applyEntryPatches, entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'
import Storage from '@deepseek-ai/dsh-storage'
import * as Domain from '@deepseek-ai/dsh-storage-domain'
import * as Sqlite from '@deepseek-ai/dsh-storage-sqlite'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { offlineModel } from '../fixtures/calm/offline-model.ts'
import { runCalmScenario } from '../fixtures/calm/scenario.ts'

const automatic = process.argv.includes('--test-human')
if (process.argv.slice(2).some(arg => arg !== '--test-human')) throw new Error('Usage: pnpm marketpilot:demo [--test-human]')
const directory = fileURLToPath(new URL('../.marketpilot/demo/', import.meta.url))
await mkdir(directory, { recursive: true })
await writeFile(join(directory, '.marketpilot-demo'), 'MarketPilot generated demo data\n')
const output = join(directory, new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID().slice(0, 8))
await mkdir(output)
const root = new Context()
const reader = automatic ? undefined : createInterface({ input: stdin, output: stdout })
try {
  await root.plugin(Storage)
  await root.plugin(Sqlite, { path: join(directory, 'marketpilot.db') })
  await root.plugin(Domain, { backend: 'sqlite' })
  await root.plugin(SystemPrompt)
  await root.plugin(Tools)
  await root.plugin(UserQuestions)
  await root.plugin(LocalFs, { cwd: fileURLToPath(new URL('../', import.meta.url)) })
  root.provide('marketpilotModel', offlineModel)
  root.on('user-questions/request', async request => {
    console.log('\n[Human Gate]', automatic ? request.questions.map(q => q.question).join('；') : JSON.stringify(request.questions, null, 2))
    const answer = automatic ? '确认' : await reader.question('输入“确认”继续，其他输入退回：')
    if (automatic) console.log('[TEST ONLY] 使用模拟人工确认；这不是生产授权。')
    return { answers: [{ id: 'marketpilot-review', selected: [answer === '确认' ? '确认' : '退回修改'] }] }
  })
  await root.plugin(Loader, { baseUrl: new URL('../package.json', import.meta.url).href })
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const patch = load(await readFile(new URL('../' + manifest.dsh.bundle.patch, import.meta.url), 'utf8'), { schema: entryListSchema })
  const entries = applyEntryPatches([], patch, message => { throw new Error(message) })
  for (const entry of entries) await root.loader.create(entry)
  await root.loader.await()
  if (!root.get('marketpilot')) throw new Error('MarketPilot Loader activation failed')
  console.log('MarketPilot loaded via official Cordis Loader; SQLite + guarded Tools; OFFLINE MODEL FIXTURE.')
  const call = async (name, args) => {
    const result = await root.tools.execute({ callId: ToolCallId(randomUUID()), name, arguments: args, signal: new AbortController().signal })
    if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`)
    console.log(`[ok] ${name}`)
  }
  const result = await runCalmScenario(root.marketpilot.services, call,
    fileURLToPath(new URL('../fixtures/calm/input/', import.meta.url)), output)
  const report = { mode: 'offline-model', human: automatic ? 'simulated-test-only' : 'interactive', ...result, output }
  await writeFile(join(output, 'Run Summary.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  // Validate that the human-reviewed export exists before reporting success.
  await readFile(join(output, 'Compliance Matrix.md'), 'utf8')
} finally {
  reader?.close()
  await root.fiber.dispose()
}
