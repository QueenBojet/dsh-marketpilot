import { useContext, useEffect, useRef, useState } from 'react'
import type { CompetitorItem, PolicyItem } from '../api.ts'
import { ErrorState, LoadingState } from '../components/States.tsx'
import { WorkflowSurface } from '../components/WorkflowSurface.tsx'
import { CompetitorComparison, CompetitorTable, PolicyTable, ResearchSources } from '../components/ResearchResults.tsx'
import { useDrawerKeys } from '../hooks/useDrawerKeys.ts'
import { useToolWorkflow } from '../hooks/usePhase4.ts'
import { useDocuments } from '../hooks/useExecution.ts'
import { useResearchOverview } from '../hooks/useResearchOverview.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import type { MarketPilotActions } from '../stores.ts'
import { useStageAccess, WorkflowContext } from '../components/ProjectWorkflowOverview.tsx'

/** Local research uses guarded tools; online mode requires verified official capability. */
export function ResearchPage({ t, projectId, actions }: { t: MarketPilotText; projectId: string; actions?: MarketPilotActions }) {
  const access = useStageAccess('S2'), context = useContext(WorkflowContext)
  const [mode, setMode] = useState<'local' | 'online'>('local'), [tab, setTab] = useState<'competitor' | 'policy'>('competitor')
  const [selectedDocs, setSelectedDocs] = useState<ReadonlySet<string>>(new Set())
  const [kind, setKind] = useState('all'), [docSearch, setDocSearch] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1)
  const [purposes, setPurposes] = useState({ competitor: '', policy: '' })
  const startLock = useRef(false), [starting, setStarting] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<ReadonlySet<string>>(new Set()), [matrix, setMatrix] = useState(false)
  const [drawer, setDrawer] = useState<CompetitorItem | null>(null), [policyDrawer, setPolicyDrawer] = useState<PolicyItem | null>(null)
  const drawerRef = useDrawerKeys(drawer !== null || policyDrawer !== null, () => { setDrawer(null); setPolicyDrawer(null) })
  const documents = useDocuments(projectId), research = useResearchOverview(projectId), snapshot = research.snapshot
  const competitorFlow = useToolWorkflow(projectId, ['marketpilot_competitor_extract'], 'competitor_analysis', t, research.refresh)
  const policyFlow = useToolWorkflow(projectId, ['marketpilot_policy_extract'], 'policy_analysis', t, research.refresh)
  const workflow = tab === 'competitor' ? competitorFlow : policyFlow
  useEffect(() => { setSelectedDocs(new Set()); setSelectedProducts(new Set()); setMatrix(false); setDrawer(null); setPolicyDrawer(null); setPage(1); setSearch('') }, [projectId, tab])
  useEffect(() => { setPurposes({ competitor: '', policy: '' }); setKind('all'); setDocSearch('') }, [projectId])
  const filterDocs = (update: () => void) => { update(); setSelectedDocs(new Set()) }
  const docs = (documents.documents ?? []).filter(doc => (kind === 'all' || doc.kind === kind) && doc.name.toLowerCase().includes(docSearch.trim().toLowerCase()))
  const selectedIds = docs.filter(doc => selectedDocs.has(doc.id) && doc.hasText).map(doc => doc.id)
  const competitors = snapshot?.competitors ?? [], policies = snapshot?.policies ?? []
  const q = search.trim().toLowerCase()
  const results = tab === 'competitor' ? competitors.filter(row => [row.company, row.product, row.technology].some(v => v?.toLowerCase().includes(q)))
    : policies.filter(row => [row.title, row.issuer, row.documentNumber, row.version, row.scope].some(v => v?.toLowerCase().includes(q)))
  const pages = Math.max(1, Math.ceil(results.length / 12)), currentPage = Math.min(page, pages), visible = results.slice((currentPage - 1) * 12, currentPage * 12)
  const comparisonRows = competitors.filter(row => selectedProducts.has(row.id))
  const inputReady = access.allowed && documents.error === '' && research.error === '' && snapshot !== null && !documents.loading && selectedIds.length > 0 && !starting && !competitorFlow.busy && !policyFlow.busy
  const start = () => {
    if (!inputReady || startLock.current) return
    startLock.current = true; setStarting(true)
    void workflow.start(tab === 'competitor' ? 'marketpilot_competitor_extract' : 'marketpilot_policy_extract',
      { documentIds: selectedIds, ...(purposes[tab].trim() === '' ? {} : { purpose: purposes[tab].trim() }) })
      .catch(() => { /* hook exposes the start error */ }).finally(() => { startLock.current = false; setStarting(false) })
  }
  return <div className="mp-researchPage">
    <h2 className="mp-sectionTitle" style={{ marginTop: 0 }}>{t('sectionResearch')}</h2>
    <div className="mp-toolbar" aria-label={t('research.mode')}>
      <button type="button" className="mp-headerNavItem" aria-pressed={mode === 'local'} onClick={() => { setMode('local') }}>{t('research.local')}</button>
      <button type="button" className="mp-headerNavItem" aria-pressed={mode === 'online'} onClick={() => { setMode('online') }}>{t('research.online')}</button>
    </div>
    {mode === 'online' ? <section className="mp-reviewBlock mp-onlineResearch">
      <h3>{t('research.online')}</h3><p role="note">{context.snapshot?.capabilities.research.reason ?? t('research.capabilityUnknown')}</p><p className="mp-caption">{t('research.providerHelp')}</p>
      <button type="button" className="mp-primaryAction" disabled>{t('research.searchFetch')}</button><p><button type="button" className="mp-link" onClick={() => { setMode('local') }}>{t('review.continueResearch')}</button></p>
    </section> : <>
      <div className="mp-toolbar" aria-label={t('research.direction')}>{(['competitor', 'policy'] as const).map(direction => <button key={direction} type="button" className="mp-headerNavItem" aria-current={tab === direction ? 'page' : undefined} onClick={() => { setTab(direction) }}>{t(direction === 'competitor' ? 'tabCompetitor' : 'tabPolicy')}</button>)}</div>
      <section className="mp-reviewBlock mp-researchInput"><h3>{t('research.inputs')}</h3>
        <div className="mp-researchFilters"><label>{t('research.kind')}<select aria-label={t('research.kind')} value={kind} onChange={e => { filterDocs(() => { setKind(e.target.value) }) }}><option value="all">{t('research.allKinds')}</option>{['customer_requirement', 'tender', 'meeting_note', 'internal_reference', 'competitor_datasheet', 'standard', 'report', 'other'].map(value => <option value={value} key={value}>{t(`docKind.${value}` as MarketPilotTextKey)}</option>)}</select></label>
          <label>{t('research.docSearch')}<input aria-label={t('research.docSearch')} value={docSearch} onChange={e => { filterDocs(() => { setDocSearch(e.target.value) }) }} /></label></div>
        <label className="mp-researchPurpose">{t('research.purpose')}<textarea aria-label={t('research.purpose')} value={purposes[tab]} maxLength={2000} rows={2} onChange={e => { setPurposes({ ...purposes, [tab]: e.target.value }) }} /></label>
        <p className="mp-caption">{t('research.selectionHint')} · {`${docs.length} / ${selectedIds.length}`}</p>
        {documents.error !== '' ? <ErrorState t={t} message={documents.error} onRetry={documents.refresh} /> : documents.loading ? <LoadingState t={t} /> : docs.length === 0 ? <p className="mp-caption">{t('docsEmpty')}</p> : <ul className="mp-docList mp-researchDocs">{docs.map(doc => <li key={doc.id} className="mp-docItem"><label><input type="checkbox" checked={selectedDocs.has(doc.id)} disabled={workflow.busy || !doc.hasText} onChange={() => { setSelectedDocs(current => { const next = new Set(current); next.has(doc.id) ? next.delete(doc.id) : next.add(doc.id); return next }) }} /> <span className="mp-cellMain">{doc.name}</span><span className="mp-caption">{` · ${t(`docKind.${doc.kind}` as MarketPilotTextKey)}`}</span></label></li>)}</ul>}
        <div className="mp-toolbar"><button type="button" className="mp-primaryAction mp-headerNavItem" disabled={!inputReady} onClick={start}>{t(tab === 'competitor' ? 'extractCompetitors' : 'extractPolicies')}</button>{actions ? <button type="button" className="mp-link" onClick={() => { actions.setSection('requirements') }}>{t('review.addSource')}</button> : null}<span className="mp-caption">{t('researchLocalMode')}</span></div>
        {competitorFlow.busy || policyFlow.busy ? <p className="mp-caption">{t('research.runningHint')}</p> : null}
      </section>
      <WorkflowSurface t={t} run={workflow.run} execution={workflow.latest} busy={workflow.busy} error={workflow.error} label={t(tab === 'competitor' ? 'extractCompetitors' : 'extractPolicies')} onAnswer={(selected, custom) => { void workflow.answer(selected, custom) }} onCancel={() => { void workflow.cancel() }} />
      {research.error !== '' ? <ErrorState t={t} message={research.error} onRetry={research.refresh} /> : snapshot === null ? <LoadingState t={t} /> : <section className="mp-researchResults"><h3>{t('research.results')}</h3><p className="mp-caption">{t(tab === 'competitor' ? 'research.draftHint' : 'research.policyHint')}</p>
        <div className="mp-toolbar"><input aria-label={t('research.resultSearch')} placeholder={t('research.resultSearch')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); setSelectedProducts(new Set()); setMatrix(false) }} />{tab === 'competitor' ? <button type="button" className="mp-link" disabled={comparisonRows.length < 2} aria-pressed={matrix} onClick={() => { setMatrix(!matrix) }}>{`${t('research.matrix')} (${comparisonRows.length}/4)`}</button> : null}<span className="mp-caption">{`${results.length} · ${currentPage}/${pages}`}</span><button type="button" className="mp-link" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1) }}>{t('review.previous')}</button><button type="button" className="mp-link" disabled={currentPage === pages} onClick={() => { setPage(currentPage + 1) }}>{t('review.next')}</button></div>
        {results.length === 0 ? <p className="mp-caption">{t(tab === 'competitor' ? 'noCompetitors' : 'noPolicies')}</p> : tab === 'competitor' ? <CompetitorTable t={t} snapshot={snapshot} rows={visible as CompetitorItem[]} selected={selectedProducts} onSelect={id => { setSelectedProducts(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next }) }} onOpen={setDrawer} /> : <PolicyTable t={t} rows={visible as PolicyItem[]} onOpen={setPolicyDrawer} />}
        {matrix && comparisonRows.length >= 2 ? <CompetitorComparison t={t} rows={comparisonRows} snapshot={snapshot} actions={actions} onOpen={setDrawer} /> : null}
        <details className="mp-reviewBlock"><summary>{t('research.history')}</summary><ul>{snapshot.runs.filter(run => run.type === (tab === 'competitor' ? 'competitor_analysis' : 'policy_analysis')).slice().reverse().map(run => <li key={run.id}><strong>{`${t(`runStatus.${run.status}` as MarketPilotTextKey)} · ${run.startedAt}`}</strong><p className="mp-caption">{`${t('research.purpose')}: ${typeof run.input.purpose === 'string' ? run.input.purpose : t('research.purposeAbsent')}`}</p><p className="mp-caption">{Array.isArray(run.input.documentIds) ? run.input.documentIds.map(id => typeof id === 'string' ? snapshot.documents.find(doc => doc.id === id)?.name ?? id : '').join(' · ') : 'UNKNOWN'}</p>{run.error ? <p role="alert">{run.error}</p> : null}</li>)}</ul></details>
      </section>}
    </>}
    {snapshot === null || (drawer === null && policyDrawer === null) ? null : <div className="mp-drawerMask" role="presentation" onClick={e => { if (e.target === e.currentTarget) { setDrawer(null); setPolicyDrawer(null) } }}><aside ref={drawerRef} className="mp-drawer" role="dialog" aria-label={drawer ? t('colCompany') : policyDrawer!.title}>
      <div className="mp-drawerHead"><h2 className="mp-drawerTitle">{drawer ? `${drawer.company} ${drawer.product ?? ''}` : policyDrawer!.title}</h2><button type="button" className="mp-link" onClick={() => { setDrawer(null); setPolicyDrawer(null) }}>{t('close')}</button></div>
      <div className="mp-drawerBody">{drawer ? <><p>{drawer.targetScenario ?? 'UNKNOWN'}</p><h3>{t('drawerPerformance')}</h3><table className="mp-table"><tbody>{Object.entries(drawer.performance).map(([name, value]) => <tr key={name}><th scope="row">{name}</th><td>{value ?? 'UNKNOWN'}<p className="mp-caption">{`${t('research.unit')}: ${drawer.parameterContexts?.[name]?.unit ?? 'UNKNOWN'} · ${t('research.conditions')}: ${drawer.parameterContexts?.[name]?.conditions ?? 'UNKNOWN'}`}</p></td></tr>)}</tbody></table>
        {([['colTechnology', [drawer.technology ?? 'UNKNOWN']], ['colCertifications', drawer.certifications], ['research.interfaces', drawer.interfaces], ['research.cases', drawer.cases], ['research.strengths', drawer.strengths], ['colLimitations', drawer.limitations]] as const).map(([label, values]) => <div key={label}><h3 className="mp-drawerSection">{t(label)}</h3><p>{values.join('；') || 'UNKNOWN'}</p></div>)}
      </> : <><p className="mp-caption">{t('research.policyHint')}</p><p>{`${policyDrawer!.issuer ?? 'UNKNOWN'} · ${policyDrawer!.documentNumber ?? 'UNKNOWN'} · ${policyDrawer!.version ?? 'UNKNOWN'} · ${t(`mandatoryLevel.${policyDrawer!.mandatoryLevel}` as MarketPilotTextKey)}`}</p><h3>{t('colScope')}</h3><p>{policyDrawer!.scope ?? 'UNKNOWN'}</p><h3>{t('colKeyRequirements')}</h3><ul>{policyDrawer!.keyRequirements.map(item => <li key={item}>{item}</li>)}</ul>{policyDrawer!.impact ? <p>{policyDrawer!.impact}</p> : null}{policyDrawer!.gap ? <p>{policyDrawer!.gap}</p> : null}</>}
        <ResearchSources t={t} projectId={projectId} ids={drawer?.evidenceIds ?? policyDrawer!.evidenceIds} snapshot={snapshot} actions={actions} />
      </div></aside></div>}
  </div>
}
