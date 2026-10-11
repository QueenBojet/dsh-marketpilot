import type { DesignOverview } from '../../services/design-overview.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import type { MarketPilotActions } from '../stores.ts'

export function DesignSyntheticNotice({ t, snapshot }: { t: MarketPilotText; snapshot: DesignOverview | null }) {
  return snapshot?.documents.some(row => row.synthetic) ? <p className="mp-caption" role="note">{t('design.synthetic')}</p> : null
}

export function RecordLinks({ ids, codes, actions, kind = 'evidence' }: {
  ids: readonly string[]; codes: Record<string, string>; actions?: MarketPilotActions | undefined; kind?: 'evidence' | 'requirement'
}) {
  return <span className="mp-relatedLinks">{ids.length === 0 ? '—' : ids.map(id => actions === undefined
    ? <code key={id}>{codes[id] ?? id.slice(0, 8)}</code>
    : <button key={id} type="button" className="mp-link" onClick={() => { actions.focusRecord(kind === 'evidence' ? 'evidence' : 'requirements', kind, id) }}>{codes[id] ?? id.slice(0, 8)}</button>)}</span>
}

export function ArtifactContextNotice({ t, artifact, codes, actions }: {
  t: MarketPilotText; artifact: DesignOverview['artifacts'][number]; codes: Record<string, string>; actions?: MarketPilotActions | undefined
}) {
  const { context } = artifact
  return <section className="mp-artifactContext" data-context={context.status} role="note">
    <strong>{t(`design.context.${context.status}` as MarketPilotTextKey)}</strong>
    <p className="mp-caption">{t(context.status === 'untracked' ? 'design.legacyContextHint' : context.status === 'possibly_stale' ? 'design.staleContextHint' : 'design.currentContextHint')}</p>
    {context.stored === null ? null : <p className="mp-caption">
      {`${t('design.requirementsVersion')}: ${context.stored.requirementsVersion.slice(0, 12)} · ${t('design.decisionVersion')}: ${context.stored.decisionId === null ? '—' : codes[context.stored.decisionId] ?? context.stored.decisionId.slice(0, 8)}`}
    </p>}
    {context.changed.length === 0 ? null : <p className="mp-caption">{t('design.changedInputs')}: {context.changed.map(key => t(`design.change.${key}` as MarketPilotTextKey)).join(' · ')}</p>}
    {actions === undefined || context.status === 'current' ? null : <div className="mp-toolbar">
      <button type="button" className="mp-link" onClick={() => { actions.setSection('requirements') }}>{t('design.reviewRequirements')}</button>
      <button type="button" className="mp-link" onClick={() => { actions.setSection('evidence') }}>{t('design.reviewEvidence')}</button>
      <button type="button" className="mp-link" onClick={() => { actions.setSection('alternatives') }}>{t('design.reviewDecision')}</button>
    </div>}
  </section>
}
