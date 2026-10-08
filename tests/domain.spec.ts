import { describe, expect, it } from 'vitest'
import { projectInput } from '../src/domain/project.ts'
import { evidenceInput, findUnsupportedClaims } from '../src/domain/evidence.ts'
import { alternativeInput } from '../src/domain/decision.ts'
import { requirementInput } from '../src/domain/requirement.ts'
import { workflowSchema } from '../src/domain/workflow.ts'
import { alternative, evidence, requirement } from './helpers.ts'

describe('domain validation', () => {
  it('rejects blank project names and extra fields', () => {
    expect(() => projectInput.parse({ name: '   ' })).toThrow()
    expect(() => projectInput.parse({ name: 'demo', selected: true })).toThrow()
  })
  it('validates evidence kinds, confidence and source URLs', () => {
    for (const patch of [{ kind: 'GUESS' }, { confidence: 1.1 }, { sourceUrl: 'invalid' }, { status: 'verified' }, { kind: 'DECISION' }]) {
      expect(() => evidenceInput.parse({ ...evidence, ...patch })).toThrow()
    }
  })
  it('rejects selected routes and confirmed requirements in ordinary input', () => {
    expect(() => alternativeInput.parse({ ...alternative, status: 'selected' })).toThrow()
    expect(() => requirementInput.parse({ ...requirement, status: 'confirmed' })).toThrow()
  })
  it('reports unsupported claims structurally', () => {
    expect(findUnsupportedClaims([{ id: 'claim', evidenceIds: [] }], [])).toEqual([
      { claimId: 'claim', action: expect.any(String) },
    ])
  })
  it('rejects an incomplete workflow record', () => {
    expect(() => workflowSchema.parse({ status: 'completed' })).toThrow()
  })
})
