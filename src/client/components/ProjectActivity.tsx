/**
 * Recent workflow activity for the project overview: the latest runs with
 * their live status and time — real recorded steps only, no invented metrics.
 */
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectDetail } from '../api.ts'
import { formatTime } from '../format.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

/** One activity row from a workflow-run record. */
interface RunRow { type: string; status: string; updatedAt: string }

/**
 * Render the recent-runs list.
 * @param props.t - the locale-bound text function.
 * @param props.detail - the loaded project detail (workflowRuns).
 */
export function ProjectActivity({ t, detail }: {
  t: MarketPilotText
  detail: ProjectDetail
}) {
  const runs = ((Array.isArray(detail.workflowRuns) ? detail.workflowRuns : []) as RunRow[])
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
  return (
    <section className="mp-activity">
      <h3 className="mp-subTitle" style={{ marginTop: 0 }}>{t('projectActivity')}</h3>
      {runs.length === 0 ? <p className="mp-caption">{t('projectActivityEmpty')}</p> : (
        <ul className="mp-activityList">
          {runs.map(run => (
            <li key={`${run.type}-${run.updatedAt}`} className="mp-activityRow">
              <StateDot state={run.status === 'failed' ? 'error' : run.status === 'waiting_human' ? 'warning'
                : run.status === 'completed' ? 'done' : 'ongoing'} />
              <span className="mp-cellMain">{t(`runType.${run.type}` as MarketPilotTextKey)}</span>
              <span className="mp-caption">{t(`runStatus.${run.status}` as MarketPilotTextKey)}</span>
              <span className="mp-toolbarSpacer" />
              <span className="mp-caption">{formatTime(run.updatedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
