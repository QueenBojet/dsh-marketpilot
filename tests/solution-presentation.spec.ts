import { describe, expect, it } from 'vitest'
import { savedSolutionRoute, solutionOutline, solutionSummary } from '../src/client/solutionPresentation.ts'

describe('Saved solution presentation', () => {
  it('keeps exact summary text and UNKNOWN without including the following section', () => {
    const content = '# Saved solution\n## 方案摘要\n- 选定路线：旧路线 A\n- UNKNOWN: 3\n### 适用边界\n现场核验\n# 技术审计\nFull evidence'
    expect(solutionSummary(content)).toBe('- 选定路线：旧路线 A\n- UNKNOWN: 3\n### 适用边界\n现场核验')
    expect(savedSolutionRoute(content)).toBe('旧路线 A')
    expect(content).toContain('Full evidence')
  })
  it('does not fabricate a summary or use a route from another section', () => {
    const content = '# 无单独摘要\n正文\n# 其他记录\n选定路线：不属于摘要'
    expect(solutionSummary('# 正文\nNo separate section')).toBeNull()
    expect(savedSolutionRoute(content)).toBeNull()
  })
  it('ignores fenced headings and preserves duplicate heading occurrence indexes', () => {
    const content = '```md\n## 方案摘要\nexample\n```\n# 重复标题\ntext\n# 重复标题\n## 方案摘要\nSaved excerpt\n~~~\n# Not a heading\n~~~\n# 审计'
    expect(solutionOutline(content).map(h => [h.text, h.index])).toEqual([['重复标题', 0], ['重复标题', 1], ['方案摘要', 2], ['审计', 3]])
    expect(solutionSummary(content)).toBe('Saved excerpt\n~~~\n# Not a heading\n~~~')
  })
})
