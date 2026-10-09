/**
 * Route candidates with the requirement-coverage matrix. Submitting a route
 * goes through the real Decision Gate — the model cannot select for the user.
 */
import { useState } from 'react'
import type { AlternativeItem } from '../api.ts'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
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
  const confirmed = requirements.page?.requirements ?? []
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
              <div className="mp-taskList">
                {rows.map(row => (
                  <div key={row.id} className="mp-taskCard" data-status={row.status}>
                    <div className="mp-taskHead">
                      <input
                        type="radio" name="route" checked={selected === row.id} disabled={workflow.busy}
                        aria-label={row.name}
                        onChange={() => { setSelected(row.id) }}
                      />
                      <span className="mp-cellMain">{row.name}</span>
                      <Tag tone={row.status === 'selected' ? 'success' : row.status === 'rejected' ? 'danger' : 'neutral'}>
                        {row.status === 'selected' ? t('altStatusSelected')
                          : row.status === 'rejected' ? t('altStatusRejected') : t('altStatusCandidate')}
                      </Tag>
                      <span className="mp-toolbarSpacer" />
                      <span className="mp-caption">{`${t('colEvidence')}: ${String(row.evidenceIds.length)}`}</span>
                    </div>
                    <p>{row.summary}</p>
                    <div className="mp-caption">
                      {`${t('altComponents')}: ${row.components.join(' · ')}`}
                    </div>
                    {row.unknowns.length === 0 ? null : (
                      <p className="mp-caption">{`${t('altUnknowns')}: ${row.unknowns.join('；')}`}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
      {rows.length === 0 ? null : (
        <div>
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
                    <td className="mp-cellMain">{requirement.normalizedText}</td>
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
        </div>
      )}
      {rows.length === 0 ? null : (
        <div>
          <h3 className="mp-subTitle">{t('submitDecision')}</h3>
          <p className="mp-caption">{t('selectRoute')}</p>
          <textarea
            className="mp-dialogInput" placeholder={t('rationale')} value={rationale}
            onChange={event => { setRationale(event.target.value) }}
          />
          <div className="mp-taskActions">
            <button
              type="button" className="mp-primaryAction mp-headerNavItem"
              disabled={workflow.busy || chosen === undefined || rationale.trim() === ''}
              onClick={submit}
            >
              {t('submitDecision')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}