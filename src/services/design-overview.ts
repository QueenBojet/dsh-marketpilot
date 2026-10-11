import type { ProjectState } from '../domain/state.ts'
import { buildShortCodeIndex } from '../domain/shortcodes.ts'
import { artifactContext, captureArtifactDependencies } from './artifact-context.ts'
import type { Artifact, ArtifactDependencies } from '../domain/artifact.ts'
import { businessVersion } from './generation.ts'

/** One repository revision for route comparison, decision previews and version-aware readers. */
export function designOverview(state: ProjectState) {
  const codes = buildShortCodeIndex(state)
  const versions = new Map<Artifact['type'], ArtifactDependencies>()
  const artifacts = state.artifacts.map(artifact => {
    let version = versions.get(artifact.type)
    if (version === undefined) { version = captureArtifactDependencies(state, artifact.type); versions.set(artifact.type, version) }
    const { content: _content, ...row } = artifact
    return { ...row, context: artifactContext(state, artifact, version) }
  })
  return {
    projectId: state.project.id, revision: state.revision, reviewVersion: businessVersion(state),
    alternatives: state.alternatives, requirements: state.requirements, evidence: state.evidence,
    decisions: state.decisions, activeDecisionId: state.project.activeDecisionId ?? null,
    documents: state.documents.map(({ id, name, kind, textContent }) => ({ id, name, kind, hasText: textContent.trim() !== '',
      synthetic: /synthetic|合成|演示|demo/i.test(`${name}\n${textContent}`) })),
    tenderItems: state.tenderItems,
    artifacts,
    runs: state.workflowRuns.map(({ id, type, status, updatedAt, output }) => ({ id, type, status, updatedAt, output })),
    recordCodes: Object.fromEntries([...state.requirements, ...state.evidence, ...state.alternatives, ...state.decisions,
      ...state.artifacts, ...state.documents, ...state.tenderItems].map(row => [row.id, codes.codeOf(row.id) ?? row.id.slice(0, 8)])),
  }
}
export type DesignOverview = ReturnType<typeof designOverview>
