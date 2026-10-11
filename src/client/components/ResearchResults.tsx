import type { CompetitorItem, PolicyItem } from '../api.ts'
import type { ResearchOverview } from '../../domain/research-review.ts'
import { parameterComparison } from '../../domain/research-review.ts'
import { DocumentSource } from './ReviewSupport.tsx'
import type { MarketPilotActions } from '../stores.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

function syntheticSource(ids: readonly string[], snapshot: ResearchOverview) {
  return ids.some(id => { const source = snapshot.evidence.find(row => row.id === id)
    return snapshot.documents.some(doc => doc.id === source?.sourceDocumentId && /synthetic|合成|演示/i.test(doc.name)) })
}

export function ResearchSources({ t, projectId, ids, snapshot, actions }: {
  t: MarketPilotText; projectId: string; ids: readonly string[]; snapshot: ResearchOverview; actions?: MarketPilotActions | undefined
}) {
  return <div className="mp-researchSources"><h3 className="mp-drawerSection">{t('evidenceRefs')}</h3>
    {ids.length === 0 ? <p className="mp-caption">{t('drawerNoLocator')}</p> : ids.map(id => {
      const evidence = snapshot.evidence.find(row => row.id === id), doc = snapshot.documents.find(row => row.id === evidence?.sourceDocumentId)
      return <div className="mp-reviewBlock" key={id}>
        <button type="button" className="mp-link" disabled={!actions} onClick={() => { actions?.focusRecord('evidence', 'evidence', id) }}>{`${snapshot.recordCodes[id] ?? id.slice(0, 8)} · ${evidence?.title ?? t('research.sourceMissing')}`}</button>
        {evidence === undefined ? <p className="mp-caption">{t('research.sourceMissing')}</p> : <>
          <p className="mp-caption">{`${evidence.kind} · ${evidence.status} · ${doc?.name ?? 'UNKNOWN'} · ${evidence.sourceLocator ?? 'UNKNOWN'}`}</p><p className="mp-sourceQuote">{evidence.statement}</p>
          {evidence.sourceUrl?.startsWith('https://') || evidence.sourceUrl?.startsWith('http://') ? <a className="mp-link" href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.sourceUrl}</a> : null}
          {doc === undefined ? null : <><p className="mp-caption">{`${t('research.importedAt')} ${doc.importedAt}`}</p><DocumentSource t={t} projectId={projectId} documentId={doc.id} /></>}
        </>}
      </div>
    })}
    {actions ? <p className="mp-relatedLinks"><button type="button" className="mp-link" onClick={() => { actions.setSection('requirements') }}>{t('review.addSource')}</button><button type="button" className="mp-link" onClick={() => { actions.setSection('evidence') }}>{t('sectionEvidence')}</button></p> : null}
  </div>
}
export function CompetitorTable({ t, rows, snapshot, selected, onSelect, onOpen }: {
  t: MarketPilotText; rows: readonly CompetitorItem[]; snapshot: ResearchOverview; selected: ReadonlySet<string>; onSelect(id: string): void; onOpen(row: CompetitorItem): void
}) {
  return <div className="mp-tableWrap"><table className="mp-table"><thead><tr>
    {(['research.compare', 'colCompany', 'colProduct', 'colTechnology', 'colParams', 'colLimitations', 'colDetail'] as const).map(key => <th scope="col" key={key}>{t(key)}</th>)}
  </tr></thead><tbody>{rows.map(row => <tr key={row.id}>
    <td><input type="checkbox" aria-label={`${t('research.compare')} ${row.company} ${row.product ?? 'UNKNOWN'}`} checked={selected.has(row.id)} disabled={!selected.has(row.id) && selected.size >= 4} onChange={() => { onSelect(row.id) }} /></td>
    <td className="mp-cellMain">{row.company}{syntheticSource(row.evidenceIds, snapshot) ? <p className="mp-caption">{t('research.synthetic')}</p> : null}</td><td>{row.product ?? 'UNKNOWN'}</td><td>{row.technology ?? 'UNKNOWN'}</td>
    <td><div className="mp-paramChips">{Object.entries(row.performance).slice(0, 3).map(([key, value]) => <button key={key} type="button" className="mp-paramChip" data-unknown={value === null ? 'true' : 'false'} onClick={() => { onOpen(row) }}>{`${key}: ${value ?? 'UNKNOWN'}`}</button>)}{Object.keys(row.performance).length === 0 ? 'UNKNOWN' : null}</div></td>
    <td>{row.limitations.join('；') || 'UNKNOWN'}</td><td><button type="button" className="mp-link" onClick={() => { onOpen(row) }}>{t('colDetail')}</button></td>
  </tr>)}</tbody></table></div>
}
export function CompetitorComparison({ t, rows, snapshot, actions, onOpen }: {
  t: MarketPilotText; rows: readonly CompetitorItem[]; snapshot: ResearchOverview; actions?: MarketPilotActions | undefined; onOpen(row: CompetitorItem): void
}) {
  const groups = parameterComparison(rows, snapshot.evidence)
  return <section className="mp-researchMatrix" aria-label={t('research.matrix')}><h3>{t('research.matrix')}</h3><p className="mp-caption">{t('research.basisHint')}</p>
    <div className="mp-tableWrap"><table className="mp-table"><thead><tr><th scope="col">{t('colParams')}</th><th scope="col">{t('research.basis')}</th>
      {rows.map(row => <th key={row.id} scope="col"><button type="button" className="mp-link" onClick={() => { onOpen(row) }}>{`${row.company} / ${row.product ?? 'UNKNOWN'}`}</button>{syntheticSource(row.evidenceIds, snapshot) ? <p className="mp-caption">{t('research.synthetic')}</p> : null}</th>)}
    </tr></thead><tbody>{groups.map(group => <tr key={group.key}>
      <th scope="row">{group.name}</th><td><strong>{t(group.comparable ? 'research.sameBasis' : 'research.unconfirmedBasis')}</strong><p className="mp-caption">{`${t('research.unit')}: ${group.unit ?? 'UNKNOWN'} · ${t('research.conditions')}: ${group.conditions ?? 'UNKNOWN'}`}</p></td>
      {rows.map(row => { const cell = group.cells[row.id]; return <td key={row.id}><strong>{cell?.value ?? 'UNKNOWN'}</strong>
        {cell?.evidenceId == null ? <p className="mp-caption">{t('research.sourceMissing')}</p> : <p><button type="button" className="mp-link" disabled={!actions} onClick={() => { actions?.focusRecord('evidence', 'evidence', cell.evidenceId!) }}>{snapshot.recordCodes[cell.evidenceId] ?? cell.evidenceId.slice(0, 8)}</button></p>}
      </td> })}
    </tr>)}</tbody></table></div>{groups.length === 0 ? <p className="mp-caption">{t('research.noParameters')}</p> : null}
  </section>
}
export function PolicyTable({ t, rows, onOpen }: { t: MarketPilotText; rows: readonly PolicyItem[]; onOpen(row: PolicyItem): void }) {
  return <div className="mp-tableWrap"><table className="mp-table"><thead><tr>
    {(['colTitle', 'colIssuer', 'colDocNumber', 'colVersion', 'colScope', 'colMandatory', 'colDetail'] as const).map(key => <th key={key} scope="col">{t(key)}</th>)}
  </tr></thead><tbody>{rows.map(row => <tr key={row.id}>
    <td className="mp-cellMain">{row.title}</td><td>{row.issuer ?? 'UNKNOWN'}</td><td>{row.documentNumber ?? 'UNKNOWN'}</td><td>{row.version ?? 'UNKNOWN'}<p className="mp-caption">{t('research.versionPending')}</p></td><td>{row.scope ?? 'UNKNOWN'}</td><td>{t(`mandatoryLevel.${row.mandatoryLevel}` as MarketPilotTextKey)}</td>
    <td><button type="button" className="mp-link" onClick={() => { onOpen(row) }}>{t('colDetail')}</button></td>
  </tr>)}</tbody></table></div>
}
