/** Workbench home: real project stats, attention list, recent projects. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectRow } from '../api.ts'
import { DataTable, type DataTableColumn } from '../components/DataTable.tsx'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { StatusTag } from '../components/StatusTag.tsx'
import { formatTime } from '../format.ts'
import { useHomeStats } from '../hooks/useExecution.ts'
import { byRecent, useProjects } from '../hooks/useProjects.ts'
import type { MarketPilotText } from '../locales.ts'
import type { MarketPilotActions } from '../stores.ts'

const RECENT_LIMIT = 8

/** One stat card: a real value, or the explicit 暂无数据 when data is missing. */
function StatCard({ t, value, label, warn }: {
  t: MarketPilotText
  value: number | null
  label: string
  warn?: boolean
}) {
  return (
    <div className="mp-card" {...warn === true && value !== null && value > 0 ? { 'data-tone': 'warn' } : {}}>
      <div className="mp-cardValue" {...value === null ? { 'data-empty': 'true' } : {}}>
        {value === null ? t('statUnavailable') : String(value)}
      </div>
      <div className="mp-cardLabel">{label}</div>
    </div>
  )
}

/**
 * Render the home page.
 * @param props.t - the locale-bound text function.
 * @param props.actions - bound store actions.
 * @returns the page.
 */
export function HomePage({ t, actions }: { t: MarketPilotText; actions: MarketPilotActions }) {
  const { projects, error, refresh, loading } = useProjects()
  const stats = useHomeStats(projects)
  const recent = (projects ?? []).slice().sort(byRecent).slice(0, RECENT_LIMIT)
  const attention = projects === null || stats === null ? []
    : projects.filter(project => (stats.waitingByProject[project.id] ?? 0) > 0)
  const columns: DataTableColumn<ProjectRow>[] = [
    {
      key: 'name', header: t('colName'),
      render: row => (
        <button type="button" className="mp-link mp-cellMain" onClick={() => { actions.openProject(row.id) }}>
          {row.name}
        </button>
      ),
    },
    { key: 'scenario', header: t('colScenario'), render: row => <span className="mp-muted">{row.scenario ?? t('valueUnset')}</span> },
    { key: 'status', header: t('colStatus'), render: row => <StatusTag t={t} kind="project" value={row.status} /> },
    { key: 'updated', header: t('colUpdated'), render: row => <span className="mp-muted">{formatTime(row.updatedAt)}</span> },
    {
      key: 'actions', header: t('colActions'), width: '72px',
      render: row => <Button size="sm" variant="outline" onClick={() => { actions.openProject(row.id) }}>{t('open')}</Button>,
    },
  ]
  return (
    <div>
      <div className="mp-pageActions" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 className="mp-pageTitle">{t('productName')}</h1>
          <p className="mp-pageDesc" style={{ margin: 0 }}>{t('productDescription')}</p>
        </div>
        <Button variant="primary" onClick={() => { actions.goProjects() }}>{t('newProject')}</Button>
      </div>
      <div className="mp-cards">
        <StatCard t={t} value={projects === null ? null : projects.length} label={t('statProjects')} />
        <StatCard t={t} value={stats === null ? null : stats.waitingTotal} label={t('statPending')} warn />
        <StatCard t={t} value={stats === null ? null : stats.running} label={t('statRunning')} />
      </div>
      {error !== '' ? <ErrorState t={t} message={error} onRetry={refresh} />
        : loading ? <LoadingState t={t} />
          : projects !== null && projects.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              body={t('emptyBody')}
              action={<Button variant="primary" onClick={() => { actions.goProjects() }}>{t('newProject')}</Button>}
            />
          ) : (
            <div className="mp-homeGrid">
              <div>
                <div className="mp-pageActions" style={{ justifyContent: 'space-between' }}>
                  <h2 className="mp-sectionTitle" style={{ margin: 0 }}>{t('recentProjects')}</h2>
                  <Button size="sm" variant="ghost" onClick={() => { actions.goProjects() }}>{t('viewAllProjects')}</Button>
                </div>
                <DataTable columns={columns} rows={recent} rowKey={row => row.id} />
              </div>
              <aside className="mp-attention">
                <h2 className="mp-sectionTitle" style={{ margin: 0 }}>{t('homeAttention')}</h2>
                {attention.length === 0 ? (
                  <p className="mp-caption" style={{ margin: 0 }}>{stats === null ? t('statUnavailable') : t('homeAttentionEmpty')}</p>
                ) : (
                  <ul className="mp-attentionList">
                    {attention.map(project => (
                      <li key={project.id} className="mp-attentionRow">
                        <button type="button" className="mp-link mp-cellMain" onClick={() => { actions.openProject(project.id) }}>
                          {project.name}
                        </button>
                        <span className="mp-caption">{`${t('statWaiting')} · ${String(stats!.waitingByProject[project.id] ?? 0)}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          )}
    </div>
  )
}
