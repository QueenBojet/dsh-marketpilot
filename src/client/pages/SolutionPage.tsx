/**
 * Solution generation and preview. Generation stays disabled until a human
 * Decision exists, and the rendered markdown keeps its UNKNOWN sections —
 * unverified parameters are never presented as commitments. The preview picks
 * the NEWEST solution artifact by createdAt (id as stable
 * tie-breakers), offers the version history, and reads it in a wide document
 * reader whose outline entries scroll to the matching heading. Reading
 * surfaces show business short codes instead of raw UUIDs (display-only
 * replacement over the stored artifact, backed by a collapsible code map).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { CodeMapPanel } from '../components/CodeMapPanel.tsx'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { formatTime } from '../format.ts'
import { useArtifact } from '../hooks/useExecution.ts'
import { useDesignOverview } from '../hooks/useDesignOverview.ts'
import { ArtifactContextNotice, RecordLinks, DesignSyntheticNotice } from '../components/ArtifactContextNotice.tsx'
import type { DesignOverview } from '../../services/design-overview.ts'
import type { MarketPilotActions } from '../stores.ts'
import { buildShortCodeIndex } from '../../domain/shortcodes.ts'
import { useDrawerKeys } from '../hooks/useDrawerKeys.ts'
import { useToolWorkflow } from '../hooks/usePhase4.ts'
import type { MarketPilotText } from '../locales.ts'
import { useGuidedMode, useStageAccess } from '../components/ProjectWorkflowOverview.tsx'
import { guidedText } from '../guidedWorkflow.ts'
import { savedSolutionRoute, solutionOutline, solutionSummary } from '../solutionPresentation.ts'

/** Approval timestamps do not reorder generation versions. */
function byNewest(left: { createdAt: string; id: string }, right: { createdAt: string; id: string }): number {
  return right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id)
}

