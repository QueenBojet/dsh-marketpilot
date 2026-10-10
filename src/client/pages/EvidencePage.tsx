/**
 * Evidence ledger: filter by review status and kind, inspect a statement's
 * source, and verify it through the real Human Gate. UNKNOWN is never promoted
 * to fact by this page — verification is always an explicit human action.
 */
import { useEffect, useState } from 'react'
import type { EvidenceItem } from '../api.ts'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { CodeMapPanel } from '../components/CodeMapPanel.tsx'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { useDrawerKeys } from '../hooks/useDrawerKeys.ts'
import { useEvidencePage, useToolWorkflow } from '../hooks/usePhase4.ts'
import { useCodeIndex } from '../shortCodes.ts'
import type { ProjectFocus } from '../stores.ts'
import type { MarketPilotActions } from '../stores.ts'
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

/** The verify form's selectable target kinds (the guarded tool's real enum). */
const VERIFY_TARGET_KINDS = ['FACT', 'SOURCE', 'ASSUMPTION', 'INFERENCE', 'UNKNOWN', 'REJECT'] as const

/** Localized label for one verify target kind. */
function targetLabel(t: MarketPilotText, kind: string): string {
  if (kind === 'UNKNOWN') return t('verifyTargetUnknown')
  if (kind === 'REJECT') return t('verifyTargetReject')
  return t(`evidenceKind.${kind}` as MarketPilotTextKey)
}

/** Render the evidence ledger page. */
export function EvidencePage({ t, projectId, actions, focus }: {
  t: MarketPilotText
  projectId: string
  actions: MarketPilotActions
  focus?: ProjectFocus | undefined
}) {
  const [status, setStatus] = useState<string>('all')
  const [kind, setKind] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [targetKind, setTargetKind] = useState('')
  const [statement, setStatement] = useState('')
  const ledger = useEvidencePage(projectId, { status, kind, q: query })
  const { index: codeIndex } = useCodeIndex(projectId)
  const codeOf = (id: string): string => codeIndex?.codeOf(id) ?? id.slice(0, 8)
  const workflow = useToolWorkflow(projectId, ['marketpilot_evidence_verify'], 'evidence_review', t, ledger.refresh)
  // A cross-module jump (e.g. from the tender drawer) opens the referenced
  // record's drawer directly; closing it again keeps it closed.
  const focusId = focus?.kind === 'evidence' ? focus.id : undefined
  useEffect(() => {
    if (focusId !== undefined) setOpenId(focusId)
  }, [focusId])
  const open = ledger.page?.evidence.find(row => row.id === openId) ?? null
  const closeDrawer = (): void => {
    setOpenId(null)
    setVerifying(false)
    setTargetKind('')
    setStatement('')
  }
  const drawerRef = useDrawerKeys(open !== null, closeDrawer)
  const beginVerify = (): void => {
    if (open === null) return
    setVerifying(true)
    setTargetKind('')
    setStatement(open.statement)
  }
  const submitVerify = (): void => {
    if (open === null || workflow.busy) return
    if (targetKind === '' || statement.trim() === '') return
    void workflow.start('marketpilot_evidence_verify', {
      projectId, evidenceId: open.id, method: 'human',
      targetKind, statement: statement.trim(), supportingEvidenceIds: open.supportingEvidenceIds,
    })
    setVerifying(false)
  }

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
        <div className="mp-drawerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) closeDrawer() }}>
          <aside ref={drawerRef} className="mp-drawer" role="dialog" aria-label={t('evidenceTitle')}>
            <div className="mp-drawerHead">
              <h2 className="mp-drawerTitle">
                {open.title}
                {' '}
                <code className="mp-caption">{codeOf(open.id)}</code>
              </h2>
              <button type="button" className="mp-link" onClick={closeDrawer}>{t('close')}</button>
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
                {open.sourceUrl === undefined ? null : <>{' · '}<a className="mp-link" href={open.sourceUrl} target="_blank" rel="noreferrer">{open.sourceUrl}</a></>}
              </p>
              {open.sourceLocator !== undefined || open.sourceDocumentId !== undefined ? null : (
                <p className="mp-caption" role="note">{t('drawerNoLocator')}</p>
              )}
              {open.relatedRequirementIds.length === 0 ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('relatedTitle')}</h3>
                  <p className="mp-relatedLinks">
                    {open.relatedRequirementIds.map(id => (
                      <button
                        key={id} type="button" className="mp-link"
                        title={t('jumpToRecord')}
                        onClick={() => { actions.focusRecord('requirements', 'requirement', id) }}
                      >
                        {codeOf(id)}
                      </button>
                    ))}
                  </p>
                </>
              )}
              {open.supportingEvidenceIds.length === 0 || verifying ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('evidenceRefs')}</h3>
                  <p className="mp-relatedLinks">
                    {open.supportingEvidenceIds.map(id => (
                      <button
                        key={id} type="button" className="mp-link"
                        title={t('jumpToRecord')}
                        onClick={() => { actions.focusRecord('evidence', 'evidence', id) }}
                      >
                        {codeOf(id)}
                      </button>
                    ))}
                  </p>
                </>
              )}
              <CodeMapPanel t={t} index={codeIndex} />
              {open.status !== 'draft' ? null : verifying ? (
                <div className="mp-verifyForm">
                  <p className="mp-caption">{t('verifyFormHint')}</p>
                  <label className="mp-caption" htmlFor="mp-verify-target">{t('verifyTargetKind')}</label>
                  <select
                    id="mp-verify-target" className="mp-kindSelect" value={targetKind}
                    onChange={event => { setTargetKind(event.target.value) }}
                  >
                    <option value="">{t('verifyTargetPlaceholder')}</option>
                    {VERIFY_TARGET_KINDS.map(option => (
                      <option key={option} value={option}>{targetLabel(t, option)}</option>
                    ))}
                  </select>
                  <label className="mp-caption" htmlFor="mp-verify-statement">{t('verifyStatementLabel')}</label>
                  <textarea
                    id="mp-verify-statement" className="mp-dialogInput" value={statement}
                    onChange={event => { setStatement(event.target.value) }}
                  />
                  {open.supportingEvidenceIds.length === 0 ? null : (
                    <p className="mp-caption">{`${t('evidenceRefs')}: ${open.supportingEvidenceIds.join(' · ')}`}</p>
                  )}
                  <p className="mp-caption">{t('verifyUnknownProtected')}</p>
                  <div className="mp-taskActions">
                    <button type="button" className="mp-link" disabled={workflow.busy} onClick={() => { setVerifying(false) }}>
                      {t('cancel')}
                    </button>
                    <button
                      type="button" className="mp-primaryAction mp-headerNavItem"
                      disabled={workflow.busy || targetKind === '' || statement.trim() === ''}
                      onClick={submitVerify}
                    >
                      {t('verifySubmit')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mp-taskActions">
                  <button
                    type="button" className="mp-primaryAction mp-headerNavItem" disabled={workflow.busy}
                    onClick={beginVerify}
                  >
                    {t('verifyStart')}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}