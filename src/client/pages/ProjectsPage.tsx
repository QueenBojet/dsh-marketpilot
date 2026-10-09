/** Project list page: create through the guarded tool, search, open. */
import { useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectRow } from '../api.ts'
import { DataTable, type DataTableColumn } from '../components/DataTable.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { StatusTag } from '../components/StatusTag.tsx'
import { formatTime } from '../format.ts'
import { useCreateProject, useProjects } from '../hooks/useProjects.ts'
import type { MarketPilotText } from '../locales.ts'
import type { MarketPilotActions } from '../stores.ts'

/**
 * Render the projects page.
 * @param props.t - the locale-bound text function.
 * @param props.actions - bound store actions.
 * @returns the page.
 */
export function ProjectsPage({ t, actions }: { t: MarketPilotText; actions: MarketPilotActions }) {
  const { projects, error, refresh, loading } = useProjects()
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const { creating, error: createError, create } = useCreateProject(t, refresh)
  const filtered = query.trim() === '' ? projects ?? []
    : (projects ?? []).filter(p => p.name.toLowerCase().includes(query.trim().toLowerCase()))
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
      <PageHeader
        title={t('navProjects')}
        description={t('productDescription')}
        actions={<Button size="sm" variant="ghost" onClick={refresh}>{t('refresh')}</Button>}
      />
      <div className="mp-toolbar">
        <Input
          className="mp-createInput"
          placeholder={t('projectNamePlaceholder')}
          aria-label={t('newProject')}
          value={name}
          disabled={creating}
          onChange={e => { setName(e.target.value) }}
        />
        <Button
          variant="primary"
          disabled={creating || name.trim() === ''}
          onClick={() => { create(name); setName('') }}
        >
          {creating ? t('creating') : t('create')}
        </Button>
        <span className="mp-toolbarSpacer" />
        <Input
          className="mp-searchInput"
          type="search"
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          value={query}
          onChange={e => { setQuery(e.target.value) }}
        />
      </div>
      {createError === '' ? null : <p className="mp-errorText" role="alert" style={{ margin: '0 0 12px' }}>{createError}</p>}
      {error !== '' ? <ErrorState t={t} message={error} onRetry={refresh} />
        : loading ? <LoadingState t={t} />
          : <DataTable
            columns={columns} rows={filtered} rowKey={row => row.id}
            empty={<EmptyState title={t('noProjects')} body={t('noProjectsHint')} />}
          />}
    </div>
  )
}