/** Render the solution page. */
export function SolutionPage({ t, projectId, actions }: { t: MarketPilotText; projectId: string; actions?: MarketPilotActions | undefined }) {
  const guided = useGuidedMode()
  const [initialHeading, setInitialHeading] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const access = useStageAccess('S5')
  const readerRef = useDrawerKeys(open, () => { setOpen(false) })
  const [versionId, setVersionId] = useState<string | null>(null)
  const data = useDesignOverview(projectId)
  const snapshot = data.snapshot
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const workflow = useToolWorkflow(projectId, ['marketpilot_solution_generate'], 'solution_generation',
    t, data.refresh)
  const decisionConfirmed = snapshot?.activeDecisionId != null
    && snapshot.decisions.some(d => d.id === snapshot.activeDecisionId)
    && snapshot.requirements.some(r => r.status === 'confirmed')
  const solutions = (snapshot?.artifacts ?? []).filter(row => row.type === 'solution').sort(byNewest)
  const latest = solutions[0] ?? null
  const selected = solutions.find(row => row.id === versionId) ?? latest
  const reader = useArtifact(projectId, (guided || open) && selected !== null ? selected.id : null)
  const codeIndex = useMemo(() => snapshot === null ? null : buildShortCodeIndex({ ...snapshot, codeBook: { seq: {}, codes: snapshot.recordCodes } }), [snapshot])
  const displayContent = reader.artifact === null ? null
    : codeIndex === null ? reader.artifact.content : codeIndex.replace(reader.artifact.content)
  const summaryText = displayContent === null ? null : solutionSummary(displayContent)
  const summaryAudit = summaryText?.split('\n').filter(line => /^\s*[-*]?\s*人工\s*Decision[：:]/i.test(line)).join('\n') ?? ''
  const summaryPreview = summaryText?.split('\n').filter(line => !/^\s*[-*]?\s*人工\s*Decision[：:]/i.test(line)).join('\n') ?? null
  const savedRoute = displayContent === null ? null : savedSolutionRoute(displayContent)
  const headings = displayContent === null ? [] : solutionOutline(displayContent)
  const openReader = (heading: number | null = null) => { setInitialHeading(heading); setOpen(true) }
  const generate = () => {
    if (!decisionConfirmed || !access.allowed || data.error !== '' || workflow.busy || startingRef.current) return
    startingRef.current = true; setStarting(true)
    void workflow.start('marketpilot_solution_generate', access.stage?.action.args ?? {}).catch(() => { /* WorkflowSurface displays failure. */ })
      .finally(() => { startingRef.current = false; setStarting(false) })
  }

  return (
    <div className={guided ? 'mp-businessPage mp-solutionPage' : undefined}>
      {guided ? null : <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('solutionTitle')}</h2>}
      <DesignSyntheticNotice t={t} snapshot={snapshot} />
      {decisionConfirmed ? null : <div className="mp-nextHint" role="note"><span>{t('noDecisionYet')}</span></div>}
      {guided && selected !== null && snapshot !== null && data.error === '' ? <>
        <section className="mp-businessCard mp-solutionOutcome">
          <header className="mp-businessResultHead"><div><p className="mp-guidedEyebrow">{guidedText(t, 'solutionOutcome')}</p><h3>{guidedText(t, 'solutionDocument')}</h3>
            <p>{`${snapshot.recordCodes[selected.id]} · ${selected.name} · ${guidedText(t, selected.reviewStatus === 'approved' ? 'approved' : 'draft')}`}</p></div>
            <div className="mp-businessActions"><button className="mp-primaryAction mp-headerNavItem" type="button" onClick={() => { openReader() }}>{t('openArtifact')}</button>
              <button className="mp-link" type="button" disabled={actions === undefined} onClick={() => { actions?.focusRecord('artifacts', 'artifact', selected.id) }}>{guidedText(t, 'reviewExport')}</button></div></header>
          <div className="mp-solutionVersionSelect"><label>{t('solutionVersions')} <select aria-label={t('solutionVersions')} value={selected.id} onChange={e => { setVersionId(e.target.value); setInitialHeading(null) }}>
            {solutions.map((row, index) => <option key={row.id} value={row.id}>{`${snapshot.recordCodes[row.id]} · ${formatTime(row.createdAt)}${index === 0 ? ` · ${t('solutionLatest')}` : ''}`}</option>)}
          </select></label><span>{formatTime(selected.createdAt)}</span></div>
          {selected.context.status === 'current' ? null : <p className="mp-businessNotice">{t(selected.context.status === 'untracked' ? 'design.legacyContextHint' : 'design.staleContextHint')}</p>}
          <div className="mp-solutionSummary"><h4>{guidedText(t, 'solutionSummary')}</h4>
            {reader.error !== '' ? <ErrorState t={t} message={reader.error} /> : reader.artifact === null ? <LoadingState t={t} /> : summaryText === null
              ? <p className="mp-caption">{guidedText(t, 'summaryAbsent')}</p> : <div className="mp-solutionExcerpt"><MarkdownText text={summaryPreview ?? ''}
                labels={{ code: { copyLabel: t('mdCopy'), copiedLabel: t('mdCopied') }, footnotes: t('mdFootnotes') }} /></div>}
          </div>
          <div className="mp-solutionRoute"><span>{guidedText(t, 'mainRoute')}</span><strong>{savedRoute ?? guidedText(t, 'savedRouteAbsent')}</strong></div>
        </section>
        <section className="mp-businessCard mp-solutionContents"><header><h3>{t('solutionToc')}</h3><button type="button" className="mp-link" onClick={() => { openReader() }}>{guidedText(t, 'readFullSolution')}</button></header>
          <ol>{headings.map(heading => <li key={heading.index}><button type="button" className="mp-link" onClick={() => { openReader(heading.index) }}>{heading.text}</button></li>)}</ol>
        </section>
        <details className="mp-businessDetails mp-solutionAudit"><summary>{guidedText(t, 'solutionAudit')}</summary><ArtifactContextNotice t={t} artifact={selected} codes={snapshot.recordCodes} actions={actions} />
          {summaryAudit === '' ? null : <MarkdownText text={summaryAudit} labels={{ code: { copyLabel: t('mdCopy'), copiedLabel: t('mdCopied') }, footnotes: t('mdFootnotes') }} />}
          <p className="mp-caption">{t('solutionUnknownHint')}</p><p className="mp-caption">{t('design.projectIssuesHint')}</p><ul>{snapshot.evidence.filter(e => !['rejected', 'superseded'].includes(e.status) && (e.kind === 'UNKNOWN' || e.status !== 'verified')).map(e => <li key={e.id}>
            <RecordLinks ids={[e.id]} codes={snapshot.recordCodes} actions={actions} /><span>{e.title} · {e.kind} / {e.status}</span></li>)}</ul>
        </details>
      </> : null}
      {guided && selected !== null ? <details className="mp-businessDetails"><summary>{guidedText(t, 'regenerateSolution')}</summary><p className="mp-caption">{guidedText(t, 'regenerateHint')}</p>
        <button type="button" className="mp-primaryAction mp-headerNavItem" disabled={!decisionConfirmed || !access.allowed || workflow.busy || starting || data.error !== ''} onClick={generate}>{t('generateSolution')}</button>
      </details> : <div className="mp-toolbar">
        <button
          type="button" className="mp-primaryAction mp-headerNavItem"
          disabled={!decisionConfirmed || !access.allowed || workflow.busy || starting || data.error !== ''}
          onClick={generate}
        >
          {t('generateSolution')}
        </button>
        {selected === null ? null : (
          <button type="button" className="mp-headerNavItem" onClick={() => { setInitialHeading(null); setOpen(current => !current) }}>
            {t('openArtifact')}
          </button>
        )}
      </div>}
      {data.error === '' ? null : <ErrorState t={t} message={data.error} onRetry={data.refresh} />}
      {guided || data.error !== '' || selected === null || snapshot === null ? null : <ArtifactContextNotice t={t} artifact={selected} codes={snapshot.recordCodes} actions={actions} />}
      {guided || solutions.length === 0 ? null : (
        <div className="mp-toolbar">
          <span className="mp-caption">{t('solutionVersions')}</span>
          {solutions.map((row, index) => (
            <button
              key={row.id} type="button" className="mp-headerNavItem"
              aria-current={selected?.id === row.id ? 'true' : undefined}
              onClick={() => { setVersionId(row.id); setOpen(true) }}
            >
              {`v${String(solutions.length - index)} · ${snapshot?.recordCodes[row.id] ?? ''} · ${formatTime(row.createdAt)}${index === 0 ? ` · ${t('solutionLatest')}` : ''}`}
            </button>
          ))}
        </div>
      )}
      <WorkflowSurface
        t={t} run={workflow.run} execution={workflow.latest} busy={workflow.busy} error={workflow.error}
        label={t('generateSolution')}
        onAnswer={(selectedAnswer, custom) => { void workflow.answer(selectedAnswer, custom) }}
        onCancel={() => { void workflow.cancel() }}
      />
      {guided ? null : <p className="mp-caption" style={{ marginTop: '8px' }}>{t('solutionUnknownHint')}</p>}
      {data.error !== '' ? null
        : snapshot === null ? <LoadingState t={t} />
          : latest === null ? <EmptyState title={t('solutionTitle')} body={t('noSolution')} />
            : null}
      {open && selected !== null ? (
        <div className="mp-drawerMask mp-readerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
          <aside ref={readerRef} className="mp-reader mp-readerWide" role="dialog" aria-label={t('solutionTitle')}>
            <div className="mp-drawerHead">
              <h2 className="mp-drawerTitle">{`${selected.name}${selected.id === latest?.id ? ` · ${t('solutionLatest')}` : ''}`}</h2>
              <button type="button" className="mp-link" onClick={() => { setOpen(false) }}>{t('close')}</button>
            </div>
            <div className="mp-readerBody mp-readerBodyWide">
              {data.error !== '' ? <ErrorState t={t} message={data.error} onRetry={data.refresh} />
                : reader.error !== '' ? <ErrorState t={t} message={reader.error} />
                : reader.artifact === null ? <LoadingState t={t} />
                  : <SolutionBody t={t} content={displayContent ?? ''} codeIndex={codeIndex} snapshot={snapshot} artifact={selected} actions={actions} guided={guided} initialHeading={initialHeading} />}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function SolutionBody({ t, content, codeIndex, snapshot, artifact, actions, guided, initialHeading }: {
  t: MarketPilotText
  content: string
  codeIndex: ReturnType<typeof buildShortCodeIndex> | null
  snapshot: DesignOverview | null
  artifact: DesignOverview['artifacts'][number]
  actions?: MarketPilotActions | undefined
  guided: boolean
  initialHeading: number | null
}) {
  const documentRef = useRef<HTMLDivElement | null>(null)
  const [railOpen, setRailOpen] = useState(!guided)
  const headings = solutionOutline(content)
  /** Headings that carry unknowns, assumptions, or risks — the review rail. */
  const attention = headings.filter(heading =>
    /UNKNOWN|未知|待确认|假设|风险/i.test(heading.text))
  const body = content.split(/^##\s+附录[：:]\s*编号对照/m)[0] ?? content
  const references = (snapshot?.evidence ?? []).filter(row => { const code = snapshot?.recordCodes[row.id]; return code !== undefined && new RegExp(`\\b${code}\\b`).test(body) })
  const issues = (snapshot?.evidence ?? []).filter(row => !['rejected', 'superseded'].includes(row.status) && (row.kind === 'UNKNOWN' || row.status !== 'verified'))
  const run = snapshot?.runs.find(row => row.id === artifact.workflowRunId)
  const decisionId = artifact.context.stored?.decisionId ?? (typeof run?.output?.decisionId === 'string' ? run.output.decisionId : null)
  const decision = snapshot?.decisions.find(row => row.id === decisionId)
  const codes = snapshot?.recordCodes ?? {}
  /** Scroll to the heading at its occurrence index, including duplicate titles. */
  const jumpTo = (index: number): void => {
    const root = documentRef.current
    if (root === null) return
    const target = root.querySelectorAll('.mp-solutionMarkdown h1, .mp-solutionMarkdown h2, .mp-solutionMarkdown h3')[index]
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  const backToTop = (): void => {
    documentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  useEffect(() => { if (initialHeading !== null) jumpTo(initialHeading) }, [initialHeading, content])
  return (
    <div className="mp-readerLayout" data-rail={railOpen ? 'open' : 'closed'} data-toc={headings.length > 0}>
      {headings.length === 0 ? null : (
        <nav className="mp-readerToc" aria-label={t('solutionToc')}>
          <button type="button" className="mp-readerTocItem mp-readerTocTop" onClick={backToTop}>
            {t('tocBackTop')}
          </button>
          {headings.map(heading => (
            <button
              key={`${heading.index}-${heading.text}`} type="button" className="mp-readerTocItem"
              data-level={heading.level}
              onClick={() => { jumpTo(heading.index) }}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      )}
      <div className="mp-readerDocument" ref={documentRef}>
        {snapshot === null ? null : <ArtifactContextNotice t={t} artifact={artifact} codes={codes} actions={actions} />}
        <CodeMapPanel t={t} index={codeIndex} />
        <div className="mp-solutionMarkdown"><MarkdownText
          text={content}
          labels={{ code: { copyLabel: t('mdCopy'), copiedLabel: t('mdCopied') }, footnotes: t('mdFootnotes') }}
        /></div>
      </div>
      {attention.length + issues.length + references.length === 0 && decision === undefined ? null : (
        <aside className="mp-readerRail" aria-label={t('solutionRailTitle')}>
          <header className="mp-readerRailHead">
            <h3>{t('solutionRailTitle')}</h3>
            <button type="button" className="mp-link mp-caption" onClick={() => { setRailOpen(current => !current) }}>
              {railOpen ? t('solutionRailCollapse') : t('solutionRailExpand')}
            </button>
          </header>
          {railOpen ? (
            <ul className="mp-readerRailList">
              {attention.map(heading => (
                <li key={`${heading.index}-${heading.text}`}>
                  <button type="button" className="mp-link" onClick={() => { jumpTo(heading.index) }}>
                    {heading.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {railOpen ? <>
            <h4>{t('design.recordedDecision')}</h4>
            {decision === undefined ? <p className="mp-caption">{t('design.decisionUnknown')}</p> : <><strong>{codes[decision.id]}</strong><p className="mp-caption">{codeIndex?.replace(decision.rationale) ?? decision.rationale}</p></>}
            <h4>{t('design.projectIssues')}</h4><p className="mp-caption">{t('design.projectIssuesHint')}</p>
            <ul className="mp-readerRailList" aria-label={t('design.projectIssues')}>{issues.map(row => <li key={row.id}><RecordLinks ids={[row.id]} codes={codes} actions={actions} /> <span>{row.kind} · {row.status}</span><p className="mp-caption">{row.title}</p></li>)}</ul>
            <h4>{t('design.sourceTrace')}</h4>
            {references.length === 0 ? <p className="mp-caption">{t('design.noTrace')}</p> : <ul className="mp-readerRailList" aria-label={t('design.sourceTrace')}>{references.map(row => <li key={row.id}><RecordLinks ids={[row.id]} codes={codes} actions={actions} /><p className="mp-caption">{row.title} · {row.kind} / {row.status}</p><p className="mp-caption">{row.sourceLocator ?? row.sourceName ?? '—'}</p></li>)}</ul>}
          </> : null}
          <p className="mp-caption">{t('solutionRailHint')}</p>
        </aside>
      )}
    </div>
  )
}
