/**
 * The overview's primary card: what to do next, derived from the project
 * status, with one jump action into the section that owns that step. Waiting
 * human reviews override the status baseline — they are always the next step.
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

/**
 * Render the next-action card.
 * @param props.t - the locale-bound text function.
 * @param props.status - the project status.
 * @param props.waiting - waiting-for-human run count (overrides the status text).
 * @param props.onGo - jump to the owning section.
 */
export function NextActionCard({ t, status, waiting, onGo }: {
  t: MarketPilotText
  status: string
  waiting: number
  onGo: (section: ProjectSection) => void
}) {
  const nextKey = `next.${status}` as MarketPilotTextKey
  const target = NEXT_SECTION[status] ?? 'overview'
  const hasBody = nextKey in marketpilotLocales.zh
  const headline = waiting > 0 ? `${t('statWaiting')} · ${String(waiting)}` : t('nextStepLabel')
  const body = waiting > 0 ? t('homeAttention') : hasBody ? t(nextKey) : status
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
