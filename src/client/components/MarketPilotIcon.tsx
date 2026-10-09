/** The sidebar's MarketPilot entry icon; the sidebar owns the button and selected state. */
import { IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Render the panel glyph at the size the sidebar requests.
 * @param props.size - requested square edge in px.
 * @returns the icon element.
 */
export function MarketPilotIcon({ size }: { size?: number | undefined }) {
  return <IconListPenOutlineRegular size={size} />
}
