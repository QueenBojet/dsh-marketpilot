/**
 * Phase 2 requirement workspace: upload documents, run the real extraction
 * workflow, watch its true step timeline, review the table, and confirm the
 * batch through the real Human Gate — with the runId bound to the exact
 * extraction batch, never a "first waiting run" guess.
 */
import { useEffect, useMemo, useState } from 'react'
import { api, type RequirementItem } from '../api.ts'
import { DocumentUploader } from '../components/DocumentUploader.tsx'
import { HumanReviewDialog } from '../components/HumanReviewDialog.tsx'
import { RequirementTable } from '../components/RequirementTable.tsx'
import { SourceDrawer } from '../components/SourceDrawer.tsx'
import { TaskProgress } from '../components/TaskProgress.tsx'
import { executionStore } from '../hooks/executionStore.ts'
import { useActiveRun, useDocuments, useExecutions, useRequirements } from '../hooks/useExecution.ts'
import { errorMessage } from '../hooks/useProjects.ts'
import type { ProjectFocus } from '../stores.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import { useStageAccess, workflowText } from '../components/ProjectWorkflowOverview.tsx'
import { useProjectReview } from '../hooks/useProjectReview.ts'
import { ReviewBacklog, ReviewImpact } from '../components/ReviewSupport.tsx'
import type { MarketPilotActions } from '../stores.ts'
import { formatTime } from '../format.ts'

const STATUS_FILTERS = ['all', 'proposed', 'confirmed', 'unknown', 'conflict'] as const

