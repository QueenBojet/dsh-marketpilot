import { describe, expect, it } from 'vitest'
import { workbenchPage } from '../src/harness/v4-page.ts'

describe('MarketPilot V4 standalone foundation', () => {
  it('is a standalone responsive HTML page pointing to the real same-origin API', () => {
    expect(workbenchPage).toContain('<!doctype html>')
    expect(workbenchPage).toContain('/marketpilot/api')
    expect(workbenchPage).toContain('width=device-width')
    expect(workbenchPage).toContain('credentials:')
  })

  it('exposes six non-linear project workspaces and actual existing tool calls', () => {
    for (const text of ['项目总览', '资料与变更', '智能研究', '方案与决策', '成本与报价', '文档与交付']) {
      expect(workbenchPage).toContain(text)
    }
    expect(workbenchPage).toContain('marketpilot_requirement_extract')
    expect(workbenchPage).toContain('marketpilot_competitor_extract')
    expect(workbenchPage).toContain('marketpilot_alternative_generate')
    expect(workbenchPage).toContain('marketpilot_solution_generate')
    expect(workbenchPage).toContain('documentIds')
  })

  it('does not advertise unfinished pricing, baseline publishing and internet research as live', () => {
    expect(workbenchPage).toContain('尚未实现')
    expect(workbenchPage).toContain('联网检索')
    expect(workbenchPage).toContain('尚未接入真实持久化系统')
    expect(workbenchPage).toContain('没有提供虚构金额')
  })

  it('escapes untrusted document content and does not interpolate approval labels into JavaScript', () => {
    expect(workbenchPage).toContain('function esc(')
    expect(workbenchPage).toContain('answerOption(')
    expect(workbenchPage).not.toContain('JSON.stringify(k)+') 
  })
})
