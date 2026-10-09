/**
 * Evidence ledger: filter by review status and kind, inspect a statement's
 * source, and verify it through the real Human Gate. UNKNOWN is never promoted
 * to fact by this page — verification is always an explicit human action.
 */
import { useState } from 'react'
import type { EvidenceItem } from '../api.ts'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { useEvidencePage, useToolWorkflow } from '../hooks/usePhase4.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

const STATUS_FILTERS = ['all', 'draft', 'verified'] as const
const KIND_FILTERS = ['all', 'UNKNOWN'] as const

/** Map a status/kind pair onto the localized label and Tag tone. */
function statusChip(t: MarketPilotText, item: EvidenceItem): { label: string; tone: 'success' | 'warning' | 'danger' | 'quiet' | 'neutral' } {
  if (item.status === 'verified') return { label: t(`evidenceStatus.${item.status}` as MarketPilotTextKey), tone: 'success' }
  if (item.status === 'rejected') return { label: t(`evidenceStatus.${item.status}` as MarketPilotTextKey), tone: 'danger' }
  if (item.status === 'superseded') return { label: t(`evidenceStatus.${item.status}` as MarketPilotTextKey), tone: 'quiet' }
  return { label: t(`evidenceStatus.${item.status}` as MarketPilotTextKey), tone: 'warning' }
}

/** Render the evidence ledger page. */
export function EvidencePage({ t, projectId }: { t: MarketPilotText; projectId: string }) {
  const [status, setStatus] = useState<string>('all')
  const [kind, setKind] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const ledger = useEvidencePage(projectId, { status, kind, q: query })
  const workflow = useToolWorkflow(projectId, ['marketpilot_evidence_verify'], 'evidence_review', t, ledger.refresh)
  const open = ledger.page?.evidence.find(row => row.id === openId) ?? null

  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('evidenceTitle')}</h2>
      <div className="mp-toolbar">
        {STATUS_FILTERS.map(filter => (
          <button key={filter} type="button" className="mp-headerNavItem"
            aria-current={status === filter ? 'page' : undefined}
            onClick={() => { setStatus(filter) }}
          >
            {filter === 'all' ? t('evidenceFilterAll')
              : filter === 'draft' ? t('evidenceFilterDraft') : t('evidenceFilterVerified')}
          </button>
        ))}
        {KIND_FILTERS.map(filter => (
          <button key={filter} type="button" className="mp-headerNavItem"
            aria-current={kind === filter ? 'page' : undefined}
            onClick={() => { setKind(filter) }}
          >
            {filter === 'all' ? t('reqFilterAll') : t('evidenceKind.UNKNOWN')}
          </button>
        ))}
        <input
          type="search" className="mp-searchInput" placeholder={t('evidenceSearchPlaceholder')}
          value={query} onChange={event => { setQuery(event.target.value) }}
        />
      </div>
      <WorkflowSurface
        t={t} run={workflow.run} execution={workflow.latest} busy={workflow.busy}
        error={workflow.error} label={t('verifyHuman')}
        onAnswer={(selected, custom) => { void workflow.answer(selected, custom) }}
        onCancel={() => { void workflow.cancel() }}
      />
      {ledger.error !== '' ? <ErrorState t={t} message={ledger.error} onRetry={ledger.refresh} />
        : ledger.loading ? <LoadingState t={t} />
          : ledger.page === null || ledger.page.total === 0 ? (
            <EmptyState title={t('reqEmptyTitle')} body={t('reqEmptyBody')} />
          ) : (
            <div className="mp-tableWrap">
              <table className="mp-table">
                <thead>
                  <tr>
                    <th scope="col">{t('evidenceKind.FACT')}</th>
                    <th scope="col">{t('colStatement')}</th>
                    <th scope="col">{t('colSource')}</th>
                    <th scope="col">{t('fieldStatus')}</th>
                    <th scope="col" style={{ width: '64px' }}>{t('colDetail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.page.evidence.map(item => {
                    const chip = statusChip(t, item)
                    return (
                      <tr key={item.id}>
                        <td><Tag tone={item.kind === 'UNKNOWN' ? 'warning' : 'neutral'}>{t(`evidenceKind.${item.kind}` as MarketPilotTextKey)}</Tag></td>
                        <td className="mp-cellMain">{item.statement}</td>
                        <td className="mp-muted">{item.sourceName ?? item.sourceType}</td>
                        <td><Tag tone={chip.tone}>{chip.label}</Tag></td>
                        <td>
                          <button type="button" className="mp-link" onClick={() => { setOpenId(item.id) }}>{t('colDetail')}</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      {open === null ? null : (
        <div className="mp-drawerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) setOpenId(null) }}>
          <aside className="mp-drawer" role="dialog" aria-label={t('evidenceTitle')}>
            <div className="mp-drawerHead">
              <h2 className="mp-drawerTitle">{open.title}</h2>
              <button type="button" className="mp-link" onClick={() => { setOpenId(null) }}>{t('close')}</button>
            </div>
            <div className="mp-drawerBody">
              <div style={{ margin: '4px 0 12px' }}>
                <Tag tone={open.kind === 'UNKNOWN' ? 'warning' : 'neutral'}>{t(`evidenceKind.${open.kind}` as MarketPilotTextKey)}</Tag>
                {' '}
                <Tag tone={statusChip(t, open).tone}>{statusChip(t, open).label}</Tag>
              </div>
              <p>{open.statement}</p>
              <h3 className="mp-drawerSection">{t('colSource')}</h3>
              <p>
                {open.sourceName ?? open.sourceType}
                {open.sourceLocator === undefined ? null : <code className="mp-caption">{` · ${open.sourceLocator}`}</code>}
              </p>
              {open.relatedRequirementIds.length === 0 ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('relatedTitle')}</h3>
                  <p className="mp-caption">{open.relatedRequirementIds.join(' · ')}</p>
                </>
              )}
              <p className="mp-caption" style={{ marginTop: '12px' }}>{t('verifyHint')}</p>
              <div className="mp-taskActions">
                {open.status === 'draft' || open.kind === 'UNKNOWN' ? (
                  <button
                    type="button" className="mp-primaryAction mp-headerNavItem" disabled={workflow.busy}
                    onClick={() => {
                      void workflow.start('marketpilot_evidence_verify', {
                        evidenceId: open.id, method: 'human',
                        targetKind: open.kind === 'UNKNOWN' ? 'FACT' : open.kind,
                        statement: open.statement, supportingEvidenceIds: open.supportingEvidenceIds,
                      })
                    }}
                  >
                    {t('verifyHuman')}
                  </button>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}