/** Render the requirements page for one project. */
export function RequirementsPage({ t, projectId, focus, actions }: {
  t: MarketPilotText
  projectId: string
  focus?: ProjectFocus | undefined
  actions?: MarketPilotActions | undefined
}) {
  const [kind, setKind] = useState('customer_requirement')
  const access = useStageAccess('S1')
  const [selectedDocs, setSelectedDocs] = useState<ReadonlySet<string>>(new Set())
  const [selectedRequirements, setSelectedRequirements] = useState<ReadonlySet<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('all'), [pageNumber, setPageNumber] = useState(1)
  const [batchChoice, setBatchChoice] = useState<string | undefined>()
  const review = useProjectReview(projectId)
  const selectedBatchId = batchChoice ?? review.snapshot?.batches.find(b => b.status === 'waiting_human' && !b.superseded)?.id ?? ''
  const batch = review.snapshot?.batches.find(b => b.id === selectedBatchId)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [inputsOpen, setInputsOpen] = useState(true)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const documents = useDocuments(projectId)
  const requirements = useRequirements(projectId,
    useMemo(() => ({ status: statusFilter, q: search, priority, page: pageNumber, pageSize: 25, ...selectedBatchId === '' ? {} : { runId: selectedBatchId } }), [statusFilter, search, priority, pageNumber, selectedBatchId]))
  const executions = useExecutions(projectId)
  const extractExecution = executions.find(execution => execution.tool === 'marketpilot_requirement_extract'
    && (execution.status === 'running' || execution.status === 'waiting_human' || execution.runId !== undefined))
  const confirmExecution = executions.find(execution => execution.tool === 'marketpilot_requirement_confirm'
    && !execution.lost && (execution.status === 'running' || execution.status === 'waiting_human'))
  const extractBusy = extractExecution !== undefined
    && !extractExecution.lost && (extractExecution.status === 'running' || extractExecution.status === 'waiting_human')
  const busy = extractBusy || confirmExecution !== undefined
  // The waiting batch is server truth: poll it whenever this page is mounted,
  // so a confirm works even when the extraction was started by another
  // browser session or before a page reload.
  const waitingRun = useActiveRun(projectId, 'requirement_analysis', true)

  /** Only the selected, resumable server batch may be confirmed. */
  const reviewRunId = batch?.status === 'waiting_human' && !batch.superseded ? batch.id : undefined
  const batchIds = new Set(reviewRunId === undefined || review.error !== '' || requirements.error !== '' ? [] : batch?.proposedIds ?? [])
  const visibleIds = new Set((requirements.page?.requirements ?? []).filter(r => r.status === 'proposed').map(r => r.id))
  const selectedInBatch = reviewRunId !== undefined && [...selectedRequirements].every(id => batchIds.has(id) && visibleIds.has(id))
  useEffect(() => { setSelectedRequirements(new Set()) }, [selectedBatchId, statusFilter, search, priority, pageNumber])
  useEffect(() => { if (review.snapshot !== null) { documents.refresh(); requirements.refresh() } }, [review.snapshot?.revision, documents.refresh, requirements.refresh])

  const toggle = (setter: typeof setSelectedDocs) => (id: string) => {
    setter(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startExtraction = (): void => {
    if (selectedDocs.size === 0 || busy || !access.allowed || documents.error !== '') return
    setError('')
    setNotice('')
    void executionStore.start('marketpilot_requirement_extract', { projectId, documentIds: [...selectedDocs] })
      .catch(e => { setError(errorMessage(e)) })
  }

  const confirmSelected = (): void => {
    const ids = [...selectedRequirements]
    if (ids.length === 0) {
      setError(t('confirmNeedsSelection'))
      return
    }
    if (busy || !selectedInBatch || review.error !== '' || requirements.error !== '') return
    if (reviewRunId === undefined) {
      setError(t('confirmNeedsRun'))
      return
    }
    setError('')
    setNotice(t('confirmQueued'))
    void executionStore.start('marketpilot_requirement_confirm', { projectId, requirementIds: ids, runId: reviewRunId })
      .catch(e => { setError(errorMessage(e)) })
  }

  // Refresh data exactly once per settled execution (callId:status marker);
  // the same pattern useToolWorkflow uses — never a render-phase side effect.
  const settled = executions.find(execution => ['completed', 'failed', 'cancelled'].includes(execution.status)
    && (execution.tool === 'marketpilot_requirement_extract' || execution.tool === 'marketpilot_requirement_confirm'))
  const settleMarker = settled === undefined ? '' : `${settled.callId}:${settled.status}`
  const [seenMarker, setSeenMarker] = useState('')
  useEffect(() => {
    if (settleMarker === '' || settleMarker === seenMarker) return
    setSeenMarker(settleMarker)
    if (settled?.status === 'completed' && settled.tool === 'marketpilot_requirement_confirm') {
      const value = settled.value?.data as { run?: { status?: string } } | undefined
      setNotice(t(value?.run?.status === 'completed' ? 'baselineGenerated' : 'review.partial'))
      setSelectedRequirements(new Set())
    }
    documents.refresh()
    requirements.refresh()
    review.refresh()
  }, [settleMarker, seenMarker, settled, t, documents.refresh, requirements.refresh])

  // The confirm execution gates on the requirement review question.
  const gating = confirmExecution?.status === 'waiting_human' ? confirmExecution : undefined
  const progressVisible = busy || extractExecution?.lost === true || waitingRun !== null

  // A cross-module jump (e.g. from the evidence drawer) opens the referenced
  // requirement's source drawer even when the table's current filter, search,
  // or pagination excludes it: the exact record is fetched by id as a fallback.
  const focusId = focus?.kind === 'requirement' ? focus.id : undefined
  const [remoteRequirement, setRemoteRequirement] = useState<RequirementItem | null>(null)
  const [drawerReadError, setDrawerReadError] = useState('')
  useEffect(() => {
    if (focusId !== undefined) setDrawerId(focusId)
  }, [focusId, projectId])
  useEffect(() => {
    setRemoteRequirement(null)
    setDrawerReadError('')
    if (drawerId === null) return
    let cancelled = false
    api.requirement(projectId, drawerId)
      .then(result => {
        if (result.requirement?.id !== drawerId) throw new Error('REQUIREMENT_DETAIL_INVALID')
        if (!cancelled) setRemoteRequirement(result.requirement)
      })
      .catch(e => { if (!cancelled) setDrawerReadError(errorMessage(e)) })
    return () => { cancelled = true }
  }, [drawerId, projectId, review.snapshot?.revision])
  const drawer = remoteRequirement?.id === drawerId ? remoteRequirement
    : requirements.page?.requirements.find(item => item.id === drawerId) ?? null

  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('sectionRequirements')}</h2>

      <details className="mp-reviewBlock" open={inputsOpen} onToggle={event => { setInputsOpen(event.currentTarget.open) }}>
      <summary>{t('review.inputs')}</summary>
      <h3 className="mp-subTitle">{t('docsTitle')}</h3>
      <DocumentUploader t={t} projectId={projectId} kind={kind} onKindChange={setKind} onUploaded={() => { documents.refresh(); review.refresh() }} />
      {documents.error !== '' ? <p className="mp-errorText" role="alert">{documents.error}</p>
        : documents.loading ? <p className="mp-caption">{t('loading')}</p>
        : documents.documents === null || documents.documents.length === 0 ? <p className="mp-caption">{t('docsEmpty')}</p>
          : (
            <ul className="mp-docList">
              {documents.documents.map(doc => (
                <li key={doc.id} className="mp-docItem">
                  <label>
                    <input
                      type="checkbox" checked={selectedDocs.has(doc.id)} disabled={busy}
                      onChange={() => { toggle(setSelectedDocs)(doc.id) }}
                    />
                    <span className="mp-cellMain">{doc.name}</span>
                    <span className="mp-caption">{` · ${doc.kind} · ${String(doc.bytes)} B`}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
      <div className="mp-toolbar">
        <button
          type="button" className="mp-headerNavItem mp-primaryAction"
          disabled={busy || !access.allowed || documents.error !== '' || selectedDocs.size === 0}
          onClick={startExtraction}
        >
          {`${t('extractSelected')}（${String(selectedDocs.size)}）`}
        </button>
        {extractBusy && extractExecution !== undefined ? (
          <button type="button" className="mp-link" onClick={() => { void executionStore.cancel(extractExecution.callId) }}>
            {t('cancelTask')}
          </button>
        ) : null}
      </div>
      {selectedDocs.size === 0 ? <p className="mp-caption">{workflowText(t, 'selectDocuments')}</p> : null}
      </details>
      <h3 className="mp-subTitle">{t('review.execution')}</h3>

      {progressVisible ? (
        <TaskProgress
          t={t} run={waitingRun} active={busy}
          startedAt={extractExecution?.startedAt ?? waitingRun?.startedAt ?? new Date().toISOString()}
        />
      ) : null}
      {extractExecution?.lost === true ? (
        <div className="mp-nextHint" role="alert">
          <strong>{t('interruptTitle')}</strong>
          <span>{t('interruptBody')}</span>
        </div>
      ) : null}

      <h3 className="mp-subTitle">{t('review.results')}</h3>
      <div className="mp-toolbar"><label className="mp-caption">{t('review.batch')}{' '}<select aria-label={t('review.batch')} className="mp-kindSelect" value={selectedBatchId}
        onChange={e => { setBatchChoice(e.target.value); setPageNumber(1) }}><option value="">{t('review.allBatches')}</option>
        {review.snapshot?.batches.map(b => <option key={b.id} value={b.id}>{`${formatTime(b.startedAt)} · ${b.id.slice(0, 8)} · ${b.superseded ? t('review.history') : t(`runStatus.${b.status}` as MarketPilotTextKey)}`}</option>)}</select></label>
        <label className="mp-caption">{t('review.priority')}{' '}<select aria-label={t('review.priority')} className="mp-kindSelect" value={priority} onChange={e => { setPriority(e.target.value); setPageNumber(1) }}>
          <option value="all">{t('reqFilterAll')}</option>{['must', 'should', 'could'].map(p => <option key={p} value={p}>{t(`priority.${p}` as MarketPilotTextKey)}</option>)}
        </select></label>
        <button type="button" className="mp-link" onClick={() => { review.refresh(); requirements.refresh() }}>{t('workflow.refresh')}</button>
      </div>
      {review.error === '' ? null : <p role="alert" className="mp-errorText">{review.error}</p>}
      <p className="mp-caption">{t('review.scope')}</p>
      {reviewRunId === undefined ? <p className="mp-caption">{t('review.noBatch')}</p> : <p className="mp-caption">{Object.entries(batch?.counts ?? {}).map(([status, n]) => `${t(`requirementStatus.${status}` as MarketPilotTextKey)} ${n}`).join(' · ')}</p>}
      <div className="mp-toolbar">
        {STATUS_FILTERS.map(filter => (
          <button
            key={filter} type="button" className="mp-headerNavItem"
            aria-current={statusFilter === filter ? 'page' : undefined}
            onClick={() => { setStatusFilter(filter); setPageNumber(1) }}
          >
            {filter === 'all' ? t('reqFilterAll') : t(`requirementStatus.${filter}` as MarketPilotTextKey)}
          </button>
        ))}
        <input
          type="search" className="mp-searchInput" placeholder={t('reqSearchPlaceholder')}
          value={search} onChange={event => { setSearch(event.target.value); setPageNumber(1) }}
        />
        <span className="mp-toolbarSpacer" />
        <button
          type="button" className="mp-headerNavItem mp-primaryAction"
          disabled={busy || review.error !== '' || requirements.error !== '' || selectedRequirements.size === 0 || !selectedInBatch}
          title={!selectedInBatch ? t('confirmNeedsRun') : reviewRunId === undefined ? t('confirmNeedsRun') : ''}
          onClick={confirmSelected}
        >
          {`${t('confirmSelectedReq')}（${String(selectedRequirements.size)}）`}
        </button>
      </div>
      <p className="mp-caption" role="status">{`${t('review.selection')}: ${requirements.page?.requirements.length ?? '—'} / ${requirements.error !== '' ? '—' : requirements.page?.total ?? '—'} / ${selectedRequirements.size}`}</p>
      {notice === '' ? null : <p className="mp-caption" role="status">{notice}</p>}
      {error === '' ? null : <p className="mp-errorText" role="alert">{error}</p>}
      {drawerReadError === '' ? null : <p className="mp-errorText" role="alert">{drawerReadError}</p>}
      {drawerReadError !== '' && drawerId !== null && drawer === null ? <p className="mp-errorText" role="alert">{t('jumpMissing')}</p> : null}
      {requirements.error !== '' ? <p className="mp-errorText" role="alert">{requirements.error}</p>
        : requirements.loading ? <p className="mp-caption">{t('loading')}</p>
        : (
          <RequirementTable
            t={t} rows={requirements.page?.requirements ?? []}
            selected={selectedRequirements}
            eligibleIds={batchIds}
            onToggle={toggle(setSelectedRequirements)}
            onSelectProposed={() => {
              const proposed = (requirements.page?.requirements ?? []).filter(item => item.status === 'proposed' && batchIds.has(item.id))
              setSelectedRequirements(new Set(proposed.map(item => item.id)))
            }}
            onOpenDetail={item => { setDrawerId(item.id) }}
          />
        )}

      <div className="mp-toolbar"><button type="button" className="mp-link" disabled={pageNumber <= 1} onClick={() => { setPageNumber(pageNumber - 1) }}>{t('review.previous')}</button>
        <span className="mp-caption">{pageNumber}</span><button type="button" className="mp-link" disabled={requirements.page === null || pageNumber * 25 >= requirements.page.total} onClick={() => { setPageNumber(pageNumber + 1) }}>{t('review.next')}</button></div>
      {actions === undefined ? null : <ReviewBacklog t={t} snapshot={review.error === '' ? review.snapshot : null} actions={actions} />}
      <ReviewImpact t={t} snapshot={review.error === '' ? review.snapshot : null} actions={actions} />
      {drawer !== null ? <SourceDrawer t={t} item={drawer} projectId={projectId} related={review.error === '' ? review.snapshot?.links[drawer.id] : undefined} onEvidence={actions === undefined ? undefined : id => { actions.focusRecord('evidence', 'evidence', id) }} onClose={() => { setDrawerId(null) }} /> : null}
      {gating !== undefined ? (
        <HumanReviewDialog
          t={t} execution={gating} busy={reviewBusy}
          onAnswer={(selectedAnswer, custom) => {
            setReviewBusy(true)
            executionStore.answer(gating.callId, selectedAnswer, custom)
              .then(() => { setReviewBusy(false) })
              .catch(e => { setReviewBusy(false); setError(errorMessage(e)) })
          }}
          onCancel={() => {
            setReviewBusy(true)
            executionStore.cancel(gating.callId)
              .then(() => { setReviewBusy(false) })
              .catch(e => { setReviewBusy(false); setError(errorMessage(e)) })
          }}
        />
      ) : null}
    </div>
  )
}
