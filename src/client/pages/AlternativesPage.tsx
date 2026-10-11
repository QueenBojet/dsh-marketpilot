/**
 * Route candidates compared side by side: 2-3 columns, each card leading with
 * name, composition, strengths, limitations and risk summaries (long text
 * clamped with an explicit expand/collapse toggle), the confirmed-requirement
 * coverage matrix in the same view, and a decision bar (selection + rationale)
 * that submits through the real Decision Gate — the model cannot select for
 * the user. On narrow viewports the bar rests in normal flow so it never
 * covers the body text.
 */
import { useCallback, useMemo, useState } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AlternativeItem } from '../api.ts'
import { buildShortCodeIndex } from '../../domain/shortcodes.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { useAlternatives, useEvidencePage, useToolWorkflow } from '../hooks/usePhase4.ts'
import { useRequirements } from '../hooks/useExecution.ts'
import { useStageAccess, workflowText } from '../components/ProjectWorkflowOverview.tsx'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

function coverageTone(level: string | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (level === 'full') return 'success'
  if (level === 'partial') return 'warning'
  if (level === 'none') return 'danger'
  return 'neutral'
}

/** One candidate column. */
function CandidateCard({ t, row, selected, busy, onSelect, clean }: {
  t: MarketPilotText
  row: AlternativeItem
  selected: boolean
  busy: boolean
  onSelect: (id: string) => void
  clean: (text: string) => string
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <article
      className="mp-altCard" data-selected={selected ? 'true' : 'false'} data-expanded={expanded ? 'true' : 'false'}
      aria-label={row.name}
      onClick={() => { if (!busy) onSelect(row.id) }}
    >
      <header className="mp-altCardHead">
        <input
          type="radio" name="route" checked={selected} disabled={busy}
          aria-label={row.name}
          onChange={() => { onSelect(row.id) }}
        />
        <h3 className="mp-altCardTitle">{row.name}</h3>
        <Tag tone={row.status === 'selected' ? 'success' : row.status === 'rejected' ? 'danger' : 'neutral'}>
          {row.status === 'selected' ? t('altStatusSelected')
            : row.status === 'rejected' ? t('altStatusRejected') : t('altStatusCandidate')}
        </Tag>
      </header>
      <p className="mp-altCardSummary">{clean(row.summary)}</p>
      <dl className="mp-altCardFacts">
        <dt>{t('altComponents')}</dt>
        <dd>{row.components.map(clean).join(' · ') || '—'}</dd>
        <dt>{t('altStrengths')}</dt>
        <dd>{row.strengths.map(clean).join('；') || '—'}</dd>
        <dt>{t('altLimitations')}</dt>
        <dd>{row.limitations.map(clean).join('；') || '—'}</dd>
        <dt>{t('altRisks')}</dt>
        <dd>{row.risks.map(clean).join('；') || '—'}</dd>
        <dt>{t('altUnknowns')}</dt>
        <dd className="mp-altUnknowns">{row.unknowns.map(clean).join('；') || '—'}</dd>
      </dl>
      <footer className="mp-altCardFoot">
        <span className="mp-caption">{`${t('colEvidence')}: ${String(row.evidenceIds.length)}`}</span>
        <button
          type="button" className="mp-link mp-caption" aria-expanded={expanded}
          onClick={event => { event.stopPropagation(); setExpanded(current => !current) }}
        >
          {expanded ? t('altCollapseAll') : t('altExpandAll')}
        </button>
      </footer>
    </article>
  )
}

