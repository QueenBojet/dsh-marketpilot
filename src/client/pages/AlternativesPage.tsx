/**
 * Route candidates compared side by side: 2-3 columns, each card leading with
 * name, composition, strengths, limitations and risk summaries (long text
 * clamped with an explicit expand/collapse toggle), the confirmed-requirement
 * coverage matrix in the same view, and a decision bar (selection + rationale)
 * that submits through the real Decision Gate — the model cannot select for
 * the user. On narrow viewports the bar rests in normal flow so it never
 * covers the body text.
 */
import { useMemo, useRef, useState } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AlternativeItem } from '../api.ts'
import { buildShortCodeIndex } from '../../domain/shortcodes.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { useToolWorkflow } from '../hooks/usePhase4.ts'
import { useDesignOverview } from '../hooks/useDesignOverview.ts'
import { useDrawerKeys } from '../hooks/useDrawerKeys.ts'
import { RecordLinks, DesignSyntheticNotice } from '../components/ArtifactContextNotice.tsx'
import { routeReview } from '../../domain/route-review.ts'
import type { MarketPilotActions } from '../stores.ts'
import { useStageAccess, workflowText } from '../components/ProjectWorkflowOverview.tsx'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

function coverageTone(level: string | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (level === 'full') return 'success'
  if (level === 'partial') return 'warning'
  if (level === 'none') return 'danger'
  return 'neutral'
}

/** One candidate column. */
function CandidateCard({ t, row, selected, busy, onSelect, clean }: {
  t: MarketPilotText
  row: AlternativeItem
  selected: boolean
  busy: boolean
  onSelect: (id: string) => void
  clean: (text: string) => string
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <article
      className="mp-altCard" data-selected={selected ? 'true' : 'false'} data-expanded={expanded ? 'true' : 'false'}
      aria-label={row.name}
    >
      <header className="mp-altCardHead">
        <input
          type="radio" name="route" checked={selected} disabled={busy}
          aria-label={row.name}
          onChange={() => { onSelect(row.id) }}
        />
        <h3 className="mp-altCardTitle">{row.name}</h3>
        <Tag tone={row.status === 'selected' ? 'success' : row.status === 'rejected' ? 'danger' : 'neutral'}>
          {row.status === 'selected' ? t('altStatusSelected')
            : row.status === 'rejected' ? t('altStatusRejected') : t('altStatusCandidate')}
        </Tag>
      </header>
      <p className="mp-altCardSummary">{clean(row.summary)}</p>
      <dl className="mp-altCardFacts">
        <dt>{t('altComponents')}</dt>
        <dd>{row.components.map(clean).join(' · ') || '—'}</dd>
        <dt>{t('altStrengths')}</dt>
        <dd>{row.strengths.map(clean).join('；') || '—'}</dd>
        <dt>{t('altLimitations')}</dt>
        <dd>{row.limitations.map(clean).join('；') || '—'}</dd>
        <dt>{t('altRisks')}</dt>
        <dd>{row.risks.map(clean).join('；') || '—'}</dd>
        <dt>{t('altUnknowns')}</dt>
        <dd className="mp-altUnknowns">{row.unknowns.map(clean).join('；') || '—'}</dd>
      </dl>
      <footer className="mp-altCardFoot">
        <span className="mp-caption">{`${t('colEvidence')}: ${String(row.evidenceIds.length)}`}</span>
        <button
          type="button" className="mp-link mp-caption" aria-expanded={expanded}
          onClick={event => { event.stopPropagation(); setExpanded(current => !current) }}
        >
          {expanded ? t('altCollapseAll') : t('altExpandAll')}
        </button>
      </footer>
    </article>
  )
}

