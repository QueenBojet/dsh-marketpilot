/** Requirement review table: batch selection over proposed rows plus per-row detail. */
import type { RequirementItem } from '../api.ts'
import { StatusTag } from './StatusTag.tsx'
import type { MarketPilotText } from '../locales.ts'

/** Callbacks and rows for the requirement table. */
export interface RequirementTableProps {
  t: MarketPilotText
  rows: readonly RequirementItem[]
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onSelectProposed: () => void
  onOpenDetail: (item: RequirementItem) => void
}

/** Render the requirement table. */
export function RequirementTable({ t, rows, selected, onToggle, onSelectProposed, onOpenDetail }: RequirementTableProps) {
  if (rows.length === 0) {
    return <div className="mp-empty"><p className="mp-emptyTitle">{t('reqEmptyTitle')}</p><p className="mp-emptyBody">{t('reqEmptyBody')}</p></div>
  }
  return (
    <div className="mp-tableWrap">
      <table className="mp-table">
        <thead>
          <tr>
            <th scope="col" style={{ width: '36px' }}>
              <button type="button" className="mp-link mp-caption" title={t('selectAllProposed')} onClick={onSelectProposed}>☑</button>
            </th>
            <th scope="col">{t('colShortId')}</th>
            <th scope="col">{t('colName')}</th>
            <th scope="col">{t('colType')}</th>
            <th scope="col">{t('colPriority')}</th>
            <th scope="col">{t('colStatus')}</th>
            <th scope="col">{t('colSource')}</th>
            <th scope="col" style={{ width: '64px' }}>{t('colDetail')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(item => (
            <tr key={item.id}>
              <td>
                <input
                  type="checkbox" disabled={item.status !== 'proposed'} checked={selected.has(item.id)}
                  aria-label={item.normalizedText}
                  onChange={() => { onToggle(item.id) }}
                />
              </td>
              <td><code>{item.shortId}</code></td>
              <td className="mp-cellMain">{item.normalizedText}</td>
              <td className="mp-muted">{item.type}</td>
              <td className="mp-muted">{item.priority}</td>
              <td><StatusTag t={t} kind="requirement" value={item.status} /></td>
              <td className="mp-muted">{item.sourceDocumentName ?? item.sourceDocumentId.slice(0, 8)}</td>
              <td>
                <button type="button" className="mp-link" onClick={() => { onOpenDetail(item) }}>{t('colDetail')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
