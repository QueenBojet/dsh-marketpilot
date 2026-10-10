/**
 * Phase 2 requirement workspace: upload documents, run the real extraction
 * workflow, watch its true step timeline, review the table, and confirm the
 * batch through the real Human Gate — with the runId bound to the exact
 * extraction batch, never a "first waiting run" guess.
 */
import { useEffect, useMemo, useState } from 'react'
import type { RequirementItem } from '../api.ts'
import { DocumentUploader } from '../components/DocumentUploader.tsx'
import { HumanReviewDialog } from '../components/HumanReviewDialog.tsx'
import { RequirementTable } from '../components/RequirementTable.tsx'
import { SourceDrawer } from '../components/SourceDrawer.tsx'
import { TaskProgress } from '../components/TaskProgress.tsx'
import { executionStore } from '../hooks/executionStore.ts'
import { useActiveRun, useDocuments, useExecutions, useRequirements } from '../hooks/useExecution.ts'
import { errorMessage } from '../hooks/useProjects.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

const STATUS_FILTERS = ['all', 'proposed', 'confirmed', 'unknown', 'conflict'] as const

/** Render the requirements page for one project. */
export function RequirementsPage({ t, projectId }: { t: MarketPilotText; projectId: string }) {
  const [kind, setKind] = useState('customer_requirement')
  const [selectedDocs, setSelectedDocs] = useState<ReadonlySet<string>>(new Set())
  const [selectedRequirements, setSelectedRequirements] = useState<ReadonlySet<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState<RequirementItem | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const documents = useDocuments(projectId)
  const requirements = useRequirements(projectId,
    useMemo(() => ({ status: statusFilter, q: search, pageSize: 100 }), [statusFilter, search]))
  const executions = useExecutions(projectId)
  const extractExecution = executions.find(execution => execution.tool === 'marketpilot_requirement_extract'
    && (execution.status === 'running' || execution.status === 'waiting_human' || execution.runId !== undefined))
  const confirmExecution = executions.find(execution => execution.tool === 'marketpilot_requirement_confirm'
    && (execution.status === 'running' || execution.status === 'waiting_human'))
  const extractBusy = extractExecution !== undefined
    && (extractExecution.status === 'running' || extractExecution.status === 'waiting_human')
  const busy = extractBusy || confirmExecution !== undefined
  // The waiting batch is server truth: poll it whenever this page is mounted,
  // so a confirm works even when the extraction was started by another
  // browser session or before a page reload.
  const waitingRun = useActiveRun(projectId, 'requirement_analysis', true)

  /** The exact waiting batch: the server's waiting run, or a just-settled
   * tracked extraction's run before the runs poll refreshes. */
  const reviewRunId = waitingRun !== null && waitingRun.status === 'waiting_human'
    ? waitingRun.id
    : extractExecution?.runId !== undefined && waitingRun === null ? extractExecution.runId : undefined
  const batchIds = new Set(waitingRun?.output?.requirementIds ?? [])
  const selectedInBatch = reviewRunId === undefined
    || (batchIds.size > 0 && [...selectedRequirements].every(id => batchIds.has(id)))

  const toggle = (setter: typeof setSelectedDocs) => (id: string) => {
    setter(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startExtraction = (): void => {
    if (selectedDocs.size === 0 || busy) return
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
    if (busy) return
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
      setNotice(t('baselineGenerated'))
      setSelectedRequirements(new Set())
    }
    documents.refresh()
    requirements.refresh()
  }, [settleMarker, seenMarker, settled, t, documents.refresh, requirements.refresh])

  // The confirm execution gates on the requirement review question.
  const gating = confirmExecution?.status === 'waiting_human' ? confirmExecution : undefined
  const progressVisible = busy || extractExecution?.lost === true || waitingRun !== null

  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('sectionRequirements')}</h2>

      <h3 className="mp-subTitle">{t('docsTitle')}</h3>
      <DocumentUploader t={t} projectId={projectId} kind={kind} onKindChange={setKind} onUploaded={documents.refresh} />
      {documents.loading ? <p className="mp-caption">{t('loading')}</p>
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
          disabled={busy || selectedDocs.size === 0}
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

      <h3 className="mp-subTitle">{t('reqTitle')}</h3>
      <div className="mp-toolbar">
        {STATUS_FILTERS.map(filter => (
          <button
            key={filter} type="button" className="mp-headerNavItem"
            aria-current={statusFilter === filter ? 'page' : undefined}
            onClick={() => { setStatusFilter(filter) }}
          >
            {filter === 'all' ? t('reqFilterAll') : t(`requirementStatus.${filter}` as MarketPilotTextKey)}
          </button>
        ))}
        <input
          type="search" className="mp-searchInput" placeholder={t('reqSearchPlaceholder')}
          value={search} onChange={event => { setSearch(event.target.value) }}
        />
        <span className="mp-toolbarSpacer" />
        <button
          type="button" className="mp-headerNavItem mp-primaryAction"
          disabled={busy || selectedRequirements.size === 0 || !selectedInBatch}
          title={!selectedInBatch ? t('confirmNeedsRun') : reviewRunId === undefined ? t('confirmNeedsRun') : ''}
          onClick={confirmSelected}
        >
          {`${t('confirmSelectedReq')}（${String(selectedRequirements.size)}）`}
        </button>
      </div>
      {notice === '' ? null : <p className="mp-caption" role="status">{notice}</p>}
      {error === '' ? null : <p className="mp-errorText" role="alert">{error}</p>}
      {requirements.error !== '' ? <p className="mp-errorText" role="alert">{requirements.error}</p> : null}
      {requirements.loading ? <p className="mp-caption">{t('loading')}</p>
        : (
          <RequirementTable
            t={t} rows={requirements.page?.requirements ?? []}
            selected={selectedRequirements}
            onToggle={toggle(setSelectedRequirements)}
            onSelectProposed={() => {
              const proposed = (requirements.page?.requirements ?? []).filter(item => item.status === 'proposed')
              setSelectedRequirements(new Set(proposed.map(item => item.id)))
            }}
            onOpenDetail={setDrawer}
          />
        )}

      {drawer !== null ? <SourceDrawer t={t} item={drawer} onClose={() => { setDrawer(null) }} /> : null}
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
