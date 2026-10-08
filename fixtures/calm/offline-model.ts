import type { ModelStructuredOutputAdapter } from '../../src/adapters/contracts.ts'

type Document = { id: string; textContent: string }
type Context = { confirmedRequirements: { id: string; normalizedText: string }[];
  verifiedFacts: { id: string; statement: string }[]; openUnknowns: { statement: string }[];
  selectedDecision: { id: string }; route: { components: string[]; summary: string } }
function input<T>(prompt: string, tag: string): T {
  const value = prompt.match(new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`))?.[1]
  if (!value) throw new Error(`Offline fixture missing ${tag}`)
  return JSON.parse(value) as T
}
const titles = ['系统组成', '工作原理', '数据与报警流程', '安装与实施建议', '测试验证建议', '风险与后续工作']

/** Explicit deterministic test double; never measures real model extraction or proposal quality. */
export const offlineModel: ModelStructuredOutputAdapter = {
  async generate({ prompt, schema, signal }) {
    signal.throwIfAborted()
    const task = prompt.match(/^任务标识：(.*)$/m)?.[1]
    let raw: unknown
    if (task === 'requirement-extract') {
      const documents = input<Document[]>(prompt, 'documents')
      const requirements = documents.flatMap(d => d.textContent.split('\n').flatMap((line, i) => {
        if (!line.startsWith('- ')) return []
        const originalText = line.slice(2).trim()
        const unknown = /未冻结|待确认/.test(originalText)
        return [{ originalText, normalizedText: originalText, sourceDocumentId: d.id, sourceLocator: `行 ${i + 1}`,
          type: unknown ? 'performance' : 'functional', priority: 'must', status: unknown ? 'unknown' : 'proposed',
          risk: null, clarificationQuestion: unknown ? '请补齐验收标准或证明材料。' : null }]
      }))
      raw = { requirements, unknowns: requirements.filter(r => r.status === 'unknown').map(r => ({
        title: r.normalizedText, statement: r.originalText, sourceDocumentId: r.sourceDocumentId, sourceLocator: r.sourceLocator,
      })) }
    } else if (task === 'alternative-generate') {
      const context = input<Context>(prompt, 'context')
      const materials = context.verifiedFacts.map(e => e.statement).join('\n')
      const methods = ['雷达', '红外', '可见光', '声纳', 'UV', '温度'].filter(word => materials.includes(word))
      raw = { alternatives: ['多源联合验证', '分阶段验证'].map((name, index) => ({ name,
        summary: index ? '先完成分系统基线与试验，再评估融合部署。' : '联合水面和水下候选方法，现场验证后冻结指标。',
        components: methods.length ? methods : ['待选传感器'], strengths: [index ? '便于分步验证' : '可比较多源观测结果'],
        limitations: ['性能和部署条件未验证'], risks: ['环境背景可能影响检测效果'],
        unknowns: context.openUnknowns.map(e => e.statement), evidenceIds: context.verifiedFacts.map(e => e.id),
        requirementCoverage: context.confirmedRequirements.map(r => ({ requirementId: r.id, coverage: 'partial' })),
      })) }
    } else if (task === 'solution-outline') {
      raw = { sections: titles.map(title => ({ title, purpose: '响应已确认需求并提出待验证的设计建议。' })) }
    } else if (task === 'solution-section') {
      const context = input<Context>(prompt, 'context')
      const section = input<{ title: string }>(prompt, 'section')
      raw = { title: section.title, decisionId: context.selectedDecision.id, claims: [{
        text: `${section.title}建议：围绕 ${context.route.components.join('、')} 开展集成、现场验证和人工复核；${context.route.summary}`,
        kind: 'narrative', status: 'suggested', requirementIds: context.confirmedRequirements.map(r => r.id), evidenceIds: [],
      }] }
    } else if (task === 'tender-extract') {
      const documents = input<Document[]>(prompt, 'documents')
      raw = { clauses: documents.flatMap(d => d.textContent.split('\n').flatMap((line, i) => {
        if (!/^T-\d+：/.test(line)) return []
        return [{ clauseId: line.split('：')[0], originalText: line, normalizedRequirement: line,
          claimKinds: [line.includes('认证') ? 'certification' : line.includes('检漏率') ? 'technical_parameter' : 'general'],
          sourceDocumentId: d.id, sourceLocator: `行 ${i + 1}` }]
      })) }
    } else if (task === 'tender-review') {
      const items = input<{ id: string }[]>(prompt, 'items')
      // Deliberately overconfident output exercises the service's mandatory downgrade.
      raw = { items: items.map(item => ({ id: item.id, status: 'compliant', responseDraft: '符合（故意注入的无证据测试声明）',
        requirementIds: [], evidenceIds: [], risk: null, action: null })) }
    } else if (task === 'competitor-extract') {
      const documents = input<Document[]>(prompt, 'documents')
      const competitors = documents.flatMap(d => [...d.textContent.matchAll(/演示厂家 (\w+)，型号 ([\w-]+)。/g)].map(match => {
        const product = match[2]!
        const citation = { sourceDocumentId: d.id, sourceLocator: '合成 Datasheet' }
        const claims = ['接口', '技术'].map(name => {
          const quote = d.textContent.split('\n').find(line => line.startsWith(`${product} ${name}为`))
          return { ...citation, category: name === '接口' ? 'interface' : 'technology', name,
            value: quote?.split('为')[1]?.replace(/。$/, '') ?? null, quote: quote ?? null }
        })
        return { ...citation, company: match[1], product, quote: match[0], claims: [...claims,
          { ...citation, category: 'performance', name: '检出率', value: null, quote: null },
          { ...citation, category: 'certification', name: '海工认证', value: null, quote: null }] }
      }))
      raw = { competitors, gaps: ['真实厂商的型号、认证和检出率证明仍需收集；合成资料不可作为采购依据。'] }
    } else if (task === 'policy-extract') raw = { policies: [], gaps: ['本次资料没有可核验的正式标准全文。'] }
    else throw new Error(`Unknown offline task ${task}`)
    return schema.parse(raw)
  },
}
