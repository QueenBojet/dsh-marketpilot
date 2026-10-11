/**
 * Project summary header: identity, status, the few numbers that steer the
 * next decision (confirmed requirements, UNKNOWN items, waiting reviews), and
 * the way back to the project list. Replaces the old title + kv block.
 */
import type { ProjectDetail } from '../api.ts'
import { StatusTag } from './StatusTag.tsx'
import { formatTime } from '../format.ts'
import type { MarketPilotText } from '../locales.ts'

/**
 * Render the project header.
 * @param props.t - the locale-bound text function.
 * @param props.detail - the loaded project detail.
 * @param props.waiting - waiting-for-human run count for this project.
 * @param props.onBack - returns to the project list.
 */
export function ProjectHeader({ t, detail, waiting, onBack }: {
  t: MarketPilotText
  detail: ProjectDetail
  waiting: number | undefined
  onBack: () => void
}) {
  const { project } = detail
  const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : []
  const requirements = rows(detail.requirements) as ProjectDetail['requirements']
  const confirmed = requirements.filter(row => row.status === 'confirmed').length
  const unknown = requirements.filter(row => row.status === 'unknown').length
  const chips: { label: string; value: string; tone?: 'warn' }[] = [
    { label: t('countRequirements'), value: `${String(confirmed)} / ${String(requirements.length)}` },
    { label: t('workflow.requirementUnknown'), value: String(unknown), ...unknown > 0 ? { tone: 'warn' as const } : {} },
    { label: t('statWaiting'), value: waiting === undefined ? t('statUnavailable') : String(waiting), ...(waiting ?? 0) > 0 ? { tone: 'warn' as const } : {} },
  ]
  return (
    <header className="mp-projectHeader">
      <div className="mp-projectHeaderMain">
        <div className="mp-projectTitleRow">
          <h1 className="mp-pageTitle">{project.name}</h1>
          <span className="mp-caption">{t('workflow.recordStatus')}</span><StatusTag t={t} kind="project" value={project.status} />
        </div>
        <p className="mp-projectMeta mp-caption">
          {`${project.industry ?? t('valueUnset')} · ${project.scenario ?? t('valueUnset')} · ${t('fieldUpdated')} ${formatTime(project.updatedAt)}`}
        </p>
        <div className="mp-statChips">
          {chips.map(chip => (
            <span key={chip.label} className="mp-statChip" data-tone={chip.tone ?? 'default'}>
              <strong>{chip.value}</strong>
              <span>{chip.label}</span>
            </span>
          ))}
        </div>
      </div>
      <button type="button" className="mp-headerNavItem" onClick={onBack}>{t('back')}</button>
    </header>
  )
}
