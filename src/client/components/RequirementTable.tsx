/** Requirement review table: batch selection over proposed rows plus per-row detail. */
import type { RequirementItem } from '../api.ts'
import { StatusTag } from './StatusTag.tsx'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

/** Callbacks and rows for the requirement table. */
export interface RequirementTableProps {
  t: MarketPilotText
  rows: readonly RequirementItem[]
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onSelectProposed: () => void
  onOpenDetail: (item: RequirementItem) => void
}

/** Review-urgency order: 待确认 → 冲突 → 未知 → 已确认；同级保持提取顺序。 */
function reviewRank(status: string): number {
  if (status === 'proposed') return 0
  if (status === 'conflict') return 1
  if (status === 'unknown') return 2
  return 3
}

/** Render the requirement table. */
export function RequirementTable({ t, rows, selected, onToggle, onSelectProposed, onOpenDetail }: RequirementTableProps) {
  if (rows.length === 0) {
    return <div className="mp-empty"><p className="mp-emptyTitle">{t('reqEmptyTitle')}</p><p className="mp-emptyBody">{t('reqEmptyBody')}</p></div>
  }
  const ordered = rows.map((row, index) => ({ row, index }))
    .sort((left, right) => reviewRank(left.row.status) - reviewRank(right.row.status) || left.index - right.index)
    .map(entry => entry.row)
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
          {ordered.map(item => (
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
              <td className="mp-muted">{t(`priority.${item.priority}` as MarketPilotTextKey)}</td>
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
