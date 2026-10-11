import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { errorMessage } from '../hooks/useProjects.ts'
import type { ProjectReviewOverview } from '../../domain/project-review.ts'
import type { MarketPilotText } from '../locales.ts'
import type { MarketPilotActions } from '../stores.ts'

/** Source documents are untrusted text: display literally, never interpret as instructions. */
export function DocumentSource({ t, projectId, documentId }: { t: MarketPilotText; projectId: string; documentId: string }) {
  const [opened, setOpened] = useState(false), [text, setText] = useState<string | null>(null), [error, setError] = useState('')
  useEffect(() => {
    if (!opened) return
    let stopped = false
    setText(null); setError('')
    api.document(projectId, documentId).then(r => {
      if (r.document?.id !== documentId || typeof r.document.textContent !== 'string') throw new Error('DOCUMENT_DETAIL_INVALID')
      if (!stopped) setText(r.document.textContent)
    })
      .catch(e => { if (!stopped) setError(errorMessage(e)) })
    return () => { stopped = true }
  }, [opened, projectId, documentId])
  return <div className="mp-sourcePreview">
    <button type="button" className="mp-link" aria-expanded={opened} onClick={() => { setOpened(!opened) }}>{t('review.sourceText')}</button>
    {!opened ? null : error !== '' ? <p role="alert" className="mp-errorText">{error}</p> : text === null ? <p className="mp-caption">{t('loading')}</p> : <pre>{text}</pre>}
  </div>
}
export function ReviewImpact({ t, snapshot, actions }: { t: MarketPilotText; snapshot: ProjectReviewOverview | null; actions?: MarketPilotActions | undefined }) {
  if (snapshot === null) return null
  return <details className="mp-reviewBlock mp-secondaryDetails"><summary>{t('review.impact')}</summary>
    <p className="mp-caption">{t('review.impactHint')}</p>
    {snapshot.impacts.length === 0 ? <p className="mp-caption">{t('review.noImpact')}</p> : <ul>{snapshot.impacts.map(i => <li key={i.id}>
      <code>{i.code}</code>{' '}{i.name}{' · '}{i.possiblyStale ? t('workflow.possiblyStale') : t('review.recheck')}{' '}
      {actions === undefined ? null : <button type="button" className="mp-link" onClick={() => { actions.setSection(i.section) }}>{t('review.viewResult')}</button>}
    </li>)}</ul>}
    {actions === undefined ? null : <div className="mp-taskActions"><button type="button" className="mp-link" onClick={() => { actions.setSection('requirements') }}>{t('review.addSource')}</button>
      <button type="button" className="mp-link" onClick={() => { actions.setSection('research') }}>{t('review.continueResearch')}</button></div>}
  </details>
}
export function ReviewBacklog({ t, snapshot, actions }: { t: MarketPilotText; snapshot: ProjectReviewOverview | null; actions: MarketPilotActions }) {
  if (snapshot === null) return null
  return <details className="mp-reviewBlock"><summary>{`${t('review.backlog')} · ${snapshot.issues.length}`}</summary>
    <p className="mp-caption">{t('review.backlogHint')}</p>
    <ul className="mp-backlogList">{snapshot.issues.map(item => <li key={`${item.origin}-${item.id}`}>
      <strong>{`${item.code} · ${item.title}`}</strong><p className="mp-caption">{item.reason}</p>
      <p className="mp-relatedLinks">
      {item.evidenceIds.map(id => <button key={id} type="button" className="mp-link" onClick={() => { actions.focusRecord('evidence', 'evidence', id) }}>{`${t('review.inspectEvidence')} ${snapshot.recordCodes?.[id] ?? id.slice(0, 8)}`}</button>)}
      {item.requirementIds.map(id => <button key={id} type="button" className="mp-link" onClick={() => { actions.focusRecord('requirements', 'requirement', id) }}>{`${t('review.inspectRequirement')} ${snapshot.recordCodes?.[id] ?? id.slice(0, 8)}`}</button>)}
      {item.origin === 'tender' ? <button type="button" className="mp-link" onClick={() => { actions.setSection('tender') }}>{t('sectionTender')}</button> : null}
      </p>
    </li>)}</ul>
    <button type="button" className="mp-link" onClick={() => { actions.setSection('requirements') }}>{t('review.addSource')}</button>
  </details>
}