/** Render the alternatives page. */
export function AlternativesPage({ t, projectId }: { t: MarketPilotText; projectId: string }) {
  const [selected, setSelected] = useState<string>('')
  const [rationale, setRationale] = useState('')
  const access = useStageAccess('S4')
  const alternatives = useAlternatives(projectId)
  const requirements = useRequirements(projectId, { pageSize: 100 })
  const evidence = useEvidencePage(projectId, {})
  const workflow = useToolWorkflow(projectId, ['marketpilot_alternative_generate', 'marketpilot_decision_confirm'],
    'alternative_generation', t, alternatives.refresh)
  const rows = alternatives.rows ?? []
  // All requirements and evidence feed the short-code index (old runs may
  // reference either in stored summaries); confirmed ones drive the matrix.
  const allRequirements = useMemo(() => requirements.page?.requirements ?? [], [requirements.page])
  const allEvidence = useMemo(() => evidence.page?.evidence ?? [], [evidence.page])
  const confirmed = useMemo(() => [...allRequirements]
    .filter(row => row.status === 'confirmed')
    .sort((left, right) => (left.priority === 'must' ? 0 : 1) - (right.priority === 'must' ? 0 : 1)
      || left.shortId.localeCompare(right.shortId)), [allRequirements])
  const codeIndex = useMemo(
    () => buildShortCodeIndex({ requirements: allRequirements, evidence: allEvidence }),
    [allRequirements, allEvidence])
  const clean = useCallback((text: string) => codeIndex.replace(text), [codeIndex])
  const chosen = rows.find(row => row.id === selected)
  const submit = (): void => {
    if (chosen === undefined || rationale.trim() === '' || workflow.busy || !access.reviewAllowed || requirements.error !== '' || confirmed.length === 0) return
    void workflow.start('marketpilot_decision_confirm', {
      alternativeId: chosen.id, decision: 'selected', rationale: rationale.trim(),
      evidenceIds: chosen.evidenceIds, requirementIds: confirmed.map(row => row.id),
    })
  }
  return (
    <div className="mp-altPage">
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('alternativesTitle')}</h2>
      <div className="mp-toolbar">
        <button
          type="button" className="mp-primaryAction mp-headerNavItem" disabled={workflow.busy || !access.allowed || confirmed.length === 0 || requirements.error !== ''}
          onClick={() => { if (access.allowed && confirmed.length > 0) void workflow.start('marketpilot_alternative_generate', {}) }}
        >
          {t('generateAlternatives')}
        </button>
      </div>
      {confirmed.length === 0 ? <p className="mp-caption" role="note">{workflowText(t, 'needConfirmed')}</p> : null}
      {requirements.error === '' ? null : <p className="mp-errorText" role="alert">{requirements.error}</p>}
      <WorkflowSurface
        t={t} run={workflow.run} execution={workflow.latest} busy={workflow.busy} error={workflow.error}
        label={t('generateAlternatives')}
        onAnswer={(answer, custom) => { void workflow.answer(answer, custom) }}
        onCancel={() => { void workflow.cancel() }}
      />
      {alternatives.loading ? <LoadingState t={t} />
        : alternatives.error !== '' ? <ErrorState t={t} message={alternatives.error} onRetry={alternatives.refresh} />
          : rows.length === 0 ? <EmptyState title={t('alternativesTitle')} body={t('noAlternatives')} />
            : (
              <div className="mp-altGrid" data-count={String(Math.min(rows.length, 3))}>
                {rows.map(row => (
                  <CandidateCard key={row.id} t={t} row={row} selected={selected === row.id} busy={workflow.busy} onSelect={setSelected} clean={clean} />
                ))}
              </div>
            )}
      {rows.length === 0 || confirmed.length === 0 ? null : (
        <section className="mp-coverageBlock">
          <h3 className="mp-subTitle">{t('coverageTitle')}</h3>
          <div className="mp-tableWrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th scope="col">{t('colName')}</th>
                  {rows.map(row => <th key={row.id} scope="col">{row.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {confirmed.map(requirement => (
                  <tr key={requirement.id}>
                    <td className="mp-cellMain">
                      {requirement.normalizedText}
                      {requirement.priority === 'must' ? <Tag tone="neutral">MUST</Tag> : null}
                    </td>
                    {rows.map(row => {
                      const level = row.requirementCoverage[requirement.id]
                      return (
                        <td key={row.id}>
                          <Tag tone={coverageTone(level)}>{t(`coverage.${level ?? 'unknown'}` as MarketPilotTextKey)}</Tag>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {rows.length === 0 ? null : (
        <div className="mp-decisionBar">
          <div className="mp-decisionBarMain">
            <span className="mp-caption">{t('selectRoute')}</span>
            <strong>{chosen?.name ?? t('altNoneSelected')}</strong>
          </div>
          <textarea
            className="mp-dialogInput mp-decisionInput" placeholder={t('rationale')} value={rationale}
            aria-label={t('rationale')}
            onChange={event => { setRationale(event.target.value) }}
          />
          <button
            type="button" className="mp-primaryAction mp-headerNavItem"
            disabled={workflow.busy || !access.reviewAllowed || requirements.error !== '' || confirmed.length === 0 || chosen === undefined || rationale.trim() === ''}
            title={chosen === undefined ? t('altNoneSelected') : rationale.trim() === '' ? t('rationale') : undefined}
            onClick={submit}
          >
            {t('submitDecision')}
          </button>
        </div>
      )}
    </div>
  )
}
