/** Page-level title block with an optional actions row. */
import type { ReactNode } from 'react'

/**
 * Render one page's heading.
 * @param props.title - localized page title.
 * @param props.description - localized secondary line.
 * @param props.actions - optional trailing controls (buttons, inputs).
 * @returns the heading block.
 */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mp-pageActions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <h1 className="mp-pageTitle">{title}</h1>
        {description === undefined ? null : <p className="mp-pageDesc">{description}</p>}
      </div>
      {actions === undefined ? null : <div className="mp-pageActions">{actions}</div>}
    </div>
  )
}
