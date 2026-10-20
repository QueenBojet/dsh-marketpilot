import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { workbenchPage } from '../src/harness/v4-page.ts'

describe('MarketPilot V4 standalone workbench page', () => {
  it('is one self-contained responsive HTML document compatible with the inline-only CSP', () => {
    expect(workbenchPage.startsWith('<!doctype html>')).toBe(true)
    expect(workbenchPage).toContain('width=device-width')
    expect(workbenchPage).toContain('<div id="root"></div>')
    expect(workbenchPage).not.toMatch(/<script[^>]+src=/i)
    expect(workbenchPage).not.toMatch(/<link[^>]+href=/i)
    expect(workbenchPage).not.toMatch(/@import/)
    // Exactly one opening/closing inline script; bundle content must not terminate it early.
    expect(workbenchPage.match(/<\/script/gi)).toHaveLength(1)
  })

  it('talks only to the same-origin MarketPilot API', () => {
    expect(workbenchPage).toContain('/marketpilot/api')
    expect(workbenchPage).toContain('same-origin')
  })

  it('ships global navigation and the seven guided project workspaces with stepper and matrix controls', () => {
    for (const text of [
      '工作台', '我的项目', '研究资料库', '运行记录', '设置',
      '项目总览', '需求访谈', '资料与变更', '智能研究', '方案与决策', '成本与报价', '文档与交付',
      '工程方案流转阶段', '对比矩阵', '按配置一键生成 BOM 行', '选择模型与思考强度',
    ]) {
      expect(workbenchPage).toContain(text)
    }
  })

  it('invokes real gated tools rather than fake buttons', () => {
    for (const tool of [
      'marketpilot_v4_route_confirm',
      'marketpilot_v4_cost_review',
      'marketpilot_alternative_generate',
      'marketpilot_v4_discovery_confirm',
      'marketpilot_v4_support_fix',
      'marketpilot_v4_brainstorm',
      'marketpilot_v4_doc_draft_template',
    ]) {
      expect(workbenchPage).toContain(tool)
    }
    expect(workbenchPage).toContain('测试价格（非真实）')
  })

  it('is up to date with src/workbench-ui', () => {
    const read = () => readFileSync('src/harness/v4-page.generated.ts', 'utf8').split(String.fromCharCode(13)).join('')
    const before = read()
    execFileSync(process.execPath, ['scripts/build-workbench.mjs'], { stdio: 'pipe' })
    expect(read()).toBe(before)
  }, 60_000)
})
