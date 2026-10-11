/**
 * Project artifacts: metadata list with reviewStatus badges and a reader view
 * that renders markdown through the shared untrusted-GFM renderer — never a
 * raw <pre> — preserving UNKNOWN sections and citations. The reader is a true
 * single-column document layout (no reserved side rail), with a readable
 * measure, horizontally scrollable tables, and business short codes in place
 * of raw UUIDs plus a collapsible code map for traceability. Export goes
 * through the guarded `marketpilot_artifact_export` tool (a real human gate)
 * with an explicit new absolute path; the browser never writes files itself.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownText, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { CodeMapPanel } from '../components/CodeMapPanel.tsx'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { formatTime } from '../format.ts'
import { executionStore } from '../hooks/executionStore.ts'
import { useArtifact } from '../hooks/useExecution.ts'
import { useDesignOverview } from '../hooks/useDesignOverview.ts'
import { ArtifactContextNotice, DesignSyntheticNotice } from '../components/ArtifactContextNotice.tsx'
import type { MarketPilotActions, ProjectFocus } from '../stores.ts'
import { buildShortCodeIndex } from '../../domain/shortcodes.ts'
import { useDrawerKeys } from '../hooks/useDrawerKeys.ts'
import { useToolWorkflow } from '../hooks/usePhase4.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

/** reviewStatus → Tag tone; draft stays amber until the human review. */
function reviewTone(reviewStatus: string): 'warning' | 'success' {
  return reviewStatus === 'approved' ? 'success' : 'warning'
}

/** Render the artifacts list for one project. */
export function ArtifactsPage({ t, projectId, actions, focus }: { t: MarketPilotText; projectId: string; actions?: MarketPilotActions | undefined; focus?: ProjectFocus | undefined }) {
  const [openId, setOpenId] = useState<string | null>(focus?.kind === 'artifact' ? focus.id : null)
  useEffect(() => { if (focus?.kind === 'artifact') setOpenId(focus.id) }, [focus])
  const readerRef = useDrawerKeys(openId !== null, () => { setOpenId(null) })
  const [exportPath, setExportPath] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const exportStarting = useRef(false)
  const [notice, setNotice] = useState('')
  const list = useDesignOverview(projectId)
  const detail = useArtifact(projectId, openId)
  const snapshot = list.snapshot
  const codeIndex = useMemo(() => snapshot === null ? null : buildShortCodeIndex({ ...snapshot, codeBook: { seq: {}, codes: snapshot.recordCodes } }), [snapshot])
  const workflow = useToolWorkflow(projectId, ['marketpilot_artifact_export'], 'artifact_export',
    t, list.refresh)
  if (list.error !== '') return <ErrorState t={t} message={list.error} onRetry={list.refresh} />
  if (snapshot === null) return <LoadingState t={t} />
  const artifacts = snapshot.artifacts
  const startExport = (): void => {
    const target = artifacts.find(row => row.id === openId)
    if (target === undefined || exportPath.trim() === '' || exportStarting.current || workflow.busy) return
    exportStarting.current = true
    setExportBusy(true)
    setNotice('')
    executionStore.start('marketpilot_artifact_export',
      { projectId, artifactId: target.id, path: exportPath.trim() })
      .then(() => { setOpenId(null) })
      .catch(() => { setNotice(t('exportFailed')) })
      .finally(() => { exportStarting.current = false; setExportBusy(false) })
  }
  const displayContent = detail.artifact === null || detail.artifact.format !== 'markdown'
    ? null
    : codeIndex === null ? detail.artifact.content : codeIndex.replace(detail.artifact.content)
  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('artifactsTitle')}</h2>
      <DesignSyntheticNotice t={t} snapshot={snapshot} />
      {artifacts.length === 0 ? (
        <EmptyState title={t('noArtifacts')} body={t('plannedBody')} />
      ) : (
        <div className="mp-tableWrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th scope="col">{t('colName')}</th>
                <th scope="col">{t('colType')}</th>
                <th scope="col">{t('fieldStatus')}</th>
                <th scope="col">{t('colCreated')}</th>
                <th scope="col">{t('colUpdated')}</th>
                <th scope="col" style={{ width: '72px' }}>{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.map(artifact => (
                <tr key={artifact.id}>
                  <td className="mp-cellMain">{snapshot.recordCodes[artifact.id]} · {artifact.name}<p className="mp-caption" data-context={artifact.context.status}>{t(`design.context.${artifact.context.status}` as MarketPilotTextKey)}</p></td>
                  <td className="mp-muted">{artifact.type}</td>
                  <td><Tag tone={reviewTone(artifact.reviewStatus)}>{t(`reviewStatus.${artifact.reviewStatus}` as MarketPilotTextKey)}</Tag></td>
                  <td className="mp-muted">{formatTime(artifact.createdAt)}</td>
                  <td className="mp-muted">{formatTime(artifact.updatedAt)}</td>
                  <td>
                    <button type="button" className="mp-link" onClick={() => { setOpenId(artifact.id) }}>
                      {t('openArtifact')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <WorkflowSurface
        t={t} run={workflow.run} execution={workflow.latest} busy={workflow.busy} error={workflow.error}
        label={t('exportArtifact')}
        onAnswer={(selected, custom) => { void workflow.answer(selected, custom) }}
        onCancel={() => { void workflow.cancel() }}
      />
      {notice === '' ? null : <p className="mp-errorText" role="alert">{notice}</p>}
      {openId === null ? null : (
        <div className="mp-drawerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) setOpenId(null) }}>
          <aside ref={readerRef} className="mp-reader mp-readerWide" role="dialog" aria-label={t('artifactsTitle')}>
            <div className="mp-drawerHead">
              <h2 className="mp-drawerTitle">{detail.artifact?.name ?? t('loading')}</h2>
              <button type="button" className="mp-link" onClick={() => { setOpenId(null) }}>{t('close')}</button>
            </div>
            {artifacts.find(row => row.id === openId) === undefined ? null : <ArtifactContextNotice t={t} artifact={artifacts.find(row => row.id === openId)!} codes={snapshot.recordCodes} actions={actions} />}
            <div className="mp-exportBar">
              <span className="mp-caption">{t('exportHint')}</span>
              <input
                className="mp-searchInput" style={{ flex: '1 1 260px' }} type="text"
                placeholder={t('exportPathPlaceholder')} value={exportPath}
                aria-label={t('exportPathPlaceholder')}
                onChange={event => { setExportPath(event.target.value) }}
              />
              <button
                type="button" className="mp-primaryAction mp-headerNavItem"
                disabled={exportBusy || workflow.busy || exportPath.trim() === ''}
                title={exportPath.trim() === '' ? t('exportPathPlaceholder') : undefined}
                onClick={startExport}
              >
                {t('exportArtifact')}
              </button>
            </div>
            <div className="mp-readerBody mp-readerBodyWide">
              {detail.error !== '' ? <ErrorState t={t} message={detail.error} />
                : detail.loading ? <LoadingState t={t} />
                  : detail.artifact === null ? null
                    : detail.artifact.format === 'markdown' ? (
                      <article className="mp-readerSingle">
                        <CodeMapPanel t={t} index={codeIndex} />
                        <MarkdownText
                          text={displayContent ?? ''}
                          labels={{ code: { copyLabel: t('mdCopy'), copiedLabel: t('mdCopied') }, footnotes: t('mdFootnotes') }}
                        />
                      </article>
                    ) : (
                      <pre className="mp-dialogPre">{detail.artifact.content}</pre>
                    )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
