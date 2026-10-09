/**
 * Generic read-only data table. Column headers are pre-localized strings the
 * caller owns; cells render through per-column render functions.
 */
import type { ReactNode } from 'react'

/** One column definition. */
export interface DataTableColumn<Row> {
  /** Stable key for the header cell. */
  readonly key: string
  /** Localized header text. */
  readonly header: string
  /** Render one row's cell. */
  readonly render: (row: Row) => ReactNode
  /** Optional CSS width for the column (e.g. "120px"). */
  readonly width?: string
}

/**
 * Render a data table.
 * @param props.columns - column definitions in display order.
 * @param props.rows - data rows.
 * @param props.rowKey - stable row identity for React keys.
 * @param props.empty - node rendered instead of the table when rows is empty.
 * @returns the table (or the empty node).
 */
export function DataTable<Row>({ columns, rows, rowKey, empty }: {
  columns: readonly DataTableColumn<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  empty?: ReactNode
}) {
  if (rows.length === 0 && empty !== undefined) return <>{empty}</>
  return (
    <div className="mp-tableWrap">
      <table className="mp-table">
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key} scope="col" {...column.width === undefined ? {} : { style: { width: column.width } }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)}>
              {columns.map(column => <td key={column.key}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
