import type { CompetitorItem, PolicyItem } from '../api.ts'
import type { ResearchOverview } from '../../domain/research-review.ts'
import type { MarketPilotText } from '../locales.ts'
import { guidedText } from '../guidedWorkflow.ts'

/** Concise source-backed results. Full parameters and original quotes stay in the existing drawers. */
export function CompetitorCards({ t, rows, snapshot, selected, onSelect, onOpen }: {
  t: MarketPilotText; rows: readonly CompetitorItem[]; snapshot: ResearchOverview; selected: ReadonlySet<string>
  onSelect(id: string): void; onOpen(row: CompetitorItem): void
}) {
  return <div className="mp-researchCardGrid">{rows.map(row => {
    const synthetic = row.evidenceIds.some(id => {
      const evidence = snapshot.evidence.find(e => e.id === id)
      return snapshot.documents.some(doc => doc.id === evidence?.sourceDocumentId && /synthetic|合成|演示/i.test(doc.name))
    })
    return <article className="mp-researchCard" key={row.id}>
      <header><div><p className="mp-guidedEyebrow">{row.company}</p><h4>{row.product ?? guidedText(t, 'unrecorded')}</h4></div>
        <label className="mp-researchCompare"><input type="checkbox" aria-label={`${t('research.compare')} ${row.company} ${row.product ?? 'UNKNOWN'}`}
          checked={selected.has(row.id)} disabled={!selected.has(row.id) && selected.size >= 4} onChange={() => { onSelect(row.id) }} />{t('research.compare')}</label></header>
      {synthetic ? <p className="mp-businessNotice">{t('research.synthetic')}</p> : null}
      <p className="mp-researchTechnology">{row.technology ?? guidedText(t, 'unrecorded')}</p>
      <dl><dt>{guidedText(t, 'mainParameters')}</dt><dd className="mp-paramChips">{Object.entries(row.performance).slice(0, 3).map(([key, value]) =>
        <button key={key} type="button" className="mp-paramChip" data-unknown={value === null ? 'true' : 'false'} onClick={() => { onOpen(row) }}>{`${key}: ${value ?? guidedText(t, 'unverified')}`}</button>)}
        {Object.keys(row.performance).length === 0 ? guidedText(t, 'unrecorded') : null}</dd>
        <dt>{t('colLimitations')}</dt><dd className="mp-businessClamp">{row.limitations.join('；') || guidedText(t, 'unrecorded')}</dd></dl>
      <footer><span className="mp-caption">{`${row.evidenceIds.length} ${guidedText(t, 'sourceItems')}`}</span>
        <button type="button" className="mp-link" onClick={() => { onOpen(row) }}>{guidedText(t, 'viewResearch')}</button></footer>
    </article>
  })}</div>
}
export function PolicyCards({ t, rows, onOpen }: { t: MarketPilotText; rows: readonly PolicyItem[]; onOpen(row: PolicyItem): void }) {
  return <div className="mp-researchCardGrid">{rows.map(row => <article className="mp-researchCard" key={row.id}>
    <header><div><p className="mp-guidedEyebrow">{row.issuer ?? guidedText(t, 'unrecorded')}</p><h4>{row.title}</h4></div></header>
    <p className="mp-caption">{`${row.documentNumber ?? guidedText(t, 'unrecorded')} · ${row.version ?? guidedText(t, 'unverified')}`}</p>
    <dl><dt>{t('colScope')}</dt><dd className="mp-businessClamp">{row.scope ?? guidedText(t, 'unrecorded')}</dd>
      <dt>{t('colKeyRequirements')}</dt><dd className="mp-businessClamp">{row.keyRequirements.join('；') || guidedText(t, 'unrecorded')}</dd></dl>
    <footer><span className="mp-caption">{`${row.evidenceIds.length} ${guidedText(t, 'sourceItems')}`}</span><button className="mp-link" type="button" onClick={() => { onOpen(row) }}>{guidedText(t, 'viewResearch')}</button></footer>
  </article>)}</div>
}
