/** Display helpers shared by the panel pages. */

/** Format an ISO timestamp for list rows; falls back to the raw value. */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}
