import { expect, it } from 'vitest'
import { currentResearchDirections } from '../src/workbench-ui/research-progress.ts'
import type { Exploration, Question } from '../src/workbench-ui/types.ts'

const initial: Exploration = {
  id: 'initial', projectId: 'project', createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z',
  phase: 'initial', inputHash: 'input', runId: 'run', summary: 'Synthetic initial routes', routesHash: 'routes', questionIds: [],
  routes: ['route-a', 'route-b'].map(alternativeId => ({
    alternativeId, industrialSupport: 'Synthetic', feasibility: 'Unverified', evidenceGaps: [], researchDirections: [], sourceAlternativeIds: [],
  })),
}
const report = (id: string, direction: string, routes = ['route-a']): Question => ({
  id, title: id, status: 'answered', report: 'Synthetic research report', direction, alternativeIds: routes, requirementIds: [], documentIds: [],
})
const progress = (questions: Question[], current = true) => currentResearchDirections({
  discoveryStatus: { confirmed: true, initialCurrent: current, synthesisCurrent: false, decisionBlocker: null },
  v4: { questions, explorations: [initial] },
})

it('requires two different current directions rather than two reports in the same direction', () => {
  expect(progress([report('q1', 'Reliability'), report('q2', ' Reliability ')])).toBe(1)
  expect(progress([report('q1', 'Reliability'), report('q2', 'Interfaces', ['route-b'])])).toBe(2)
})

it('does not count historical, unbound, unfinished or missing reports as synthesis readiness', () => {
  const questions = [
    report('current', 'Reliability'), report('old', 'Old direction', ['historical-route']),
    report('mixed', 'Mixed direction', ['route-a', 'historical-route']), report('unbound', 'Unbound direction', []),
    { ...report('review', 'Needs review'), status: 'needs_review' as const },
    { ...report('empty', 'No report'), report: '' }, report('blank', '   '),
  ]
  expect(progress(questions)).toBe(1)
})

it('requires fresh research readiness after initial-route inputs become stale', () => {
  expect(progress([report('q1', 'Reliability'), report('q2', 'Interfaces')], false)).toBe(0)
})
