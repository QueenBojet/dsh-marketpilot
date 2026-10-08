import { randomUUID } from 'node:crypto'
import { projectInput } from '../domain/project.ts'
import { ensure, reviewSchema } from '../domain/common.ts'
import type { ProjectState } from '../domain/state.ts'
import type { ProjectRepository } from '../storage/repository.ts'
import type { HumanGate } from '../adapters/contracts.ts'

/** Injected clock keeps timestamps and measured durations independently testable. */
export type Clock = () => Date
export class ServiceContext {
  constructor(readonly repository: ProjectRepository, readonly humanGate: HumanGate, readonly clock: Clock = () => new Date()) {}
  now(): string { return this.clock().toISOString() }
  fields(projectId: string) { return { id: randomUUID(), projectId, createdAt: this.now(), updatedAt: this.now() } }
  state(id: string): ProjectState {
    const state = this.repository.get(id)
    ensure(state, 'PROJECT_NOT_FOUND', '项目不存在。')
    return state
  }
  async review(projectId: string, action: string, proposal: unknown) {
    const revision = this.state(projectId).revision
    const review = reviewSchema.parse(await this.humanGate.review({ projectId, action, proposal: structuredClone(proposal) }))
    return { revision, review }
  }
  assertFresh(state: ProjectState, revision: number) {
    ensure(state.revision === revision, 'STALE_REVIEW', '项目在人工审核期间已变化，请重新审核。')
  }
}

export class ProjectService {
  constructor(private readonly ctx: ServiceContext) {}
  async create(input: unknown) {
    const data = projectInput.parse(input)
    const now = this.ctx.now()
    const project = { ...data, id: randomUUID(), status: 'draft' as const, createdAt: now, updatedAt: now }
    await this.ctx.repository.create({ project, revision: 0, documents: [], requirements: [], evidence: [],
      competitors: [], policies: [], alternatives: [], decisions: [], tenderItems: [], artifacts: [], workflowRuns: [] })
    return project
  }
  get(id: string) { return this.ctx.repository.get(id)?.project ?? null }
  list() { return this.ctx.repository.list().map(s => s.project) }
  async update(id: string, input: unknown) {
    const patch = projectInput.partial().parse(input)
    return (await this.ctx.repository.update(id, s => { Object.assign(s.project, patch, { updatedAt: this.ctx.now() }) })).project
  }
  delete(id: string) { return this.ctx.repository.delete(id) }
  getContext(id: string) {
    const s = this.ctx.state(id)
    return { project: s.project, confirmedRequirements: s.requirements.filter(r => r.status === 'confirmed'),
      openUnknowns: s.evidence.filter(e => e.kind === 'UNKNOWN' && !['rejected', 'superseded'].includes(e.status)),
      verifiedFacts: s.evidence.filter(e => e.status === 'verified' && ['FACT', 'SOURCE'].includes(e.kind)),
      assumptions: s.evidence.filter(e => e.kind === 'ASSUMPTION'), competitors: s.competitors, policies: s.policies,
      selectedDecision: s.decisions.find(d => d.id === s.project.activeDecisionId), relevantArtifacts: s.artifacts }
  }
}
