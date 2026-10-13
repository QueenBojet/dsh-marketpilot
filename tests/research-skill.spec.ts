import { describe, expect, it } from 'vitest'
import { setup } from './helpers.ts'
import type { RunDeps } from '../src/services/v4/base.ts'
import { registerResearchSkill } from '../src/services/v4/research-skill.ts'

describe('DSH research skill injection', () => {
  it('registers the packaged skill through the DSH public registry contract', async () => {
    let registered: unknown
    const dispose = () => {}
    expect(await registerResearchSkill({ register(skill) { registered = skill; return dispose } })).toBe(dispose)
    expect(registered).toMatchObject({ name: 'marketpilot-deep-research', source: 'bundled',
      content: expect.stringContaining('# MarketPilot 工程深度研究'), path: expect.stringMatching(/SKILL\.md$/),
      resourceBase: { kind: 'directory' } })
  })
  it('preserves the DSH search failure and never substitutes local material for web-only research', async () => {
    const { services, project, repository } = await setup()
    await services.documents.add(project.id, { name: 'local.txt', kind: 'other', textContent: 'Local data must not replace missing web evidence.' })
    const q = await services.v4.research.addQuestion(project.id, { title: 'public query' })
    let generated = false
    const deps: RunDeps = { route: { provider: 'test', model: 'test', source: 'override' }, signal: new AbortController().signal,
      model: { async generate() { generated = true; throw new Error('must not generate') } },
      web: { async search() { throw new Error('WEB_PROVIDER_CREDENTIAL_MISSING') }, async fetch() { throw new Error('must not fetch') } } }
    await expect(services.v4.research.research(project.id, q.id, deps, 'web')).rejects.toThrow('WEB_PROVIDER_CREDENTIAL_MISSING')
    expect(generated).toBe(false)
    expect(repository.get(project.id)!.v4!.runs.at(-1)).toMatchObject({ status: 'failed', webStatus: 'failed' })
    const { web: _web, ...withoutWeb } = deps
    await expect(services.v4.research.research(project.id, q.id, withoutWeb, 'web')).rejects.toThrow('联网')
    expect(generated).toBe(false)
  })
  it('injects the packaged instructions into plan, research and chat and records provenance', async () => {
    const { services, project, repository } = await setup()
    await services.documents.add(project.id, { name: 'test.txt', kind: 'other', textContent: '公开的合成软件验收资料。' })
    const q = await services.v4.research.addQuestion(project.id, { title: '合成研究问题' })
    const prompts: string[] = []
    const answers = [{ steps: ['核对来源'], queries: ['公开来源'] }, { report: '合成报告', findings: [] }, { answer: '资料未提及' }]
    const deps: RunDeps = { route: { provider: 'test', model: 'test', source: 'override' }, signal: new AbortController().signal,
      model: { async generate({ prompt, schema }) { prompts.push(prompt); return schema.parse(answers.shift()) } } }
    await services.v4.research.draftPlan(project.id, q.id, deps)
    const result = await services.v4.research.research(project.id, q.id, deps, 'local')
    await services.v4.research.chat(project.id, { thread: 'project', content: '有何依据？' }, deps)
    expect(prompts).toHaveLength(3)
    for (const prompt of prompts) expect(prompt).toContain('# MarketPilot 工程深度研究')
    expect(repository.get(project.id)!.v4!.runs.find(r => r.id === result.runId)?.note).toMatch(/skill:marketpilot-deep-research@[a-f0-9]{12}/)
  })
})