/** Render the alternatives page. */
export function AlternativesPage({ t, projectId, actions }: { t: MarketPilotText; projectId: string; actions?: MarketPilotActions | undefined }) {
  const [selected, setSelected] = useState(''), [rationale, setRationale] = useState('')
  const [view, setView] = useState<'summary' | 'matrix'>('summary'), [batchId, setBatchId] = useState('')
  const [previewVersion, setPreviewVersion] = useState<string | null>(null), [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const previewRef = useDrawerKeys(previewVersion !== null, () => { setPreviewVersion(null) })
  const access = useStageAccess('S4'), data = useDesignOverview(projectId)
  const workflow = useToolWorkflow(projectId, ['marketpilot_alternative_generate', 'marketpilot_decision_confirm'], 'alternative_generation', t, data.refresh)
  const snapshot = data.snapshot
  const batches = (snapshot?.runs ?? []).filter(row => row.type === 'alternative_generation' && row.status === 'completed'
    && Array.isArray(row.output?.alternativeIds)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
  const batch = batches.find(row => row.id === batchId) ?? (batchId === 'all' ? undefined : batches[0])
  const batchIds = Array.isArray(batch?.output?.alternativeIds) ? batch.output.alternativeIds : null
  const rows = (snapshot?.alternatives ?? []).filter(row => batchIds === null || batchIds.includes(row.id))
  const confirmed = (snapshot?.requirements ?? []).filter(row => row.status === 'confirmed')
    .sort((a, b) => (a.priority === 'must' ? 0 : 1) - (b.priority === 'must' ? 0 : 1) || a.createdAt.localeCompare(b.createdAt))
  const codes = snapshot?.recordCodes ?? {}
  const codeIndex = useMemo(() => snapshot === null ? null : buildShortCodeIndex({ ...snapshot, codeBook: { seq: {}, codes: snapshot.recordCodes } }), [snapshot])
  const clean = (text: string): string => codeIndex?.replace(text) ?? text
  const chosen = rows.find(row => row.id === selected)
  const summary = chosen === undefined || snapshot === null ? null : routeReview(chosen, snapshot.requirements, snapshot.evidence)
  const busy = workflow.busy || starting
  const canReview = snapshot !== null && data.error === '' && access.reviewAllowed && !busy && confirmed.length > 0
    && chosen?.status === 'candidate' && rationale.trim() !== ''
  const stale = previewVersion !== null && previewVersion !== snapshot?.reviewVersion
  const submit = (): void => {
    if (!canReview || stale || chosen === undefined || previewVersion === null || startingRef.current) return
    startingRef.current = true; setStarting(true)
    void workflow.start('marketpilot_decision_confirm', { alternativeId: chosen.id, decision: 'selected', rationale: rationale.trim(),
      evidenceIds: chosen.evidenceIds, requirementIds: confirmed.map(row => row.id), expectedVersion: previewVersion })
      .then(() => { setPreviewVersion(null) }).catch(() => { /* useToolWorkflow displays the rejected request. */ })
      .finally(() => { startingRef.current = false; setStarting(false) })
  }
  const generate = (): void => {
    if (snapshot === null || !access.allowed || busy || confirmed.length === 0 || data.error !== '' || startingRef.current) return
    startingRef.current = true; setStarting(true)
    void workflow.start('marketpilot_alternative_generate', {}).catch(() => { /* Visible workflow error. */ })
      .finally(() => { startingRef.current = false; setStarting(false) })
  }
  return <div className="mp-altPage">
    <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('alternativesTitle')}</h2>
      <DesignSyntheticNotice t={t} snapshot={snapshot} />
    <div className="mp-toolbar">
      <button type="button" className="mp-primaryAction mp-headerNavItem" disabled={busy || !access.allowed || confirmed.length === 0 || snapshot === null || data.error !== ''} onClick={generate}>{t('generateAlternatives')}</button>
      <button type="button" className="mp-headerNavItem" aria-pressed={view === 'summary'} onClick={() => { setView('summary') }}>{t('design.summaryView')}</button>
      <button type="button" className="mp-headerNavItem" aria-pressed={view === 'matrix'} onClick={() => { setView('matrix') }}>{t('design.matrixView')}</button>
      {batches.length === 0 ? null : <select className="mp-searchInput" aria-label={t('design.routeBatch')} value={batchId || batches[0]?.id} onChange={event => { setBatchId(event.target.value); setSelected(''); setPreviewVersion(null) }}>
        {batches.map((row, i) => <option key={row.id} value={row.id}>{`v${batches.length - i} · ${row.updatedAt.slice(0, 16)}`}</option>)}
        <option value="all">{t('design.allRoutes')}</option>
      </select>}
    </div>
    {confirmed.length === 0 ? <p className="mp-caption" role="note">{workflowText(t, 'needConfirmed')}{actions === undefined ? null : <button className="mp-link" onClick={() => { actions.setSection('requirements') }}>{t('design.reviewRequirements')}</button>}</p> : null}
    {data.error !== '' ? <ErrorState t={t} message={data.error} onRetry={data.refresh} /> : snapshot === null ? <LoadingState t={t} /> : null}
    <WorkflowSurface t={t} run={workflow.run} execution={workflow.latest} busy={busy} error={workflow.error} label={t('generateAlternatives')}
      onAnswer={(answer, custom) => { void workflow.answer(answer, custom) }} onCancel={() => { void workflow.cancel() }} />
    {snapshot === null ? null : rows.length === 0 ? <EmptyState title={t('alternativesTitle')} body={t('noAlternatives')} /> : view === 'summary' ?
      <div className="mp-altGrid" data-count={String(Math.min(rows.length, 3))}>{rows.map(row => <CandidateCard key={row.id} t={t} row={row} selected={selected === row.id} busy={busy} onSelect={id => { setSelected(id); setPreviewVersion(null) }} clean={clean} />)}</div> :
      <div className="mp-tableWrap"><table className="mp-table mp-routeMatrix"><thead><tr><th scope="col">{t('colName')}</th>{rows.map(row => <th key={row.id} scope="col"><label><input type="radio" name="route" checked={selected === row.id} disabled={busy} aria-label={row.name} onChange={() => { setSelected(row.id); setPreviewVersion(null) }} />{row.name}</label></th>)}</tr></thead>
        <tbody>{(['summary', 'components', 'strengths', 'limitations', 'risks', 'unknowns'] as const).map(key => <tr key={key}><th scope="row">{t(({ summary: 'colResponse', components: 'altComponents', strengths: 'altStrengths', limitations: 'altLimitations', risks: 'altRisks', unknowns: 'altUnknowns' } as const)[key])}</th>
          {rows.map(row => <td key={row.id}>{clean(typeof row[key] === 'string' ? row[key] as string : (row[key] as string[]).join('；')) || '—'}</td>)}</tr>)}
          <tr><th scope="row">{t('evidenceRefs')}</th>{rows.map(row => <td key={row.id}><RecordLinks ids={row.evidenceIds} codes={codes} actions={actions} /></td>)}</tr>
        </tbody></table></div>}
    <p className="mp-caption">{t('design.matrixHint')}</p>
    {rows.length === 0 || confirmed.length === 0 ? null : <section className="mp-coverageBlock"><h3 className="mp-subTitle">{t('coverageTitle')}</h3><div className="mp-tableWrap"><table className="mp-table">
      <thead><tr><th scope="col">{t('colName')}</th>{rows.map(row => <th key={row.id} scope="col">{row.name}</th>)}</tr></thead><tbody>{confirmed.map(requirement => <tr key={requirement.id}>
        <td className="mp-cellMain"><RecordLinks ids={[requirement.id]} codes={codes} actions={actions} kind="requirement" /> {requirement.normalizedText}{requirement.priority === 'must' ? <Tag tone="neutral">MUST</Tag> : null}</td>
        {rows.map(row => <td key={row.id}><Tag tone={coverageTone(row.requirementCoverage[requirement.id])}>{t(`coverage.${row.requirementCoverage[requirement.id] ?? 'unknown'}` as MarketPilotTextKey)}</Tag></td>)}</tr>)}</tbody></table></div></section>}
    {rows.length === 0 ? null : <div className="mp-decisionBar"><div className="mp-decisionBarMain"><span className="mp-caption">{t('selectRoute')}</span><strong>{chosen?.name ?? t('altNoneSelected')}</strong></div>
      <textarea className="mp-dialogInput mp-decisionInput" placeholder={t('rationale')} value={rationale} aria-label={t('rationale')} disabled={busy} onChange={event => { setRationale(event.target.value); setPreviewVersion(null) }} />
      <button type="button" className="mp-primaryAction mp-headerNavItem" disabled={!canReview} onClick={() => { if (snapshot !== null && canReview) setPreviewVersion(snapshot.reviewVersion) }}>{t('submitDecision')}</button>
      {chosen?.status === 'selected' ? <p className="mp-caption">{t('design.alreadySelected')}</p> : null}
    </div>}
    {previewVersion === null || chosen === undefined || summary === null ? null : <div className="mp-dialogMask" role="presentation"><section ref={previewRef} className="mp-dialog" role="dialog" aria-modal="true" aria-label={t('design.decisionSummary')}>
      <h2 className="mp-dialogTitle">{t('design.decisionSummary')}</h2><strong>{chosen.name}</strong>
      <p>{`${t('design.mustCoverage')}: ${summary.full.length} / ${summary.must.length}`}</p><p className="mp-caption">{t('design.matrixHint')}</p>
      <h3 className="mp-subTitle">{t('design.mustGaps')}</h3><ul>{summary.gaps.map(row => <li key={row.id}><RecordLinks ids={[row.id]} codes={codes} actions={actions} kind="requirement" /> {row.normalizedText} · {t(`coverage.${chosen.requirementCoverage[row.id] ?? 'unknown'}` as MarketPilotTextKey)}</li>)}</ul>
      <h3 className="mp-subTitle">{t('design.unverifiedRisk')}</h3><ul>{[...chosen.risks, ...chosen.unknowns].map((text, i) => <li key={i}>{clean(text)}</li>)}{summary.unconfirmedMust.map(row => <li key={row.id}><RecordLinks ids={[row.id]} codes={codes} actions={actions} kind="requirement" /> {row.normalizedText} · {row.status}</li>)}</ul>
      {chosen.risks.length + chosen.unknowns.length + summary.unconfirmedMust.length === 0 ? <p className="mp-caption">{t('design.noRecordedRisk')}</p> : null}
      <h3 className="mp-subTitle">{t('design.verifiedSources')}</h3><RecordLinks ids={summary.verified.map(row => row.id)} codes={codes} actions={actions} />
      {summary.verified.length === 0 ? <p className="mp-caption">{t('design.noVerifiedSource')}</p> : null}
      <h3 className="mp-subTitle">{t('rationale')}</h3><p className="mp-quote">{rationale}</p>
      {stale ? <p className="mp-errorText" role="alert">{t('design.stalePreview')}</p> : null}
      {workflow.error === '' ? null : <p role="alert" className="mp-errorText">{workflow.error}</p>}
      <div className="mp-dialogActions"><button className="mp-headerNavItem" type="button" disabled={starting} onClick={() => { setPreviewVersion(null) }}>{t('close')}</button><button className="mp-primaryAction mp-headerNavItem" type="button" disabled={!canReview || stale} onClick={submit}>{t('design.openHumanGate')}</button></div>
    </section></div>}
  </div>
}
