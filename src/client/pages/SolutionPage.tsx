/**
 * Solution generation and preview. Generation stays disabled until a human
 * Decision exists, and the rendered markdown keeps its UNKNOWN sections —
 * unverified parameters are never presented as commitments.
 */
import { useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { useArtifact, useArtifacts } from '../hooks/useExecution.ts'
import { useProjectDetail } from '../hooks/useProjects.ts'
import { useToolWorkflow } from '../hooks/usePhase4.ts'
import type { MarketPilotText } from '../locales.ts'

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

/** Render the solution page. */
export function SolutionPage({ t, projectId }: { t: MarketPilotText; projectId: string }) {
  const [open, setOpen] = useState(false)
  const detail = useProjectDetail(projectId)
  const artifacts = useArtifacts(projectId)
  const workflow = useToolWorkflow(projectId, ['marketpilot_solution_generate'], 'solution_generation',
    t, artifacts.refresh)
  const status = detail.detail?.project.status
  const decisionConfirmed = status !== undefined
    && (['decision_confirmed', 'solution_ready', 'tender_review'].includes(status)
      || detail.detail?.project.activeDecisionId !== undefined)
  const solution = (artifacts.artifacts ?? []).find(row => row.type === 'solution') ?? null
  const reader = useArtifact(projectId, open && solution !== null ? solution.id : null)

  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('solutionTitle')}</h2>
      {decisionConfirmed ? null : <div className="mp-nextHint" role="note"><span>{t('noDecisionYet')}</span></div>}
      <div className="mp-toolbar">
        <button
          type="button" className="mp-primaryAction mp-headerNavItem"
          disabled={!decisionConfirmed || workflow.busy}
          onClick={() => { void workflow.start('marketpilot_solution_generate', {}) }}
        >
          {t('generateSolution')}
        </button>
        {solution === null ? null : (
          <button type="button" className="mp-headerNavItem" onClick={() => { setOpen(current => !current) }}>
            {t('openArtifact')}
          </button>
        )}
      </div>
      <WorkflowSurface
        t={t} run={workflow.run} execution={workflow.latest} busy={workflow.busy} error={workflow.error}
        label={t('generateSolution')}
        onAnswer={(selected, custom) => { void workflow.answer(selected, custom) }}
        onCancel={() => { void workflow.cancel() }}
      />
      <p className="mp-caption" style={{ marginTop: '8px' }}>{t('solutionUnknownHint')}</p>
      {artifacts.error !== '' ? <ErrorState t={t} message={artifacts.error} onRetry={artifacts.refresh} />
        : artifacts.loading ? <LoadingState t={t} />
          : solution === null ? <EmptyState title={t('solutionTitle')} body={t('noSolution')} />
            : null}
      {open && solution !== null ? (
        <div className="mp-drawerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
          <aside className="mp-reader" role="dialog" aria-label={t('solutionTitle')}>
            <div className="mp-drawerHead">
              <h2 className="mp-drawerTitle">{solution.name}</h2>
              <button type="button" className="mp-link" onClick={() => { setOpen(false) }}>{t('close')}</button>
            </div>
            <div className="mp-readerBody">
              {reader.error !== '' ? <ErrorState t={t} message={reader.error} />
                : reader.artifact === null ? <LoadingState t={t} />
                  : <SolutionBody t={t} content={reader.artifact.content} />}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function SolutionBody({ t, content }: { t: MarketPilotText; content: string }) {
  const headings = outline(content)
  return (
    <div>
      {headings.length === 0 ? null : (
        <nav className="mp-toolbar" aria-label={t('solutionToc')}>
          {headings.map(heading => (
            <span key={`${heading.index}-${heading.text}`} className="mp-caption"
              style={{ marginLeft: `${String((heading.level - 1) * 8)}px` }}>{heading.text}</span>
          ))}
        </nav>
      )}
      <MarkdownText
        text={content}
        labels={{ code: { copyLabel: t('mdCopy'), copiedLabel: t('mdCopied') }, footnotes: t('mdFootnotes') }}
      />
    </div>
  )
}