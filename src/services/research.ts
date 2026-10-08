import { z } from 'zod'
import { ensure, ids, text } from '../domain/common.ts'
import type { Evidence } from '../domain/evidence.ts'
import type { Competitor } from '../domain/research.ts'
import type { ProjectState } from '../domain/state.ts'
import { competitorExtraction, policyExtraction } from '../domain/research-analysis.ts'
import type { ServiceContext } from './project.ts'
import { businessVersion } from './generation.ts'
import { requiredRecord } from './records.ts'
import { completeRun } from './workflow.ts'

/** Quoted research remains draft SOURCE; absent facts remain UNKNOWN until verification. */
export class ResearchService {
  constructor(private readonly ctx: ServiceContext) {}
  private evidence(projectId: string, title: string, statement: string, kind: 'SOURCE' | 'UNKNOWN', sourceDocumentId?: string, sourceLocator?: string): Evidence {
    return { ...this.ctx.fields(projectId), title, statement, kind, sourceType: 'model', status: 'draft',
      ...(sourceDocumentId ? { sourceDocumentId } : {}), ...(sourceLocator ? { sourceLocator } : {}),
      supportingEvidenceIds: [], relatedRequirementIds: [], relatedAlternativeIds: [], relatedCompetitorIds: [] }
  }
  private source(s: ProjectState, documentIds: string[], documentId: string, quote: string) {
    ensure(documentIds.includes(documentId) && s.documents.some(d => d.id === documentId && d.textContent.includes(quote)),
      'SOURCE_MISMATCH', '研究结论原文必须出现在本批来源文档中。')
  }
  async competitors(projectId: string, runId: string, version: string, input: unknown) {
    const data = competitorExtraction.parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      ensure(businessVersion(s) === version, 'STALE_CONTEXT', '研究输入已变化，请重新提取。')
      const run = requiredRecord(s, 'workflowRuns', runId)
      ensure(run.type === 'competitor_analysis' && run.status === 'running', 'RUN_NOT_RUNNING', '竞品工作流已停止。')
      const documentIds = ids.min(1).parse(run.input.documentIds)
      const rows: Competitor[] = []
      for (const candidate of data.competitors) {
        this.source(s, documentIds, candidate.sourceDocumentId, candidate.quote)
        ensure(candidate.quote.includes(candidate.company) && candidate.quote.includes(candidate.product),
          'MODEL_IDENTITY_UNSUPPORTED', '竞品身份原文必须同时包含厂家和准确型号。')
        const row: Competitor = { ...this.ctx.fields(projectId), company: candidate.company, product: candidate.product,
          performance: {}, interfaces: [], certifications: [], cases: [], strengths: [], limitations: [], evidenceIds: [] }
        const identity = this.evidence(projectId, `${row.company} ${row.product} 来源`, candidate.quote, 'SOURCE', candidate.sourceDocumentId, candidate.sourceLocator)
        identity.relatedCompetitorIds = [row.id]
        s.evidence.push(identity)
        row.evidenceIds.push(identity.id)
        const seen = new Set<string>()
        for (const claim of candidate.claims) {
          ensure(!seen.has(`${claim.category}:${claim.name}`), 'DUPLICATE_CLAIM', '同型号属性重复，请先处理冲突。')
          seen.add(`${claim.category}:${claim.name}`)
          ensure(documentIds.includes(claim.sourceDocumentId), 'SOURCE_MISMATCH', '缺失参数也必须关联输入文档。')
          if (claim.value !== null) {
            ensure(claim.quote, 'SOURCE_MISMATCH', '已知参数必须有原文。')
            this.source(s, documentIds, claim.sourceDocumentId, claim.quote)
            ensure(claim.quote.includes(candidate.product) && claim.quote.includes(claim.value),
              'MODEL_PARAMETER_INHERITANCE', '参数引用必须包含本型号及对应值，不能继承同系列其他型号参数。')
          }
          const source = this.evidence(projectId, `${candidate.product} ${claim.name}`,
            claim.value === null ? `${candidate.product} 的 ${claim.name} 未找到，待补证。` : claim.quote!,
            claim.value === null ? 'UNKNOWN' : 'SOURCE', claim.sourceDocumentId, claim.sourceLocator)
          source.relatedCompetitorIds = [row.id]
          s.evidence.push(source)
          row.evidenceIds.push(source.id)
          if (claim.category === 'performance') row.performance[claim.name] = claim.value
          else if (claim.value !== null) {
            if (claim.category === 'technology') row.technology = [row.technology, claim.value].filter(Boolean).join('；')
            else row[({ interface: 'interfaces', certification: 'certifications', case: 'cases', strength: 'strengths', limitation: 'limitations' } as const)[claim.category]].push(claim.value)
          }
        }
        rows.push(row)
      }
      s.competitors.push(...rows)
      for (const gap of data.gaps) s.evidence.push(this.evidence(projectId, '竞品研究缺项', gap, 'UNKNOWN'))
      const artifact = { ...this.ctx.fields(projectId), type: 'competitor_matrix' as const, name: 'Competitor Matrix.md',
        format: 'markdown' as const, reviewStatus: 'draft' as const, workflowRunId: run.id,
        content: ['# Competitor Matrix', '', '来源摘录尚未核验，不作为性能承诺。', '',
          ...rows.flatMap(r => [`## ${r.company} / ${r.product}`, '',
            ...Object.entries(r.performance).map(([key, value]) => `- ${key}：${value ?? 'UNKNOWN'}`),
            `- 技术：${r.technology ?? 'UNKNOWN'}`, `- 认证：${r.certifications.join('、') || 'UNKNOWN'}`,
            `- 接口：${r.interfaces.join('、') || 'UNKNOWN'}`, `- 业绩：${r.cases.join('、') || 'UNKNOWN'}`,
            `- 证据：${r.evidenceIds.join('、')}`, '']), '## UNKNOWN / 研究缺项', '', ...data.gaps.map(g => `- ${g}`), ''].join('\n') }
      s.artifacts.push(artifact)
      completeRun(run, this.ctx.now(), { competitorIds: rows.map(r => r.id), artifactId: artifact.id })
    })
    return requiredRecord(state, 'workflowRuns', runId)
  }
  async policies(projectId: string, runId: string, version: string, input: unknown) {
    const data = policyExtraction.parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      ensure(businessVersion(s) === version, 'STALE_CONTEXT', '标准来源已变化，请重新提取。')
      const run = requiredRecord(s, 'workflowRuns', runId)
      ensure(run.type === 'policy_analysis' && run.status === 'running', 'RUN_NOT_RUNNING', '标准提取工作流已停止。')
      const documentIds = ids.min(1).parse(run.input.documentIds)
      const rows = data.policies.map(({ quote, sourceDocumentId, sourceLocator, issuer, documentNumber, version, ...policy }) => {
        this.source(s, documentIds, sourceDocumentId, quote)
        ensure(quote.includes(policy.title) && policy.keyRequirements.every(k => quote.includes(k)),
          'SOURCE_MISMATCH', '标准标题与关键条款须能追溯到原文。')
        const source = this.evidence(projectId, policy.title, quote, 'SOURCE', sourceDocumentId, sourceLocator)
        s.evidence.push(source)
        return { ...policy, ...this.ctx.fields(projectId), ...(issuer ? { issuer } : {}),
          ...(documentNumber ? { documentNumber } : {}), ...(version ? { version } : {}), evidenceIds: [source.id] }
      })
      s.policies.push(...rows)
      for (const gap of data.gaps) s.evidence.push(this.evidence(projectId, '标准研究缺项', gap, 'UNKNOWN'))
      completeRun(run, this.ctx.now(), { policyIds: rows.map(r => r.id) })
    })
    return requiredRecord(state, 'workflowRuns', runId)
  }
  async importSearch(projectId: string, input: unknown) {
    const data = z.array(z.strictObject({ title: text, url: z.url(), text })).max(5).parse(input)
    const documentIds: string[] = []
    await this.ctx.repository.update(projectId, s => {
      for (const hit of data) {
        const document = { ...this.ctx.fields(projectId), name: hit.title, originalPath: hit.url, textContent: hit.text,
          kind: 'report' as const, importedAt: this.ctx.now() }
        s.documents.push(document)
        documentIds.push(document.id)
        const source = this.evidence(projectId, hit.title, hit.text, 'SOURCE', document.id, hit.url)
        source.sourceType = 'web'
        source.sourceUrl = hit.url
        s.evidence.push(source)
      }
    })
    return { documentIds }
  }
}
