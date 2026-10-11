import { createHash } from 'node:crypto'
import type { Artifact, ArtifactDependencies } from '../domain/artifact.ts'
import type { ProjectState } from '../domain/state.ts'

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
  return value
}
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const ordered = <T extends { id: string }>(rows: readonly T[]): T[] => [...rows].sort((a, b) => a.id.localeCompare(b.id))

/** Excludes generated artifacts, short codes and workflow telemetry, which are not generation inputs. */
export function captureArtifactDependencies(state: ProjectState, type: Artifact['type']): ArtifactDependencies {
  const decision = state.decisions.find(row => row.id === state.project.activeDecisionId) ?? null
  const route = ['solution', 'compliance_matrix', 'product_gap'].includes(type)
    ? state.alternatives.find(row => row.id === decision?.alternativeId) ?? null : null
  const { id, name, customer, industry, scenario } = state.project
  return {
    version: 1, requirementsVersion: hash(ordered(state.requirements)),
    decisionId: decision?.id ?? null, decisionVersion: hash(decision),
    sourcesVersion: hash({ project: { id, name, customer, industry, scenario }, documents: ordered(state.documents),
      evidence: ordered(state.evidence.filter(row => row.kind !== 'DECISION')),
      competitors: ordered(state.competitors), policies: ordered(state.policies), route,
      tenderItems: type === 'compliance_matrix' ? ordered(state.tenderItems) : [],
    }),
  }
}

export function artifactContext(state: ProjectState, artifact: Artifact, current = captureArtifactDependencies(state, artifact.type)) {
  const stored = artifact.dependencies ?? null
  const changed = stored === null ? [] : (['requirements', 'decision', 'sources'] as const).filter(key =>
    stored[`${key}Version`] !== current[`${key}Version`])
  return { status: stored === null ? 'untracked' as const : changed.length ? 'possibly_stale' as const : 'current' as const,
    changed, stored, current }
}
export type ArtifactContext = ReturnType<typeof artifactContext>
