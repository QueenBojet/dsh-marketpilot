/** Adapter over the current official domain store; SQLite/JSON selected by Harness config. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { ensure } from '../domain/common.ts'
import { stateSchema } from '../domain/state.ts'
import type { ProjectState } from '../domain/state.ts'
import type { ProjectRepository } from './repository.ts'

export const marketpilotDomain = defineDomain({
  name: 'marketpilot', version: 1,
  tables: { projects: domainTable<string, ProjectState>(stateSchema) },
})

export class HarnessProjectRepository implements ProjectRepository {
  private readonly creating = new Set<string>()
  private constructor(private readonly domain: Domain<typeof marketpilotDomain>) {}

  static async open(facility: DomainFacility): Promise<HarnessProjectRepository> {
    return new HarnessProjectRepository(await facility.open(marketpilotDomain))
  }

  async create(state: ProjectState): Promise<void> {
    const parsed = stateSchema.parse(state)
    const id = parsed.project.id
    ensure(!this.creating.has(id) && !this.get(id), 'DUPLICATE_PROJECT', '项目 ID 已存在。')
    this.creating.add(id)
    try { await this.domain.table('projects').put(id, parsed) }
    finally { this.creating.delete(id) }
  }

  get(id: string): ProjectState | undefined {
    const state = this.domain.table('projects').get(id)
    return state ? structuredClone(state) : undefined
  }

  list(): ProjectState[] {
    return [...this.domain.table('projects').entries()].map(([, state]) => structuredClone(state))
  }

  async update(id: string, change: (draft: ProjectState) => void): Promise<ProjectState> {
    const next = await this.domain.table('projects').update(id, current => {
      const draft = structuredClone(current)
      change(draft)
      ensure(draft.project.id === id, 'IMMUTABLE_ID', '不能修改项目 ID。')
      draft.revision = current.revision + 1
      return stateSchema.parse(draft)
    })
    return structuredClone(next)
  }

  delete(id: string): Promise<boolean> { return this.domain.table('projects').delete(id) }
  close(): Promise<void> { return this.domain.close() }
}
