/**
 * Tender compliance: clause extraction and review through the real tools.
 * A clause marked compliant requires verified FACT/SOURCE evidence — the
 * server downgrades anything weaker to unknown, and the page states so.
 */
import { useState } from 'react'
import type { TenderItemProjection } from '../api.ts'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { useDrawerKeys } from '../hooks/useDrawerKeys.ts'
import { useDocuments } from '../hooks/useExecution.ts'
import { useTenderItems, useToolWorkflow } from '../hooks/usePhase4.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'quiet' {
  if (status === 'compliant') return 'success'
  if (status === 'partially_compliant') return 'warning'
  if (status === 'non_compliant') return 'danger'
  if (status === 'not_applicable') return 'quiet'
  return 'neutral'
}

/** Render the tender page. */
export function TenderPage({ t, projectId, onGoEvidence }: {
  t: MarketPilotText
  projectId: string
  onGoEvidence?: (() => void) | undefined
}) {
  const [selectedDocs, setSelectedDocs] = useState<ReadonlySet<string>>(new Set())
  const [selectedItems, setSelectedItems] = useState<ReadonlySet<string>>(new Set())
  const [drawer, setDrawer] = useState<TenderItemProjection | null>(null)
  const documents = useDocuments(projectId)
  const items = useTenderItems(projectId)
  const workflow = useToolWorkflow(projectId,
    ['marketpilot_tender_extract', 'marketpilot_tender_review'], 'tender_review', t, items.refresh)
  const drawerRef = useDrawerKeys(drawer !== null, () => { setDrawer(null) })
  const rows = items.rows ?? []

  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('tenderTitle')}</h2>
      {documents.loading ? <LoadingState t={t} />
        : (documents.documents ?? []).filter(doc => doc.kind === 'tender').length === 0 ? <p className="mp-caption">{t('docsEmpty')}</p>
          : (
            <ul className="mp-docList">
              {(documents.documents ?? []).filter(doc => doc.kind === 'tender').map(doc => (
                <li key={doc.id} className="mp-docItem">
                  <label>
                    <input
                      type="checkbox" checked={selectedDocs.has(doc.id)} disabled={workflow.busy}
                      onChange={() => { setSelectedDocs(current => {
                        const next = new Set(current)
                        if (next.has(doc.id)) next.delete(doc.id)
                        else next.add(doc.id)
                        return next
                      }) }}
                    />
                    <span className="mp-cellMain">{doc.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
      <div className="mp-toolbar">
        <button
          type="button" className="mp-primaryAction mp-headerNavItem"
          disabled={workflow.busy || selectedDocs.size === 0}
          onClick={() => { void workflow.start('marketpilot_tender_extract', { documentIds: [...selectedDocs] }) }}
        >
          {t('tenderExtract')}
        </button>
        <button
          type="button" className="mp-primaryAction mp-headerNavItem"
          disabled={workflow.busy || selectedItems.size === 0}
          title={selectedItems.size === 0 ? t('reviewTenderNeedsSelection') : undefined}
          onClick={() => { void workflow.start('marketpilot_tender_review', { tenderItemIds: [...selectedItems] }) }}
        >
          {`${t('reviewTenderSelected')}（${String(selectedItems.size)}）`}
        </button>
        <button
          type="button" className="mp-headerNavItem"
          disabled={workflow.busy || rows.length === 0}
          onClick={() => { void workflow.start('marketpilot_tender_review', { tenderItemIds: rows.map(row => row.id) }) }}
        >
          {t('reviewTenderAll')}
        </button>
      </div>
      <WorkflowSurface
        t={t} run={workflow.run} execution={workflow.latest} busy={workflow.busy} error={workflow.error}
        label={t('tenderReview')}
        onAnswer={(selected, custom) => { void workflow.answer(selected, custom) }}
        onCancel={() => { void workflow.cancel() }}
      />
      <p className="mp-caption" style={{ marginTop: '8px' }}>{t('tenderCompliantNeedsEvidence')}</p>
      {items.loading ? <LoadingState t={t} />
        : items.error !== '' ? <ErrorState t={t} message={items.error} onRetry={items.refresh} />
          : rows.length === 0 ? <EmptyState title={t('tenderTitle')} body={t('noTenderItems')} />
            : (
              <div className="mp-tableWrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: '36px' }}>
                        <button type="button" className="mp-link mp-caption"
                          onClick={() => { setSelectedItems(new Set(rows.map(row => row.id))) }}>☑</button>
                      </th>
                      <th scope="col">{t('colClause')}</th>
                      <th scope="col">{t('fieldStatus')}</th>
                      <th scope="col">{t('colResponse')}</th>
                      <th scope="col" style={{ width: '64px' }}>{t('colDetail')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="checkbox" checked={selectedItems.has(row.id)} disabled={workflow.busy}
                            aria-label={row.normalizedRequirement}
                            onChange={() => { setSelectedItems(current => {
                              const next = new Set(current)
                              if (next.has(row.id)) next.delete(row.id)
                              else next.add(row.id)
                              return next
                            }) }}
                          />
                        </td>
                        <td className="mp-cellMain">{row.normalizedRequirement}</td>
                        <td><Tag tone={statusTone(row.status)}>{t(`tenderStatus.${row.status}` as MarketPilotTextKey)}</Tag></td>
                        <td className="mp-muted">{(row.responseDraft ?? '—').slice(0, 60)}</td>
                        <td>
                          <button type="button" className="mp-link" onClick={() => { setDrawer(row) }}>{t('colDetail')}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      {drawer === null ? null : (
        <div className="mp-drawerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) setDrawer(null) }}>
          <aside ref={drawerRef} className="mp-drawer" role="dialog" aria-label={t('tenderTitle')}>
            <div className="mp-drawerHead">
              <h2 className="mp-drawerTitle">{drawer.clauseId ?? t('colClause')}</h2>
              <button type="button" className="mp-link" onClick={() => { setDrawer(null) }}>{t('close')}</button>
            </div>
            <div className="mp-drawerBody">
              <Tag tone={statusTone(drawer.status)}>{t(`tenderStatus.${drawer.status}` as MarketPilotTextKey)}</Tag>
              <h3 className="mp-drawerSection">{t('drawerOriginal')}</h3>
              <blockquote className="mp-quote">{drawer.originalText}</blockquote>
              {drawer.sourceLocator === undefined ? null : (
                <p className="mp-caption">{`${t('drawerLocator')}：${drawer.sourceLocator}`}</p>
              )}
              {drawer.sourceLocator !== undefined || drawer.sourceDocumentId !== undefined ? null : (
                <p className="mp-caption" role="note">{t('drawerNoLocator')}</p>
              )}
              <h3 className="mp-drawerSection">{t('colResponse')}</h3>
              <p>{drawer.responseDraft ?? '—'}</p>
              {drawer.risk === undefined ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('colRisk')}</h3>
                  <p>{drawer.risk}</p>
                </>
              )}
              {drawer.action === undefined ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('nextStepLabel')}</h3>
                  <p>{drawer.action}</p>
                </>
              )}
              <h3 className="mp-drawerSection">{t('evidenceRefs')}</h3>
              <p className="mp-caption">{drawer.evidenceIds.map(id => id.slice(0, 8)).join(' · ') || '—'}</p>
              {drawer.evidenceIds.length > 0 ? null : (
                <p className="mp-caption" role="note">
                  {`${t('tenderNeedsEvidence')} `}
                  {onGoEvidence === undefined ? null : (
                <button type="button" className="mp-link" onClick={onGoEvidence}>{t('tenderGoEvidence')}</button>
                  )}
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}