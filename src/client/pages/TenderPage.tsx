/**
 * Tender compliance: clause extraction and review through the real tools.
 * A clause marked compliant requires verified FACT/SOURCE evidence — the
 * server downgrades anything weaker to unknown, and the page states so.
 * The response drawer shows business short codes (EVD/REQ/TND) instead of
 * raw UUIDs, with the full mapping one level down in the project context.
 */
import { useMemo, useRef, useState } from 'react'
import type { DesignOverview } from '../../services/design-overview.ts'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { CodeMapPanel } from '../components/CodeMapPanel.tsx'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { useDrawerKeys } from '../hooks/useDrawerKeys.ts'
import { useToolWorkflow } from '../hooks/usePhase4.ts'
import { useDesignOverview } from '../hooks/useDesignOverview.ts'
import { buildShortCodeIndex } from '../../domain/shortcodes.ts'
import type { MarketPilotActions } from '../stores.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import { useStageAccess, workflowText } from '../components/ProjectWorkflowOverview.tsx'

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'quiet' {
  if (status === 'compliant') return 'success'
  if (status === 'partially_compliant') return 'warning'
  if (status === 'non_compliant') return 'danger'
  if (status === 'not_applicable') return 'quiet'
  return 'neutral'
}

/** Render the tender page. */
export function TenderPage({ t, projectId, actions, onGoEvidence }: {
  t: MarketPilotText
  projectId: string
  actions?: MarketPilotActions | undefined
  onGoEvidence?: (() => void) | undefined
}) {
  const [selectedDocs, setSelectedDocs] = useState<ReadonlySet<string>>(new Set())
  const access = useStageAccess('S6')
  const [selectedItems, setSelectedItems] = useState<ReadonlySet<string>>(new Set())
  const [drawer, setDrawer] = useState<DesignOverview['tenderItems'][number] | null>(null)
  const data = useDesignOverview(projectId), snapshot = data.snapshot
  const [q, setQ] = useState(''), [filter, setFilter] = useState('all'), [page, setPage] = useState(1)
  const [starting, setStarting] = useState(false), startingRef = useRef(false)
  const codeIndex = useMemo(() => snapshot === null ? null : buildShortCodeIndex({ ...snapshot, codeBook: { seq: {}, codes: snapshot.recordCodes } }), [snapshot])
  const codeOf = (id: string): string => codeIndex?.codeOf(id) ?? id.slice(0, 8)
  const workflow = useToolWorkflow(projectId,
    ['marketpilot_tender_extract', 'marketpilot_tender_review'], 'tender_review', t, data.refresh)
  const drawerRef = useDrawerKeys(drawer !== null, () => { setDrawer(null) })
  const rows = snapshot?.tenderItems ?? []
  const tenderDocs = (snapshot?.documents ?? []).filter(doc => doc.kind === 'tender' && doc.hasText)
  const selectedDocIds = tenderDocs.filter(doc => selectedDocs.has(doc.id)).map(doc => doc.id)
  const filtered = rows.filter(row => (filter === 'all' || row.status === filter)
    && [row.originalText, row.normalizedRequirement, row.clauseId ?? '', codeOf(row.id)].join(' ').toLowerCase().includes(q.trim().toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / 12)), currentPage = Math.min(page, pages)
  const visible = filtered.slice((currentPage - 1) * 12, currentPage * 12)
  const selectedItemIds = visible.filter(row => selectedItems.has(row.id)).map(row => row.id)
  const busy = workflow.busy || starting
  const start = (tool: string, args: Record<string, unknown>): void => {
    if (busy || !access.allowed || snapshot === null || data.error !== '' || startingRef.current) return
    startingRef.current = true; setStarting(true)
    void workflow.start(tool, args).catch(() => { /* WorkflowSurface reports the rejection. */ })
      .finally(() => { startingRef.current = false; setStarting(false) })
  }
  const matrix = (snapshot?.artifacts ?? []).filter(row => row.type === 'compliance_matrix').sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0]


  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('tenderTitle')}</h2>
      {data.error !== '' ? <ErrorState t={t} message={data.error} onRetry={data.refresh} /> : snapshot === null ? <LoadingState t={t} />
        : tenderDocs.length === 0 ? <section className="mp-artifactContext" data-status="skipped_optional"><strong>{t('design.optionalTender')}</strong><p className="mp-caption">{t('design.optionalTenderHint')}</p>{actions === undefined ? null : <div className="mp-toolbar"><button type="button" className="mp-link" onClick={() => { actions.setSection('artifacts') }}>{t('design.goArtifacts')}</button><button type="button" className="mp-link" onClick={() => { actions.setSection('requirements') }}>{t('design.addTender')}</button></div>}</section>
          : (
            <ul className="mp-docList">
              {tenderDocs.map(doc => (
                <li key={doc.id} className="mp-docItem">
                  <label>
                    <input
                      type="checkbox" checked={selectedDocs.has(doc.id)} disabled={busy}
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
          disabled={busy || !access.allowed || data.error !== '' || selectedDocIds.length === 0}
          onClick={() => { if (selectedDocIds.length > 0) start('marketpilot_tender_extract', { documentIds: selectedDocIds }) }}
        >
          {t('tenderExtract')}
        </button>
        <button
          type="button" className="mp-primaryAction mp-headerNavItem"
          disabled={busy || !access.allowed || data.error !== '' || selectedItemIds.length === 0}
          title={selectedItemIds.length === 0 ? t('reviewTenderNeedsSelection') : undefined}
          onClick={() => { if (selectedItemIds.length > 0) start('marketpilot_tender_review', { tenderItemIds: selectedItemIds }) }}
        >
          {`${t('reviewTenderSelected')}（${String(selectedItemIds.length)}）`}
        </button>
        <button
          type="button" className="mp-headerNavItem"
          disabled={busy || !access.allowed || data.error !== '' || rows.length === 0}
          onClick={() => { if (rows.length > 0) start('marketpilot_tender_review', { tenderItemIds: rows.map(row => row.id) }) }}
        >
          {t('reviewTenderAll')}
        </button>
      </div>
      {selectedDocs.size === 0 ? <p className="mp-caption">{workflowText(t, 'selectDocuments')}</p> : null}
      {tenderDocs.some(doc => doc.synthetic) ? <p className="mp-caption">{t('design.synthetic')}</p> : null}
      {matrix === undefined || actions === undefined ? null : <button type="button" className="mp-headerNavItem" onClick={() => { actions.focusRecord('artifacts', 'artifact', matrix.id) }}>{t('design.exportCompliance')}</button>}
      <WorkflowSurface
        t={t} run={workflow.run} execution={workflow.latest} busy={workflow.busy} error={workflow.error}
        label={t('tenderReview')}
        onAnswer={(selected, custom) => { void workflow.answer(selected, custom) }}
        onCancel={() => { void workflow.cancel() }}
      />
      <p className="mp-caption" style={{ marginTop: '8px' }}>{t('tenderCompliantNeedsEvidence')}</p>
      <div className="mp-toolbar"><input className="mp-searchInput" aria-label={t('design.tenderSearch')} placeholder={t('design.tenderSearch')} value={q} onChange={event => { setQ(event.target.value); setSelectedItems(new Set()); setPage(1) }} /><select className="mp-searchInput" aria-label={t('design.tenderStatus')} value={filter} onChange={event => { setFilter(event.target.value); setSelectedItems(new Set()); setPage(1) }}><option value="all">{t('reqFilterAll')}</option>{['unknown', 'compliant', 'partially_compliant', 'non_compliant', 'not_applicable'].map(value => <option key={value} value={value}>{t(`tenderStatus.${value}` as MarketPilotTextKey)}</option>)}</select></div>
      <p className="mp-caption">{t('design.visibleSelection')}{` · ${selectedItemIds.length} / ${visible.length} · ${filtered.length} / ${rows.length}`}</p>
      {snapshot === null || data.error !== '' ? null
          : rows.length === 0 ? <EmptyState title={t('tenderTitle')} body={t('noTenderItems')} />
            : (
              <div className="mp-tableWrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: '36px' }}>
                        <button type="button" className="mp-link mp-caption"
                          onClick={() => { setSelectedItems(new Set(visible.map(row => row.id))) }}>{t('design.selectVisible')}</button>
                      </th>
                      <th scope="col">{t('colClause')}</th>
                      <th scope="col">{t('fieldStatus')}</th>
                      <th scope="col">{t('colResponse')}</th>
                      <th scope="col" style={{ width: '64px' }}>{t('colDetail')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(row => (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="checkbox" checked={selectedItems.has(row.id)} disabled={busy}
                            aria-label={row.normalizedRequirement}
                            onChange={() => { setSelectedItems(current => {
                              const next = new Set(current)
                              if (next.has(row.id)) next.delete(row.id)
                              else next.add(row.id)
                              return next
                            }) }}
                          />
                        </td>
                        <td className="mp-cellMain">{codeOf(row.id)} · {row.normalizedRequirement}</td>
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
      {filtered.length === 0 && rows.length > 0 ? <p>{t('design.noResults')}</p> : null}
      {pages <= 1 ? null : <div className="mp-toolbar"><button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedItems(new Set()) }}>‹</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => { setPage(currentPage + 1); setSelectedItems(new Set()) }}>›</button></div>}
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
              <p className="mp-relatedLinks">
                {drawer.evidenceIds.length === 0 ? '—' : drawer.evidenceIds.map(id => (
                  actions === undefined ? <code key={id}>{codeOf(id)}</code> : (
                    <button
                      key={id} type="button" className="mp-link" title={t('jumpToRecord')}
                      onClick={() => { actions.focusRecord('evidence', 'evidence', id) }}
                    >
                      {codeOf(id)}
                    </button>
                  )
                ))}
              </p>
              {drawer.requirementIds.length === 0 ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('relatedTitle')}</h3>
                  <p className="mp-relatedLinks">
                    {drawer.requirementIds.map(id => (
                      actions === undefined ? <code key={id}>{codeOf(id)}</code> : (
                        <button
                          key={id} type="button" className="mp-link" title={t('jumpToRecord')}
                          onClick={() => { actions.focusRecord('requirements', 'requirement', id) }}
                        >
                          {codeOf(id)}
                        </button>
                      )
                    ))}
                  </p>
                </>
              )}
              <CodeMapPanel t={t} index={codeIndex} />
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
