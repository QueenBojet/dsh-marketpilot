/**
 * The overview's primary card: what to do next, derived from the project
 * status, with one jump action into the section that owns that step. A real
 * pending workflow wait (the latest run of its type still waiting_human)
 * overrides the status baseline — it is always the next step, and the jump
 * targets the section that can actually action it, never the stale baseline.
 */
import { marketpilotLocales, type MarketPilotText, type MarketPilotTextKey } from '../locales.ts'
import type { ProjectSection } from '../stores.ts'

/** Which section owns the next action for each project status. */
const NEXT_SECTION: Record<string, ProjectSection> = {
  draft: 'requirements',
  requirements_ready: 'research',
  researching: 'research',
  alternatives_ready: 'alternatives',
  decision_confirmed: 'solution',
  solution_ready: 'tender',
  tender_review: 'tender',
  archived: 'artifacts',
}

/** Which section can action one pending workflow-run type. */
export function waitSectionOf(type: string, activeDecisionId: string | undefined): ProjectSection | undefined {
  if (type === 'requirement_analysis') return 'requirements'
  if (type === 'alternative_generation') return 'alternatives'
  // A solution run waits exactly while the final route lacks its Decision.
  if (type === 'solution_generation') return activeDecisionId === undefined ? 'alternatives' : 'solution'
  if (type === 'tender_review') return 'tender'
  return undefined
}

/** The pending-run types that have a dedicated next-wait hint. */
const WAIT_HINT_TYPES: readonly string[] = ['requirement_analysis', 'solution_generation']

/**
 * Render the next-action card.
 * @param props.t - the locale-bound text function.
 * @param props.status - the project status.
 * @param props.waiting - recoverable (non-superseded) waiting-run count.
 * @param props.waitingType - the pending run's workflow type, when waiting > 0.
 * @param props.activeDecisionId - the project's active Decision, if any.
 * @param props.onGo - jump to the owning section.
 */
export function NextActionCard({ t, status, waiting, waitingType, activeDecisionId, onGo }: {
  t: MarketPilotText
  status: string
  waiting: number
  waitingType?: string | undefined
  activeDecisionId?: string | undefined
  onGo: (section: ProjectSection) => void
}) {
  const nextKey = `next.${status}` as MarketPilotTextKey
  const statusTarget = NEXT_SECTION[status] ?? 'overview'
  const waitTarget = waitingType === undefined ? undefined : waitSectionOf(waitingType, activeDecisionId)
  const target = waitTarget ?? statusTarget
  const hasBody = nextKey in marketpilotLocales.zh
  const waitBody = waitingType !== undefined && WAIT_HINT_TYPES.includes(waitingType)
    ? t(`nextWait.${waitingType}` as MarketPilotTextKey)
    : t('nextWait.generic')
  const headline = waiting > 0 ? `${t('statWaiting')} · ${String(waiting)}` : t('nextStepLabel')
  const body = waiting > 0 ? waitBody : hasBody ? t(nextKey) : status
  return (
    <section className="mp-nextCard">
      <div className="mp-nextCardBody">
        <strong>{headline}</strong>
        <span className="mp-caption">{body}</span>
      </div>
      <button type="button" className="mp-primaryAction mp-headerNavItem" onClick={() => { onGo(target) }}>
        {t('nextActionGo')}
      </button>
    </section>
  )
}
