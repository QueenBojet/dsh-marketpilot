import { describe, expect, it } from 'vitest'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import * as Plugin from '../src/harness/plugin.ts'
import { setup, addCleanup, evidence, alternative } from './helpers.ts'

describe('MarketPilot Phase 4 projection routes', () => {
  it('serves competitor, policy, evidence, alternative and tender projections', async () => {
    const storage = await setup()
    await storage.repository.close()
    const { root, project, services } = storage
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

    await root.marketpilot.services.competitors.upsert(project.id, {
      company: 'TestCo', product: 'Sonar-1', technology: '多波束', targetScenario: '水面监测',
      performance: { '最小检漏率': null }, interfaces: [], certifications: [], cases: [],
      strengths: ['成熟'], limitations: ['深水未知'], evidenceIds: [],
    })
    await root.marketpilot.services.policies.add(project.id, {
      title: '海洋监测规范', issuer: '船级社', documentNumber: 'CS-2026', version: 'V1',
      scope: '适用范围', mandatoryLevel: 'mandatory', keyRequirements: ['连续运行'], impact: '影响',
      gap: '差距', evidenceIds: [],
    })
    await root.marketpilot.services.evidence.add(project.id, evidence)
    await root.marketpilot.services.evidence.add(project.id, { ...evidence, kind: 'UNKNOWN', title: '待确认', statement: '待确认声明' })
    await root.marketpilot.services.alternatives.addMany(project.id, [alternative])

    const competitors = await call(`/marketpilot/api/projects/${project.id}/competitors`)
    expect(competitors.status).toBe(200)
    expect((competitors.body.competitors as Record<string, unknown>[])[0]).toMatchObject({ company: 'TestCo', product: 'Sonar-1' })
    expect(JSON.stringify(competitors.body)).toContain('深水未知')

    const policies = await call(`/marketpilot/api/projects/${project.id}/policies`)
    expect((policies.body.policies as Record<string, unknown>[])[0]).toMatchObject({ title: '海洋监测规范', mandatoryLevel: 'mandatory' })

    const allEvidence = await call(`/marketpilot/api/projects/${project.id}/evidence`)
    expect((allEvidence.body as { total: number }).total).toBe(2)
    expect((allEvidence.body as { counts: Record<string, number> }).counts['draft']).toBe(2)
    const unknownOnly = await call(`/marketpilot/api/projects/${project.id}/evidence?kind=UNKNOWN`)
    expect((unknownOnly.body as { total: number }).total).toBe(1)
    const searched = await call(`/marketpilot/api/projects/${project.id}/evidence?q=${encodeURIComponent('待确认声明')}`)
    expect((searched.body as { total: number }).total).toBe(1)

    const alternatives = await call(`/marketpilot/api/projects/${project.id}/alternatives`)
    const alternativeRow = (alternatives.body.alternatives as Record<string, unknown>[])[0]!
    expect(alternativeRow).toMatchObject({ name: '候选多源路线', status: 'candidate' })
    expect(typeof alternativeRow.requirementCoverage).toBe('object')

    // Tender items stay empty until extraction — the projection still serves.
    const tenderItems = await call(`/marketpilot/api/projects/${project.id}/tender-items`)
    expect(tenderItems.status).toBe(200)
    expect(tenderItems.body.tenderItems).toEqual([])
    const workflow = await call(`/marketpilot/api/projects/${project.id}/workflow`)
    expect(workflow.status).toBe(200)
    expect(workflow.body.projectId).toBe(project.id)
    expect(workflow.body.unknowns).toBe(1)
    const stages = workflow.body.stages as { id: string; status: string; action: { enabled: boolean } }[]
    expect(stages).toHaveLength(8)
    expect(stages.find(s => s.id === 'S4')?.action.enabled).toBe(false)
    expect(stages.find(s => s.id === 'S6')?.status).toBe('skipped_optional')
    expect(JSON.stringify(workflow.body)).not.toContain('待确认声明')
    expect((await call('/marketpilot/api/projects/missing/workflow')).status).not.toBe(200)
    const research = await call(`/marketpilot/api/projects/${project.id}/research`)
    expect(research.status).toBe(200)
    expect(research.body).toMatchObject({ projectId: project.id, competitors: [expect.objectContaining({ company: 'TestCo' })], runs: [] })
    expect(research.body.recordCodes).toBeDefined()
    expect((await call('/marketpilot/api/projects/missing/research')).status).not.toBe(200)
  })

  it('serves single-record detail routes and flags superseded waits', async () => {
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

    const [requirement] = await root.marketpilot.services.requirements.addMany(project.id, [{
      originalText: '跨模块跳转原文', normalizedText: '系统应支持跨模块跳转', type: 'functional', priority: 'must',
    }])
    const evidenceRow = await root.marketpilot.services.evidence.add(project.id, evidence)

    // Detail routes return the same projections as the lists, by exact id.
    const oneRequirement = await call(`/marketpilot/api/projects/${project.id}/requirements/${requirement!.id}`)
    expect(oneRequirement.status).toBe(200)
    expect(oneRequirement.body.requirement).toMatchObject({ normalizedText: '系统应支持跨模块跳转', shortId: 'REQ-01' })
    const oneEvidence = await call(`/marketpilot/api/projects/${project.id}/evidence/${evidenceRow.id}`)
    expect(oneEvidence.status).toBe(200)
    expect(oneEvidence.body.evidence).toMatchObject({ kind: 'SOURCE', statement: evidence.statement })
    const missing = await call(`/marketpilot/api/projects/${project.id}/requirements/${crypto.randomUUID()}`)
    expect(missing.status).toBe(404)
    const missingEvidence = await call(`/marketpilot/api/projects/${project.id}/evidence/${crypto.randomUUID()}`)
    expect(missingEvidence.status).toBe(404)

    // A waiting run replaced by a newer same-type run is flagged superseded:
    // the newest requirement wait stays an actionable approval. The plugin
    // services use the real clock, so space the two starts out explicitly.
    const stale = await root.marketpilot.services.workflows.start(project.id, { type: 'requirement_analysis', input: {} })
    await root.marketpilot.services.workflows.wait(project.id, stale.id)
    await new Promise(resolve => setTimeout(resolve, 20))
    await root.marketpilot.services.workflows.start(project.id, { type: 'requirement_analysis', input: {} })
    const runs = await call(`/marketpilot/api/projects/${project.id}/runs?active=1`)
    const rows = runs.body.runs as { id: string; status: string; supersededWait?: boolean }[]
    const staleRow = rows.find(row => row.id === stale.id)
    expect(staleRow).toMatchObject({ status: 'waiting_human', supersededWait: true })
    const freshRow = rows.find(row => row.id !== stale.id)
    expect(freshRow?.supersededWait).toBeUndefined()
  })
})
