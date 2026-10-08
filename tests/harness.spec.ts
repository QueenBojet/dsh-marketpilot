import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import * as Plugin from '../src/harness/plugin.ts'
import { setup, addCleanup, requirement } from './helpers.ts'

async function harness() {
  const storage = await setup()
  await storage.repository.close()
  const { root } = storage
  await root.plugin(SystemPrompt)
  await root.plugin(Tools)
  await root.plugin(LocalFs, { cwd: storage.directory })
  await root.plugin(UserQuestions)
  const config = new Plugin.Config({ maxDocumentBytes: 512, structuredProvider: 'spawn', modelTimeoutMs: 10000 })
  const plugin = await root.plugin(Plugin, config)
  addCleanup(() => root.fiber.dispose())
  const call = (name: string, args: Record<string, unknown>, signal = new AbortController().signal) => root.tools.execute({
    callId: ToolCallId(randomUUID()), name, arguments: args, signal,
  })
  return { ...storage, config, plugin, call, services: root.marketpilot.services }
}

describe('MarketPilot Harness integration', () => {
  it('registers typed Tools and returns canonical data plus readable content', async () => {
    const { root, call } = await harness()
    expect(root.tools.schemas().map(t => t.name)).toContain('marketpilot_project_create')
    const result = await call('marketpilot_project_create', { name: 'Tool-created project' })
    expect(result.isError).toBeFalsy()
    expect(result.value).toMatchObject({ data: { name: 'Tool-created project', status: 'draft' } })
    expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('Tool-created project') }])
    const list = root.marketpilot.services.projects.list()
    expect(list.some(p => p.name === 'Tool-created project')).toBe(true)
  })
  it('runs import → extraction → human confirmation → baseline through guarded Tools', async () => {
    const { root, call, services: s, project: p, directory } = await harness()
    const path = join(directory, 'requirements.md')
    await writeFile(path, '24 h 连续监测\n报警留存周期未冻结')
    expect((await call('marketpilot_document_import', { projectId: p.id, path, kind: 'customer_requirement' })).isError).toBeFalsy()
    const doc = s.documents.list(p.id)[0]!
    root.provide('marketpilotModel', { async generate({ schema }) {
      return schema.parse({ requirements: [{ originalText: '24 h 连续监测', normalizedText: '系统需 24 h 连续监测',
        type: 'functional', priority: 'must', status: 'proposed', sourceDocumentId: doc.id, sourceLocator: '第 1 行',
        risk: null, clarificationQuestion: null }], unknowns: [{ title: '留存周期', statement: '报警留存周期未冻结', sourceDocumentId: doc.id, sourceLocator: '第 2 行' }] })
    } })
    const extracted = await call('marketpilot_requirement_extract', { projectId: p.id, documentIds: [doc.id] })
    expect(extracted.isError).toBeFalsy()
    const run = s.workflows.list(p.id)[0]!
    expect(run.status).toBe('waiting_human')
    root.on('user-questions/request', async () => ({ answers: [{ id: 'marketpilot-review', selected: ['确认'] }] }))
    const result = await call('marketpilot_requirement_confirm', { projectId: p.id, runId: run.id, requirementIds: s.requirements.list(p.id).map(r => r.id) })
    expect(result.isError).toBeFalsy()
    expect(s.workflows.get(p.id, run.id).status).toBe('completed')
    expect(s.artifacts.list(p.id)[0]?.content).toContain('报警留存周期未冻结')
  })
  it('applies schema validation, denial policy and cancellation before mutation', async () => {
    const { root, call, services } = await harness()
    const before = services.projects.list().length
    expect((await call('marketpilot_project_create', { name: 17 })).isError).toBe(true)
    expect((await call('marketpilot_project_create', { name: 'cancelled' }, AbortSignal.abort())).isError).toBe(true)
    const observer = vi.fn()
    root.on('tools/result', observer)
    root.on('tools/pre-execute', async () => ({ kind: 'deny', reason: 'Denied by test policy' }))
    expect((await call('marketpilot_project_create', { name: 'denied' })).isError).toBe(true)
    expect(services.projects.list()).toHaveLength(before)
    expect(observer).toHaveBeenCalledOnce()
  })
  it('imports Markdown through the real filesystem and rejects unsupported, empty or oversized input', async () => {
    const { call, services, project: p, directory } = await harness()
    const path = join(directory, 'brief.md')
    await writeFile(path, '# 需求\n连续监测并保留报警事件。', 'utf8')
    const result = await call('marketpilot_document_import', { projectId: p.id, path, kind: 'customer_requirement' })
    expect(result.isError).toBeFalsy()
    expect(services.documents.list(p.id)[0]).toMatchObject({ name: 'brief.md', textContent: '# 需求\n连续监测并保留报警事件。', checksum: expect.stringMatching(/^[a-f0-9]{64}$/) })
    for (const [filename, content] of [['fake.pdf', 'not pdf'], ['blank.txt', ' '], ['large.txt', 'x'.repeat(513)]]) {
      const badPath = join(directory, filename!)
      await writeFile(badPath, content!)
      expect((await call('marketpilot_document_import', { projectId: p.id, path: badPath, kind: 'report' })).isError).toBe(true)
    }
    expect(services.documents.list(p.id)).toHaveLength(1)
  })
  it('requires an answer from the human provider and ignores model approval claims', async () => {
    const { root, call, services: s, project: p } = await harness()
    const [r] = await s.requirements.addMany(p.id, [requirement])
    const args = { projectId: p.id, requirementIds: [r!.id], confirmedBy: 'model', human: true }
    expect((await call('marketpilot_requirement_confirm', args)).isError).toBe(true)
    expect(s.requirements.get(p.id, r!.id).status).toBe('proposed')
    const decline = root.on('user-questions/request', async () => ({ answers: [{ id: 'marketpilot-review', selected: ['退回修改'] }] }))
    expect((await call('marketpilot_requirement_confirm', args)).isError).toBe(true)
    decline()
    const review = vi.fn(async () => ({ answers: [{ id: 'marketpilot-review', selected: ['确认'] }] }))
    root.on('user-questions/request', review)
    expect((await call('marketpilot_requirement_confirm', args)).isError).toBeFalsy()
    expect(review).toHaveBeenCalledOnce()
    expect(s.requirements.get(p.id, r!.id)).toMatchObject({ status: 'confirmed', confirmation: { reviewer: expect.stringContaining('Harness human') } })
  })
  it('exports a human-reviewed snapshot and refuses to overwrite an existing file', async () => {
    const { root, call, services: s, project: p, directory } = await harness()
    const artifact = await s.artifacts.save(p.id, { name: 'Baseline.md', type: 'requirement_baseline', format: 'markdown', content: '# Baseline\nUNKNOWN: 未冻结性能。' })
    root.on('user-questions/request', async () => ({ answers: [{ id: 'marketpilot-review', selected: ['确认'] }] }))
    const path = join(directory, 'Baseline.md')
    const args = { projectId: p.id, artifactId: artifact.id, path }
    expect((await call('marketpilot_artifact_export', args)).isError).toBeFalsy()
    expect(await readFile(path, 'utf8')).toBe(artifact.content)
    await writeFile(path, 'existing user content')
    expect((await call('marketpilot_artifact_export', args)).isError).toBe(true)
    expect(await readFile(path, 'utf8')).toBe('existing user content')
  })
  it('unregisters Tools, removes its service and releases the domain on unload', async () => {
    const { root, call, plugin, config } = await harness()
    await plugin.dispose()
    expect(root.get('marketpilot')).toBeUndefined()
    expect(root.tools.schemas().some(t => t.name.startsWith('marketpilot_'))).toBe(false)
    expect((await call('marketpilot_project_create', { name: 'after unload' })).isError).toBe(true)
    await root.plugin(Plugin, config)
    expect((await call('marketpilot_project_create', { name: 'reloaded' })).isError).toBeFalsy()
  })
  it('aborts an outstanding human question and drains it before unload completes', async () => {
    const { root, call, plugin, config, services: s, project: p } = await harness()
    const [r] = await s.requirements.addMany(p.id, [requirement])
    let entered!: () => void
    const asking = new Promise<void>(resolve => { entered = resolve })
    root.on('user-questions/request', async request => {
      entered()
      return new Promise((_resolve, reject) => request.signal!.addEventListener('abort', () => reject(request.signal!.reason), { once: true }))
    })
    const pending = call('marketpilot_requirement_confirm', { projectId: p.id, requirementIds: [r!.id] })
    await asking
    await plugin.dispose()
    expect((await pending).isError).toBe(true)
    await root.plugin(Plugin, config)
    expect(root.marketpilot.services.requirements.get(p.id, r!.id).status).toBe('proposed')
  })
})
