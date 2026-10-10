/**
 * Route candidates compared side by side: 2-3 columns with composition,
 * strengths, limitations, risks and unknowns at equal height, the confirmed-
 * requirement coverage matrix in the same view, and a sticky decision bar
 * (selection + rationale) that submits through the real Decision Gate — the
 * model cannot select for the user.
 */
import { useState } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AlternativeItem } from '../api.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { useAlternatives, useToolWorkflow } from '../hooks/usePhase4.ts'
import { useRequirements } from '../hooks/useExecution.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

function coverageTone(level: string | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (level === 'full') return 'success'
  if (level === 'partial') return 'warning'
  if (level === 'none') return 'danger'
  return 'neutral'
}

/** One candidate column. */
function CandidateCard({ t, row, selected, busy, onSelect }: {
  t: MarketPilotText
  row: AlternativeItem
  selected: boolean
  busy: boolean
  onSelect: (id: string) => void
}) {
  return (
    <article
      className="mp-altCard" data-selected={selected ? 'true' : 'false'}
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
      <p className="mp-altCardSummary">{row.summary}</p>
      <dl className="mp-altCardFacts">
        <dt>{t('altComponents')}</dt>
        <dd>{row.components.join(' · ') || '—'}</dd>
        <dt>{t('altStrengths')}</dt>
        <dd>{row.strengths.join('；') || '—'}</dd>
        <dt>{t('altLimitations')}</dt>
        <dd>{row.limitations.join('；') || '—'}</dd>
        <dt>{t('altRisks')}</dt>
        <dd>{row.risks.join('；') || '—'}</dd>
        <dt>{t('altUnknowns')}</dt>
        <dd className="mp-altUnknowns">{row.unknowns.join('；') || '—'}</dd>
      </dl>
      <footer className="mp-altCardFoot">
        <span className="mp-caption">{`${t('colEvidence')}: ${String(row.evidenceIds.length)}`}</span>
      </footer>
    </article>
  )
}

/** Render the alternatives page. */
export function AlternativesPage({ t, projectId }: { t: MarketPilotText; projectId: string }) {
  const [selected, setSelected] = useState<string>('')
  const [rationale, setRationale] = useState('')
  const alternatives = useAlternatives(projectId)
  const requirements = useRequirements(projectId, { status: 'confirmed', pageSize: 100 })
  const workflow = useToolWorkflow(projectId, ['marketpilot_alternative_generate', 'marketpilot_decision_confirm'],
    'alternative_generation', t, alternatives.refresh)
  const rows = alternatives.rows ?? []
  const chosen = rows.find(row => row.id === selected)
  const confirmed = [...requirements.page?.requirements ?? []]
    .sort((left, right) => (left.priority === 'must' ? 0 : 1) - (right.priority === 'must' ? 0 : 1)
      || left.shortId.localeCompare(right.shortId))
  const submit = (): void => {
    if (chosen === undefined || rationale.trim() === '' || workflow.busy) return
    void workflow.start('marketpilot_decision_confirm', {
      alternativeId: chosen.id, decision: 'selected', rationale: rationale.trim(),
      evidenceIds: chosen.evidenceIds, requirementIds: confirmed.map(row => row.id),
    })
  }
  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('alternativesTitle')}</h2>
      <div className="mp-toolbar">
        <button
          type="button" className="mp-primaryAction mp-headerNavItem" disabled={workflow.busy}
          onClick={() => { void workflow.start('marketpilot_alternative_generate', {}) }}
        >
          {t('generateAlternatives')}
        </button>
      </div>
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
                  <CandidateCard key={row.id} t={t} row={row} selected={selected === row.id} busy={workflow.busy} onSelect={setSelected} />
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
            disabled={workflow.busy || chosen === undefined || rationale.trim() === ''}
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
