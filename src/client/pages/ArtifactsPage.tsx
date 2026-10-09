/**
 * Project artifacts: metadata list with reviewStatus badges and a reader view
 * that renders markdown through the shared untrusted-GFM renderer — never a
 * raw <pre> — preserving UNKNOWN sections and citations.
 */
import { useState } from 'react'
import { MarkdownText, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { useArtifact, useArtifacts } from '../hooks/useExecution.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import type { ArtifactMetaRow } from '../api.ts'

/** reviewStatus → Tag tone; draft stays amber until the human review. */
function reviewTone(reviewStatus: string): 'warning' | 'success' {
  return reviewStatus === 'approved' ? 'success' : 'warning'
}

/** Render the artifacts list for one project. */
export function ArtifactsPage({ t, projectId }: { t: MarketPilotText; projectId: string }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useArtifacts(projectId)
  const detail = useArtifact(projectId, openId)
  if (list.error !== '') return <ErrorState t={t} message={list.error} onRetry={list.refresh} />
  if (list.loading) return <LoadingState t={t} />
  const artifacts = list.artifacts ?? []
  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('artifactsTitle')}</h2>
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
                <th scope="col">{t('colUpdated')}</th>
                <th scope="col" style={{ width: '72px' }}>{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.map((artifact: ArtifactMetaRow) => (
                <tr key={artifact.id}>
                  <td className="mp-cellMain">{artifact.name}</td>
                  <td className="mp-muted">{artifact.type}</td>
                  <td><Tag tone={reviewTone(artifact.reviewStatus)}>{t(`reviewStatus.${artifact.reviewStatus}` as MarketPilotTextKey)}</Tag></td>
                  <td className="mp-muted">{artifact.updatedAt.slice(0, 10)}</td>
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
      {openId === null ? null : (
        <div className="mp-drawerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) setOpenId(null) }}>
          <aside className="mp-reader" role="dialog" aria-label={t('artifactsTitle')}>
            <div className="mp-drawerHead">
              <h2 className="mp-drawerTitle">{detail.artifact?.name ?? t('loading')}</h2>
              <button type="button" className="mp-link" onClick={() => { setOpenId(null) }}>{t('close')}</button>
            </div>
            <div className="mp-readerBody">
              {detail.error !== '' ? <ErrorState t={t} message={detail.error} />
                : detail.loading ? <LoadingState t={t} />
                  : detail.artifact === null ? null
                    : detail.artifact.format === 'markdown' ? (
                      <MarkdownText
                        text={detail.artifact.content}
                        labels={{ code: { copyLabel: t('mdCopy'), copiedLabel: t('mdCopied') }, footnotes: t('mdFootnotes') }}
                      />
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
