import type { ProjectState } from '../domain/state.ts'

/** Atomic project-level operations. Services never depend on a storage medium. */
export interface ProjectRepository {
  create(state: ProjectState): Promise<void>
  get(projectId: string): ProjectState | undefined
  list(): ProjectState[]
  update(projectId: string, change: (draft: ProjectState) => void): Promise<ProjectState>
  delete(projectId: string): Promise<boolean>
  close(): Promise<void>
}
