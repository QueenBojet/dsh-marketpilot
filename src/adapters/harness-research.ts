import type { WebRuntime } from '@deepseek-ai/dsh-web'
import type { ResearchAdapter } from './contracts.ts'
import { ensure } from '../domain/common.ts'

/** Fetch actual source bodies; search titles/snippets never stand in for evidence. */
export class HarnessResearch implements ResearchAdapter {
  constructor(private readonly web: Pick<WebRuntime, 'search' | 'fetch'>) {}
  async search(query: string, signal: AbortSignal) {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(60000)])
    const result = await this.web.search({ query, maxResults: 5 }, bounded)
    const hits = []
    for (const source of result.sources) {
      bounded.throwIfAborted()
      const page = await this.web.fetch({ url: source.url }, bounded)
      ensure(page.statusCode >= 200 && page.statusCode < 300, 'RESEARCH_FETCH_FAILED', `来源获取失败：HTTP ${page.statusCode}`)
      ensure(!page.truncated && page.body.content.length <= 100000, 'RESEARCH_TRUNCATED', '来源正文超过限制，请另行导入完整的精简资料。')
      hits.push({ title: source.title ?? page.url, url: page.url, text: page.body.content })
    }
    return hits
  }
}
