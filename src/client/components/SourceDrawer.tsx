/** Right-side drawer with one requirement's original text, source, and open questions. */
import type { RequirementItem } from '../api.ts'
import { StatusTag } from './StatusTag.tsx'
import type { MarketPilotText } from '../locales.ts'

/** Render the requirement detail drawer. */
export function SourceDrawer({ t, item, onClose }: {
  t: MarketPilotText
  item: RequirementItem
  onClose: () => void
}) {
  return (
    <div className="mp-drawerMask" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="mp-drawer" role="dialog" aria-label={t('drawerTitle')}>
        <div className="mp-drawerHead">
          <h2 className="mp-drawerTitle">{t('drawerTitle')}</h2>
          <button type="button" className="mp-link" onClick={onClose}>{t('close')}</button>
        </div>
        <div className="mp-drawerBody">
          <p className="mp-cellMain">{item.normalizedText}</p>
          <div style={{ margin: '4px 0 12px' }}>
            <StatusTag t={t} kind="requirement" value={item.status} />
            <span className="mp-caption">{` · ${item.type} · ${item.priority} · ${item.shortId}`}</span>
          </div>
          <h3 className="mp-drawerSection">{t('drawerOriginal')}</h3>
          <blockquote className="mp-quote">{item.originalText}</blockquote>
          <h3 className="mp-drawerSection">{t('colSource')}</h3>
          <p>{item.sourceDocumentName ?? item.sourceDocumentId}</p>
          {item.sourceLocator === undefined ? null : (
            <>
              <h3 className="mp-drawerSection">{t('drawerLocator')}</h3>
              <p><code>{item.sourceLocator}</code></p>
            </>
          )}
          {item.clarificationQuestion === undefined ? null : (
            <>
              <h3 className="mp-drawerSection">{t('drawerClarification')}</h3>
              <p>{item.clarificationQuestion}</p>
            </>
          )}
          {item.risk === undefined ? null : (
            <>
              <h3 className="mp-drawerSection">{t('drawerRisk')}</h3>
              <p>{item.risk}</p>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
