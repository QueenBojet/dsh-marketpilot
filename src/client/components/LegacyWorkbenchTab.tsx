/**
 * Legacy right-sidebar tab body, downgraded in V3 to a jump entry: the full
 * workbench lives in the `main` panel and this tab only navigates there.
 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarketPilotText } from '../locales.ts'

/**
 * Render the legacy tab body.
 * @param props.t - the locale-bound text function.
 * @param props.open - selects the MarketPilot main panel through ctx.layout.
 * @returns the jump card.
 */
export function LegacyWorkbenchTab({ t, open }: { t: MarketPilotText; open: () => void }) {
  return (
    <div className="mp-legacy">
      <p className="mp-legacyHint">{t('legacyTabHint')}</p>
      <Button variant="primary" onClick={open}>{t('openMain')}</Button>
    </div>
  )
}
