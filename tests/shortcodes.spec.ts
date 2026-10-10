/** Short-code index: deterministic codes, display replacement, trace appendix. */
import { describe, expect, it } from 'vitest'
import { buildShortCodeIndex, renderCodeAppendix, shortFragment, UUID_PATTERN } from '../src/domain/shortcodes.ts'

const reqA = { id: '11111111-1111-4111-8111-111111111111', normalizedText: '系统连续监测', createdAt: '2026-10-01T00:00:00.000Z' }
const reqB = { id: '22222222-2222-4222-8222-222222222222', normalizedText: '数据留存 90 天', createdAt: '2026-10-02T00:00:00.000Z' }
const evA = { id: '33333333-3333-4333-8333-333333333333', title: '客户纪要', createdAt: '2026-10-01T06:00:00.000Z' }

describe('buildShortCodeIndex', () => {
  it('assigns per-family codes in creation order, independent of array order', () => {
    const first = buildShortCodeIndex({ requirements: [reqB, reqA], evidence: [evA] })
    expect(first.codeOf(reqA.id)).toBe('REQ-01')
    expect(first.codeOf(reqB.id)).toBe('REQ-02')
    expect(first.codeOf(evA.id)).toBe('EVD-01')
    // Same records in a different array order produce identical codes.
    const second = buildShortCodeIndex({ requirements: [reqA, reqB], evidence: [evA] })
    expect(second.codeOf(reqA.id)).toBe('REQ-01')
    expect(second.codeOf(reqB.id)).toBe('REQ-02')
    expect(second.codeOf(evA.id)).toBe('EVD-01')
  })

  it('breaks createdAt ties deterministically by id', () => {
    const late = { id: '44444444-4444-4444-8444-444444444444', normalizedText: '同刻记录', createdAt: reqA.createdAt }
    const index = buildShortCodeIndex({ requirements: [late, reqA] })
    expect(index.codeOf(reqA.id)).toBe('REQ-01')
    expect(index.codeOf(late.id)).toBe('REQ-02')
  })

  it('returns undefined for unknown ids and survives empty input', () => {
    const index = buildShortCodeIndex({})
    expect(index.codeOf(reqA.id)).toBeUndefined()
    expect(index.entries()).toEqual([])
  })

  it('covers every family prefix', () => {
    const index = buildShortCodeIndex({
      alternatives: [{ id: '55555555-5555-4555-8555-555555555555', name: '多源融合' }],
      decisions: [{ id: '66666666-6666-4666-8666-666666666666', rationale: '人工确认' }],
      tenderItems: [{ id: '77777777-7777-4777-8777-777777777777', clauseId: '3.2', normalizedRequirement: '检出率' }],
      documents: [{ id: '88888888-8888-4888-8888-888888888888', name: 'tender.md' }],
      artifacts: [{ id: '99999999-9999-4999-8999-999999999999', name: 'Solution.md' }],
    })
    const codes = index.entries().map(entry => entry.code)
    expect(codes).toEqual(['ALT-01', 'ART-01', 'DEC-01', 'DOC-01', 'TND-01'])
  })
})

describe('ShortCodeIndex.replace', () => {
  it('replaces known UUIDs case-insensitively and leaves unknown ids untouched', () => {
    const index = buildShortCodeIndex({ requirements: [reqA] })
    const text = `需求 [${reqA.id.toUpperCase()}] 与未知记录 44444444-4444-4444-8444-444444444444 保持原样。`
    const replaced = index.replace(text)
    expect(replaced).toContain('[REQ-01]')
    expect(replaced).not.toContain(reqA.id.slice(0, 8))
    expect(replaced).toContain('44444444-4444-4444-8444-444444444444')
  })

  it('is a no-op for text without UUIDs', () => {
    const index = buildShortCodeIndex({ requirements: [reqA] })
    expect(index.replace('# 标题\n\n正文')).toBe('# 标题\n\n正文')
  })

  it('matches the canonical UUID shape', () => {
    expect(UUID_PATTERN.test(reqA.id)).toBe(true)
    expect(UUID_PATTERN.test('not-a-uuid')).toBe(false)
  })
})

describe('renderCodeAppendix', () => {
  it('keeps traceability: every code lists its record fragment', () => {
    const index = buildShortCodeIndex({ requirements: [reqA], evidence: [evA] })
    const appendix = renderCodeAppendix(index)
    expect(appendix).toContain('附录：编号对照')
    expect(appendix).toContain('`REQ-01`')
    expect(appendix).toContain(`（${shortFragment(reqA.id)}）`)
    expect(appendix).toContain('`EVD-01`')
    expect(appendix).toContain('客户纪要')
  })

  it('renders nothing for an empty project', () => {
    expect(renderCodeAppendix(buildShortCodeIndex({}))).toBe('')
  })
})
