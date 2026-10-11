/**
 * Solution generation and preview. Generation stays disabled until a human
 * Decision exists, and the rendered markdown keeps its UNKNOWN sections —
 * unverified parameters are never presented as commitments. The preview picks
 * the NEWEST solution artifact by updatedAt (createdAt/id as stable
 * tie-breakers), offers the version history, and reads it in a wide document
 * reader whose outline entries scroll to the matching heading. Reading
 * surfaces show business short codes instead of raw UUIDs (display-only
 * replacement over the stored artifact, backed by a collapsible code map).
 */
import { useMemo, useRef, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ArtifactMetaRow } from '../api.ts'
import { CodeMapPanel } from '../components/CodeMapPanel.tsx'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { formatTime } from '../format.ts'
import { useArtifact, useArtifacts } from '../hooks/useExecution.ts'
import { useDrawerKeys } from '../hooks/useDrawerKeys.ts'
import { useProjectDetail } from '../hooks/useProjects.ts'
import { useToolWorkflow } from '../hooks/usePhase4.ts'
import { projectShortCodeIndex } from '../shortCodes.ts'
import type { MarketPilotText } from '../locales.ts'
import { useStageAccess } from '../components/ProjectWorkflowOverview.tsx'

/** Split a markdown document into its heading outline. */
function outline(markdown: string): { level: number; text: string; index: number }[] {
  const headings: { level: number; text: string; index: number }[] = []
  let index = 0
  for (const line of markdown.split('\n')) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line)
    if (match !== null) {
      headings.push({ level: match[1]!.length, text: match[2]!.trim(), index })
      index += 1
    }
  }
  return headings
}

/** Order solution versions newest-first: updatedAt, then createdAt, then id. */
function byNewest(left: ArtifactMetaRow, right: ArtifactMetaRow): number {
  return right.updatedAt.localeCompare(left.updatedAt)
    || right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id)
}

/** Render the solution page. */
export function SolutionPage({ t, projectId }: { t: MarketPilotText; projectId: string }) {
  const [open, setOpen] = useState(false)
  const access = useStageAccess('S5')
  const readerRef = useDrawerKeys(open, () => { setOpen(false) })
  const [versionId, setVersionId] = useState<string | null>(null)
  const detail = useProjectDetail(projectId)
  const artifacts = useArtifacts(projectId)
  const workflow = useToolWorkflow(projectId, ['marketpilot_solution_generate'], 'solution_generation',
    t, artifacts.refresh)
  const decisionConfirmed = detail.error === '' && detail.detail?.project.activeDecisionId !== undefined
    && detail.detail.decisions.some(d => d.id === detail.detail?.project.activeDecisionId)
    && detail.detail.requirements.some(r => r.status === 'confirmed')
  const solutions = (artifacts.artifacts ?? []).filter(row => row.type === 'solution').sort(byNewest)
  const latest = solutions[0] ?? null
  const selected = solutions.find(row => row.id === versionId) ?? latest
  const reader = useArtifact(projectId, open && selected !== null ? selected.id : null)
  const codeIndex = useMemo(() => detail.detail === null ? null : projectShortCodeIndex(detail.detail), [detail.detail])
  const displayContent = reader.artifact === null ? null
    : codeIndex === null ? reader.artifact.content : codeIndex.replace(reader.artifact.content)

  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('solutionTitle')}</h2>
      {decisionConfirmed ? null : <div className="mp-nextHint" role="note"><span>{t('noDecisionYet')}</span></div>}
      <div className="mp-toolbar">
        <button
          type="button" className="mp-primaryAction mp-headerNavItem"
          disabled={!decisionConfirmed || !access.allowed || workflow.busy}
          onClick={() => { if (decisionConfirmed && access.allowed) void workflow.start('marketpilot_solution_generate', access.stage?.action.args ?? {}) }}
        >
          {t('generateSolution')}
        </button>
        {selected === null ? null : (
          <button type="button" className="mp-headerNavItem" onClick={() => { setOpen(current => !current) }}>
            {t('openArtifact')}
          </button>
        )}
      </div>
      {detail.error === '' ? null : <ErrorState t={t} message={detail.error} onRetry={detail.refresh} />}
      {solutions.length === 0 ? null : (
        <div className="mp-toolbar">
          <span className="mp-caption">{t('solutionVersions')}</span>
          {solutions.map((row, index) => (
            <button
              key={row.id} type="button" className="mp-headerNavItem"
              aria-current={selected?.id === row.id ? 'true' : undefined}
              onClick={() => { setVersionId(row.id); setOpen(true) }}
            >
              {`v${String(solutions.length - index)} · ${formatTime(row.updatedAt)}${index === 0 ? ` · ${t('solutionLatest')}` : ''}`}
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
      {artifacts.error !== '' ? <ErrorState t={t} message={artifacts.error} onRetry={artifacts.refresh} />
        : artifacts.loading ? <LoadingState t={t} />
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
              {reader.error !== '' ? <ErrorState t={t} message={reader.error} />
                : reader.artifact === null ? <LoadingState t={t} />
                  : <SolutionBody t={t} content={displayContent ?? ''} codeIndex={codeIndex} />}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function SolutionBody({ t, content, codeIndex }: {
  t: MarketPilotText
  content: string
  codeIndex: ReturnType<typeof projectShortCodeIndex> | null
}) {
  const documentRef = useRef<HTMLDivElement | null>(null)
  const [railOpen, setRailOpen] = useState(true)
  const headings = outline(content)
  /** Headings that carry unknowns, assumptions, or risks — the review rail. */
  const attention = headings.filter(heading =>
    /UNKNOWN|未知|待确认|假设|风险/i.test(heading.text))
  /** Scroll the reader document to the first rendered heading with this text. */
  const jumpTo = (text: string): void => {
    const root = documentRef.current
    if (root === null) return
    const target = [...root.querySelectorAll('h1, h2, h3')]
      .find(el => (el.textContent ?? '').trim() === text)
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
              onClick={() => { jumpTo(heading.text) }}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      )}
      <div className="mp-readerDocument" ref={documentRef}>
        <CodeMapPanel t={t} index={codeIndex} />
        <MarkdownText
          text={content}
          labels={{ code: { copyLabel: t('mdCopy'), copiedLabel: t('mdCopied') }, footnotes: t('mdFootnotes') }}
        />
      </div>
      {attention.length === 0 ? null : (
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
                  <button type="button" className="mp-link" onClick={() => { jumpTo(heading.text) }}>
                    {heading.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mp-caption">{t('solutionRailHint')}</p>
        </aside>
      )}
    </div>
  )
}
