/**
 * Competitor and policy research over the project's imported documents. Both
 * extractions run through the real guarded tools; no provider-dependent web
 * search is implied — the page states the local-document mode plainly.
 * Parameters render as real values (UNKNOWN kept visible) and open the
 * source detail; policy rows open a full-clause drawer.
 */
import { useState } from 'react'
import type { CompetitorItem, PolicyItem } from '../api.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { useDrawerKeys } from '../hooks/useDrawerKeys.ts'
import { useCompetitors, usePolicies, useToolWorkflow } from '../hooks/usePhase4.ts'
import { useDocuments } from '../hooks/useExecution.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

/** Render one competitor matrix row; the drawer carries the parameter detail. */
function CompetitorTable({ t, rows, onOpen }: {
  t: MarketPilotText
  rows: readonly CompetitorItem[]
  onOpen: (row: CompetitorItem) => void
}) {
  return (
    <div className="mp-tableWrap">
      <table className="mp-table">
        <thead>
          <tr>
            <th scope="col">{t('colCompany')}</th>
            <th scope="col">{t('colProduct')}</th>
            <th scope="col">{t('colTechnology')}</th>
            <th scope="col">{t('colParams')}</th>
            <th scope="col">{t('colLimitations')}</th>
            <th scope="col">{t('colEvidence')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td className="mp-cellMain">{row.company}</td>
              <td className="mp-muted">{row.product ?? '—'}</td>
              <td className="mp-muted">{row.technology ?? '—'}</td>
              <td>
                <div className="mp-paramChips">
                  {Object.entries(row.performance).slice(0, 3).map(([key, value]) => (
                    <button
                      key={key} type="button" className="mp-paramChip"
                      data-unknown={value === null ? 'true' : 'false'}
                      title={value === null ? 'UNKNOWN' : String(value)}
                      onClick={() => { onOpen(row) }}
                    >
                      {`${key}: ${value === null ? 'UNKNOWN' : String(value)}`}
                    </button>
                  ))}
                  {Object.keys(row.performance).length === 0 ? <span className="mp-muted">—</span> : null}
                </div>
              </td>
              <td className="mp-muted">{row.limitations.join('；') || '—'}</td>
              <td>
                <button type="button" className="mp-link" onClick={() => { onOpen(row) }}>{t('colDetail')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Render the research page (competitor / policy tabs). */
export function ResearchPage({ t, projectId }: { t: MarketPilotText; projectId: string }) {
  const [tab, setTab] = useState<'competitor' | 'policy'>('competitor')
  const [selectedDocs, setSelectedDocs] = useState<ReadonlySet<string>>(new Set())
  const [drawer, setDrawer] = useState<CompetitorItem | null>(null)
  const [policyDrawer, setPolicyDrawer] = useState<PolicyItem | null>(null)
  const drawerRef = useDrawerKeys(drawer !== null || policyDrawer !== null, () => {
    setDrawer(null)
    setPolicyDrawer(null)
  })
  const documents = useDocuments(projectId)
  const competitors = useCompetitors(projectId)
  const policies = usePolicies(projectId)
  const workflow = useToolWorkflow(
    projectId,
    ['marketpilot_competitor_extract', 'marketpilot_policy_extract'],
    tab === 'competitor' ? 'competitor_analysis' : 'policy_analysis',
    t,
    () => { competitors.refresh(); policies.refresh() })

  const startExtract = (): void => {
    if (selectedDocs.size === 0 || workflow.busy) return
    void workflow.start(tab === 'competitor' ? 'marketpilot_competitor_extract' : 'marketpilot_policy_extract',
      { documentIds: [...selectedDocs] })
  }

  return (
    <div>
      <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('sectionResearch')}</h2>
      <div className="mp-toolbar">
        <button type="button" className="mp-headerNavItem" aria-current={tab === 'competitor' ? 'page' : undefined}
          onClick={() => { setTab('competitor') }}>{t('tabCompetitor')}</button>
        <button type="button" className="mp-headerNavItem" aria-current={tab === 'policy' ? 'page' : undefined}
          onClick={() => { setTab('policy') }}>{t('tabPolicy')}</button>
        <span className="mp-toolbarSpacer" />
        <span className="mp-caption">{t('researchLocalMode')}</span>
        <button type="button" className="mp-primaryAction mp-headerNavItem"
          disabled={workflow.busy || selectedDocs.size === 0}
          onClick={startExtract}
        >
          {tab === 'competitor' ? t('extractCompetitors') : t('extractPolicies')}
        </button>
      </div>
      {documents.loading ? <LoadingState t={t} />
        : (documents.documents ?? []).length === 0 ? <p className="mp-caption">{t('docsEmpty')}</p>
          : (
            <ul className="mp-docList">
              {(documents.documents ?? []).map(doc => (
                <li key={doc.id} className="mp-docItem">
                  <label>
                    <input
                      type="checkbox" checked={selectedDocs.has(doc.id)} disabled={workflow.busy}
                      onChange={() => { setSelectedDocs(current => {
                        const next = new Set(current)
                        if (next.has(doc.id)) next.delete(doc.id)
                        else next.add(doc.id)
                        return next
                      }) }}
                    />
                    <span className="mp-cellMain">{doc.name}</span>
                    <span className="mp-caption">{` · ${doc.kind}`}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
      <WorkflowSurface
        t={t} run={workflow.run} execution={workflow.latest} busy={workflow.busy} error={workflow.error}
        label={tab === 'competitor' ? t('extractCompetitors') : t('extractPolicies')}
        onAnswer={(selected, custom) => { void workflow.answer(selected, custom) }}
        onCancel={() => { void workflow.cancel() }}
      />
      {tab === 'competitor'
        ? competitors.loading ? <LoadingState t={t} />
          : competitors.error !== '' ? <ErrorState t={t} message={competitors.error} onRetry={competitors.refresh} />
            : (competitors.rows ?? []).length === 0
              ? <EmptyState title={t('tabCompetitor')} body={t('noCompetitors')} />
              : <CompetitorTable t={t} rows={competitors.rows ?? []} onOpen={setDrawer} />
        : policies.loading ? <LoadingState t={t} />
          : policies.error !== '' ? <ErrorState t={t} message={policies.error} onRetry={policies.refresh} />
            : (policies.rows ?? []).length === 0
              ? <EmptyState title={t('tabPolicy')} body={t('noPolicies')} />
              : (
                <div className="mp-tableWrap">
                  <table className="mp-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('colTitle')}</th>
                        <th scope="col">{t('colIssuer')}</th>
                        <th scope="col">{t('colDocNumber')}</th>
                        <th scope="col">{t('colVersion')}</th>
                        <th scope="col">{t('colScope')}</th>
                        <th scope="col">{t('colMandatory')}</th>
                        <th scope="col" style={{ width: '64px' }}>{t('colDetail')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(policies.rows ?? []).map((row: PolicyItem) => (
                        <tr key={row.id}>
                          <td className="mp-cellMain">{row.title}</td>
                          <td className="mp-muted">{row.issuer ?? '—'}</td>
                          <td className="mp-muted">{row.documentNumber ?? '—'}</td>
                          <td className="mp-muted">{row.version ?? '—'}</td>
                          <td className="mp-muted">{row.scope ?? '—'}</td>
                          <td className="mp-muted">{t(`mandatoryLevel.${row.mandatoryLevel}` as MarketPilotTextKey)}</td>
                          <td>
                            <button type="button" className="mp-link" onClick={() => { setPolicyDrawer(row) }}>{t('colDetail')}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
      {drawer === null ? null : (
        <div className="mp-drawerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) setDrawer(null) }}>
          <aside ref={drawerRef} className="mp-drawer" role="dialog" aria-label={t('colCompany')}>
            <div className="mp-drawerHead">
              <h2 className="mp-drawerTitle">{`${drawer.company} ${drawer.product ?? ''}`}</h2>
              <button type="button" className="mp-link" onClick={() => { setDrawer(null) }}>{t('close')}</button>
            </div>
            <div className="mp-drawerBody">
              {drawer.targetScenario === undefined ? null : <p>{drawer.targetScenario}</p>}
              <h3 className="mp-drawerSection">{t('drawerPerformance')}</h3>
              {Object.keys(drawer.performance).length === 0 ? <p className="mp-caption">—</p> : (
                <table className="mp-table">
                  <tbody>
                    {Object.entries(drawer.performance).map(([key, value]) => (
                      <tr key={key}>
                        <td className="mp-muted">{key}</td>
                        <td>{value === null ? 'UNKNOWN' : String(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {drawer.certifications.length === 0 ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('colCertifications')}</h3>
                  <p>{drawer.certifications.join('；')}</p>
                </>
              )}
              {drawer.limitations.length === 0 ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('colLimitations')}</h3>
                  <ul>{drawer.limitations.map(item => <li key={item}>{item}</li>)}</ul>
                </>
              )}
              <h3 className="mp-drawerSection">{t('evidenceRefs')}</h3>
              <p className="mp-caption">{drawer.evidenceIds.map(id => id.slice(0, 8)).join(' · ') || '—'}</p>
              {drawer.evidenceIds.length === 0 ? <p className="mp-caption" role="note">{t('drawerNoLocator')}</p> : null}
            </div>
          </aside>
        </div>
      )}
      {policyDrawer === null ? null : (
        <div className="mp-drawerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) setPolicyDrawer(null) }}>
          <aside ref={drawerRef} className="mp-drawer" role="dialog" aria-label={policyDrawer.title}>
            <div className="mp-drawerHead">
              <h2 className="mp-drawerTitle">{policyDrawer.title}</h2>
              <button type="button" className="mp-link" onClick={() => { setPolicyDrawer(null) }}>{t('close')}</button>
            </div>
            <div className="mp-drawerBody">
              <p className="mp-caption">
                {`${policyDrawer.issuer ?? '—'} · ${policyDrawer.documentNumber ?? '—'} · ${t('colVersion')} ${policyDrawer.version ?? '—'} · ${t(`mandatoryLevel.${policyDrawer.mandatoryLevel}` as MarketPilotTextKey)}`}
              </p>
              {policyDrawer.scope === undefined ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('colScope')}</h3>
                  <p>{policyDrawer.scope}</p>
                </>
              )}
              <h3 className="mp-drawerSection">{t('colKeyRequirements')}</h3>
              {policyDrawer.keyRequirements.length === 0 ? <p className="mp-caption">—</p> : (
                <ul>{policyDrawer.keyRequirements.map(item => <li key={item}>{item}</li>)}</ul>
              )}
              {policyDrawer.impact === undefined ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('colImpact')}</h3>
                  <p>{policyDrawer.impact}</p>
                </>
              )}
              {policyDrawer.gap === undefined ? null : (
                <>
                  <h3 className="mp-drawerSection">{t('colGap')}</h3>
                  <p>{policyDrawer.gap}</p>
                </>
              )}
              <h3 className="mp-drawerSection">{t('evidenceRefs')}</h3>
              <p className="mp-caption">{policyDrawer.evidenceIds.map(id => id.slice(0, 8)).join(' · ') || '—'}</p>
              {policyDrawer.evidenceIds.length === 0 ? <p className="mp-caption" role="note">{t('drawerNoLocator')}</p> : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}