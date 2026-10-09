/** Empty / loading / error states shared by every panel page. */
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { MarketPilotText } from '../locales.ts'

/**
 * Render the empty state of a page region.
 * @param props.title - localized heading.
 * @param props.body - localized explanation.
 * @param props.action - optional call-to-action node.
 * @returns the empty-state block.
 */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mp-empty">
      <p className="mp-emptyTitle">{title}</p>
      <p className="mp-emptyBody">{body}</p>
      {action}
    </div>
  )
}

/**
 * Render the loading state.
 * @param props.label - localized loading text.
 * @returns the loading block.
 */
export function LoadingState({ t }: { t: MarketPilotText }) {
  return (
    <div className="mp-state" role="status">
      <StateDot state="ongoing" />
      <span>{t('loading')}</span>
    </div>
  )
}

/**
 * Render a load failure with a retry action.
 * @param props.t - the locale-bound text function.
 * @param props.message - the concrete error text from the failed request.
 * @param props.onRetry - retry callback; omitted hides the button.
 * @returns the error block.
 */
export function ErrorState({ t, message, onRetry }: { t: MarketPilotText; message: string; onRetry?: () => void }) {
  return (
    <div className="mp-state" role="alert">
      <span className="mp-errorText">{t('loadError')}</span>
      <span className="mp-caption">{message}</span>
      {onRetry === undefined ? null : (
        <button type="button" className="mp-link" onClick={onRetry}>{t('retry')}</button>
      )}
    </div>
  )
}
