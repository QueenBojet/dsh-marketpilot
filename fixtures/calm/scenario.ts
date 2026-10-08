import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { createServices } from '../../src/services/index.ts'

type Services = ReturnType<typeof createServices>
/** Same guarded Tool sequence is reused by the runnable demo and the Golden Case test. */
export async function runCalmScenario(s: Services, call: (name: string, args: Record<string, unknown>) => Promise<void>,
  inputDirectory: string, exportDirectory?: string) {
  await call('marketpilot_project_create', { name: `CALM 匿名演示 ${Date.now()}`, description: '离线模型替身演示；不得作为真实项目承诺。' })
  const project = s.projects.list().at(-1)!
  const projectId = project.id
  for (const [file, kind] of [['brief.md', 'customer_requirement'], ['technology-notes.md', 'internal_reference'],
    ['tender.md', 'tender'], ['synthetic-datasheet.md', 'competitor_datasheet']]) {
    await call('marketpilot_document_import', { projectId, path: join(inputDirectory, file!), kind })
  }
  const document = (name: string) => s.documents.list(projectId).find(d => d.name === name)!
  await call('marketpilot_requirement_extract', { projectId, documentIds: [document('brief.md').id] })
  const requirementRun = s.workflows.list(projectId).at(-1)!
  await call('marketpilot_requirement_confirm', { projectId, runId: requirementRun.id,
    requirementIds: s.requirements.list(projectId).filter(r => r.status === 'proposed').map(r => r.id) })
  const notes = document('technology-notes.md')
  // SOURCE verification here means the excerpt was checked, not that sensor performance is proven.
  for (const statement of notes.textContent.split('\n').filter(line => line.startsWith('水面路线') || line.startsWith('水下路线'))) {
    await call('marketpilot_evidence_add', { projectId, kind: 'SOURCE', title: '候选技术摘录', statement,
      sourceType: 'internal', sourceDocumentId: notes.id, sourceLocator: '候选方法段落' })
    const source = s.evidence.list(projectId).at(-1)!
    await call('marketpilot_evidence_verify', { projectId, evidenceId: source.id, method: 'human', targetKind: 'SOURCE', statement, supportingEvidenceIds: [] })
  }
  await call('marketpilot_competitor_extract', { projectId, documentIds: [document('synthetic-datasheet.md').id] })
  await call('marketpilot_alternative_generate', { projectId })
  await call('marketpilot_solution_generate', { projectId })
  const waiting = s.workflows.list(projectId).at(-1)!
  if (waiting.status !== 'waiting_human') throw new Error('Golden Case failed to stop at Decision gate')
  const route = s.alternatives.list(projectId)[0]!
  await call('marketpilot_decision_confirm', { projectId, alternativeId: route.id, decision: `演示选择：${route.name}`,
    rationale: '演示人工确认；保留未冻结参数并继续现场验证。', evidenceIds: route.evidenceIds,
    requirementIds: s.requirements.list(projectId).filter(r => r.status === 'confirmed').map(r => r.id) })
  await call('marketpilot_solution_generate', { projectId, runId: waiting.id })
  await call('marketpilot_tender_extract', { projectId, documentIds: [document('tender.md').id] })
  await call('marketpilot_tender_review', { projectId, tenderItemIds: s.tender.list(projectId).map(t => t.id) })
  if (exportDirectory) {
    for (const artifact of s.artifacts.list(projectId)) await call('marketpilot_artifact_export', {
      projectId, artifactId: artifact.id, path: join(exportDirectory, artifact.name),
    })
    const solution = await readFile(join(exportDirectory, 'Solution.md'), 'utf8')
    if (!solution.includes('UNKNOWN / 待确认条件')) throw new Error('Export lost UNKNOWN section')
  }
  return { projectId, summary: s.workflows.summary(projectId) }
}
