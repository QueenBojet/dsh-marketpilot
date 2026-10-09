/** Workbench home: product summary, real project stats, recent projects. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectRow } from '../api.ts'
import { DataTable, type DataTableColumn } from '../components/DataTable.tsx'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { StatusTag } from '../components/StatusTag.tsx'
import { formatTime } from '../format.ts'
import { byRecent, useProjects } from '../hooks/useProjects.ts'
import type { MarketPilotText } from '../locales.ts'
import type { MarketPilotActions } from '../stores.ts'

const RECENT_LIMIT = 8

/**
 * Render the home page.
 * @param props.t - the locale-bound text function.
 * @param props.actions - bound store actions.
 * @returns the page.
 */
export function HomePage({ t, actions }: { t: MarketPilotText; actions: MarketPilotActions }) {
  const { projects, error, refresh, loading } = useProjects()
  const recent = (projects ?? []).slice().sort(byRecent).slice(0, RECENT_LIMIT)
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
        <div className="mp-card">
          <div className="mp-cardValue">{projects === null ? '—' : String(projects.length)}</div>
          <div className="mp-cardLabel">{t('statProjects')}</div>
        </div>
        <div className="mp-card">
          <div className="mp-cardValue mp-muted">—</div>
          <div className="mp-cardLabel">{t('statPending')}</div>
          <div className="mp-cardHint">{t('statPendingSoon')}</div>
        </div>
        <div className="mp-card">
          <div className="mp-cardValue mp-muted">—</div>
          <div className="mp-cardLabel">{t('statRunning')}</div>
          <div className="mp-cardHint">{t('statRunningSoon')}</div>
        </div>
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
            <div>
              <div className="mp-pageActions" style={{ justifyContent: 'space-between' }}>
                <h2 className="mp-sectionTitle" style={{ margin: 0 }}>{t('recentProjects')}</h2>
                <Button size="sm" variant="ghost" onClick={() => { actions.goProjects() }}>{t('viewAllProjects')}</Button>
              </div>
              <DataTable columns={columns} rows={recent} rowKey={row => row.id} />
            </div>
          )}
    </div>
  )
}
