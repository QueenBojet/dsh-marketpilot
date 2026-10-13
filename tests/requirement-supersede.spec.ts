import { describe, expect, it } from 'vitest'
import { setup, requirement, alternative, confirmedRequirement } from './helpers.ts'

describe.each(['sqlite', 'json'] as const)('%s requirement supersession', medium => {
  it('retires a historical requirement without rewriting its content or decisions', async () => {
    const { services: s, project: p } = await setup(medium)
    const old = await confirmedRequirement(s, p.id)
    const [route] = await s.alternatives.addMany(p.id, [alternative])
    const request = { alternativeId: route!.id, decision: 'selected', rationale: 'review', requirementIds: [old], evidenceIds: [] }
    await s.decisions.confirm(p.id, request)
    await expect(s.requirements.update(p.id, old, { status: 'superseded' })).rejects.toMatchObject({ code: 'DECISION_REFERENCED' })
    const [replacement] = await s.requirements.addMany(p.id, [{ ...requirement, normalizedText: '新要求' }])
    await s.requirements.confirm(p.id, [replacement!.id])
    await s.decisions.confirm(p.id, { ...request, requirementIds: [replacement!.id] }, { allowSelected: true })
    const history = s.decisions.list(p.id)
    const original = s.requirements.get(p.id, old)
    // The editor sends unchanged fields along with the new lifecycle status.
    const retired = await s.requirements.update(p.id, old, { ...requirement, status: 'superseded' })
    expect(retired.status).toBe('superseded')
    expect(retired.normalizedText).toBe(original.normalizedText)
    expect(retired.confirmation).toEqual(original.confirmation)
    expect(s.decisions.list(p.id)).toEqual(history)
    await expect(s.requirements.update(p.id, old, { status: 'superseded', normalizedText: 'overwrite' })).rejects.toMatchObject({ code: 'DECISION_REFERENCED' })
    await expect(s.requirements.update(p.id, old, { status: 'proposed' })).rejects.toMatchObject({ code: 'DECISION_REFERENCED' })
    await expect(s.requirements.delete(p.id, old)).rejects.toMatchObject({ code: 'DECISION_REFERENCED' })
  })
  it('does not overwrite an explicit superseded status when removing confirmation', async () => {
    const { services: s, project: p } = await setup(medium)
    const id = await confirmedRequirement(s, p.id)
    expect((await s.requirements.update(p.id, id, { status: 'superseded' })).status).toBe('superseded')
  })
})
