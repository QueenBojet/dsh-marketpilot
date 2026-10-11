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
import { useMemo, useRef, useState } from 'react'
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
import { useStageAccess } from '../components/ProjectWorkflowOverview.tsx'

/** Split a markdown document into its heading outline. */
function outline(markdown: string): { level: number; text: string; index: number }[] {
  const headings: { level: number; text: string; index: number }[] = []
  let index = 0
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (delimiter !== undefined) {
      if (fence === null) fence = delimiter
      else if (delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue
    const match = /^(#{1,3})\s+(.+)$/.exec(line)
    if (match !== null) {
      headings.push({ level: match[1]!.length, text: match[2]!.trim(), index })
      index += 1
    }
  }
  return headings
}

/** Approval timestamps do not reorder generation versions. */
function byNewest(left: { createdAt: string; id: string }, right: { createdAt: string; id: string }): number {
  return right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id)
}

/** Render the solution page. */
export function SolutionPage({ t, projectId, actions }: { t: MarketPilotText; projectId: string; actions?: MarketPilotActions | undefined }) {
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
  const reader = useArtifact(projectId, open && selected !== null ? selected.id : null)
  const codeIndex = useMemo(() => snapshot === null ? null : buildShortCodeIndex({ ...snapshot, codeBook: { seq: {}, codes: snapshot.recordCodes } }), [snapshot])
  const displayContent = reader.artifact === null ? null
    : codeIndex === null ? reader.artifact.content : codeIndex.replace(reader.artifact.content)

  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('solutionTitle')}</h2>
      <DesignSyntheticNotice t={t} snapshot={snapshot} />
      {decisionConfirmed ? null : <div className="mp-nextHint" role="note"><span>{t('noDecisionYet')}</span></div>}
      <div className="mp-toolbar">
        <button
          type="button" className="mp-primaryAction mp-headerNavItem"
          disabled={!decisionConfirmed || !access.allowed || workflow.busy || starting || data.error !== ''}
          onClick={() => {
            if (!decisionConfirmed || !access.allowed || data.error !== '' || workflow.busy || startingRef.current) return
            startingRef.current = true; setStarting(true)
            void workflow.start('marketpilot_solution_generate', access.stage?.action.args ?? {}).catch(() => { /* WorkflowSurface displays failure. */ })
              .finally(() => { startingRef.current = false; setStarting(false) })
          }}
        >
          {t('generateSolution')}
        </button>
        {selected === null ? null : (
          <button type="button" className="mp-headerNavItem" onClick={() => { setOpen(current => !current) }}>
            {t('openArtifact')}
          </button>
        )}
      </div>
      {data.error === '' ? null : <ErrorState t={t} message={data.error} onRetry={data.refresh} />}
      {data.error !== '' || selected === null || snapshot === null ? null : <ArtifactContextNotice t={t} artifact={selected} codes={snapshot.recordCodes} actions={actions} />}
      {solutions.length === 0 ? null : (
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
      <p className="mp-caption" style={{ marginTop: '8px' }}>{t('solutionUnknownHint')}</p>
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
                  : <SolutionBody t={t} content={displayContent ?? ''} codeIndex={codeIndex} snapshot={snapshot} artifact={selected} actions={actions} />}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function SolutionBody({ t, content, codeIndex, snapshot, artifact, actions }: {
  t: MarketPilotText
  content: string
  codeIndex: ReturnType<typeof buildShortCodeIndex> | null
  snapshot: DesignOverview | null
  artifact: DesignOverview['artifacts'][number]
  actions?: MarketPilotActions | undefined
}) {
  const documentRef = useRef<HTMLDivElement | null>(null)
  const [railOpen, setRailOpen] = useState(true)
  const headings = outline(content)
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
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const backToTop = (): void => {
    documentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="mp-readerLayout" data-rail={railOpen ? 'open' : 'closed'}>
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
