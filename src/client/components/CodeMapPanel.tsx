/**
 * The collapsible code-map panel inside document readers: code → record kind,
 * label, and the 8-char trace fragment. It restores traceability when formal
 * prose shows business short codes instead of raw UUIDs.
 */
import type { ShortCodeIndex } from '../../domain/shortcodes.ts'
import type { MarketPilotText } from '../locales.ts'

/** Render the mapping panel; nothing renders when the project has no records. */
export function CodeMapPanel({ t, index }: { t: MarketPilotText; index: ShortCodeIndex | null }) {
  if (index === null) return null
  const entries = index.entries()
  if (entries.length === 0) return null
  return (
    <details className="mp-codeMap">
      <summary className="mp-caption">{t('codeMapTitle')}</summary>
      <ul className="mp-codeMapList">
        {entries.map(entry => (
          <li key={entry.code} className="mp-codeMapRow">
            <code>{entry.code}</code>
            <span className="mp-caption">{`${entry.kindLabel} · ${entry.label} ·（${entry.id.slice(0, 8)}）`}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
