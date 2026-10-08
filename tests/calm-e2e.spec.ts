import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as Plugin from '../src/harness/plugin.ts'
import { setup, addCleanup } from './helpers.ts'
import { offlineModel } from '../fixtures/calm/offline-model.ts'
import { runCalmScenario } from '../fixtures/calm/scenario.ts'

it('repeats the CALM Golden Case through guarded Tools with isolated projects and persisted results', async () => {
  const storage = await setup()
  await storage.repository.close()
  const { root } = storage
  await root.plugin(SystemPrompt)
  await root.plugin(Tools)
  await root.plugin(UserQuestions)
  await root.plugin(LocalFs)
  root.provide('marketpilotModel', offlineModel)
  root.on('user-questions/request', async () => ({ answers: [{ id: 'marketpilot-review', selected: ['确认'] }] }))
  const config = new Plugin.Config({ maxDocumentBytes: 2097152, structuredProvider: 'spawn', modelTimeoutMs: 120000 })
  const plugin = await root.plugin(Plugin, config)
  addCleanup(() => root.fiber.dispose())
  const tools: string[] = []
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await root.tools.execute({ callId: ToolCallId(randomUUID()), name, arguments: args, signal: new AbortController().signal })
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy()
    tools.push(name)
  }
  const s = root.marketpilot.services
  const input = fileURLToPath(new URL('../fixtures/calm/input/', import.meta.url))
  const first = await runCalmScenario(s, call, input)
  const second = await runCalmScenario(s, call, input)
  expect(second.projectId).not.toBe(first.projectId)
  for (const result of [first, second]) {
    expect(result.summary).toMatchObject({ documents: 4, requirements: 10, evidence: 18, unknowns: 10, artifacts: 5, modelCalls: 12, toolCalls: 8 })
    expect(s.requirements.list(result.projectId).filter(r => r.status === 'confirmed')).toHaveLength(6)
    expect(s.alternatives.list(result.projectId).filter(a => a.status === 'selected')).toHaveLength(1)
    expect(s.competitors.list(result.projectId).find(c => c.product === 'DEMO-B')?.interfaces).toEqual([])
    expect(s.tender.list(result.projectId).map(t => t.status)).toEqual(['unknown', 'unknown', 'unknown'])
    expect(s.artifacts.list(result.projectId).find(a => a.type === 'solution')?.content).toContain('UNKNOWN / 待确认条件')
    expect(s.workflows.list(result.projectId).every(r => r.status === 'completed')).toBe(true)
  }
  expect(tools).toContain('marketpilot_requirement_confirm')
  await plugin.dispose()
  await root.plugin(Plugin, config)
  expect(root.marketpilot.services.workflows.summary(first.projectId).artifacts).toBe(5)
})
