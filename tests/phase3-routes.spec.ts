import { describe, expect, it } from 'vitest'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import * as Plugin from '../src/harness/plugin.ts'
import { setup, addCleanup } from './helpers.ts'

describe('MarketPilot Phase 3 artifact routes', () => {
  it('lists artifact metadata without content and serves one full artifact', async () => {
    const storage = await setup()
    await storage.repository.close()
    const { root, project } = storage
    await root.plugin(SystemPrompt)
    await root.plugin(Tools)
    await root.plugin(LocalFs, { cwd: storage.directory })
    await root.plugin(UserQuestions)
    const routes: { kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }[] = []
    root.provide('webServer', { register: (route: { kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => { routes.push(route); return () => {} } })
    await root.plugin(Plugin, new Plugin.Config({ maxDocumentBytes: 512, structuredProvider: 'spawn', modelTimeoutMs: 10000 }))
    addCleanup(async () => { await root.fiber.dispose() })
    const apiRoute = routes.find(route => route.path === '/marketpilot/api')
    expect(apiRoute).toBeDefined()

    const saved = await root.marketpilot.services.artifacts.save(project.id, {
      type: 'other', name: '验收成果.md', format: 'markdown',
      content: '# 验收成果\n\n含 UNKNOWN / 待确认条件 章节。',
    })
    const call = async (path: string): Promise<{ status: number; body: Record<string, unknown> }> => {
      let status = 0
      let body = ''
      const response = {
        writeHead(code: number) { status = code },
        end(text?: string) { body += text ?? '' },
      }
      const request = { method: 'GET', url: path, headers: {}, async *[Symbol.asyncIterator]() { yield* [] } }
      await apiRoute!.handler(request as never, response as never)
      return { status, body: JSON.parse(body || 'null') as Record<string, unknown> }
    }
    const list = await call(`/marketpilot/api/projects/${project.id}/artifacts`)
    expect(list.status).toBe(200)
    const artifacts = list.body.artifacts as Record<string, unknown>[]
    expect(artifacts).toHaveLength(1)
    const listed = artifacts[0]!
    expect(listed).toMatchObject({ name: '验收成果.md', type: 'other', format: 'markdown', reviewStatus: 'draft' })
    expect('content' in listed).toBe(false)
    const detail = await call(`/marketpilot/api/projects/${project.id}/artifacts/${saved.id}`)
    expect(detail.status).toBe(200)
    expect((detail.body.artifact as Record<string, unknown>).content).toContain('UNKNOWN / 待确认条件')
    const missing = await call(`/marketpilot/api/projects/${project.id}/artifacts/${'0'.repeat(8)}-${'0'.repeat(4)}-${'0'.repeat(4)}-${'0'.repeat(4)}-${'0'.repeat(12)}`)
    expect(missing.status).toBe(404)
  })
})
