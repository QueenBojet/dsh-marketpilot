/**
 * Keyboard behavior for the drawer/reader dialogs: Escape closes (matching
 * the existing mask click), Tab cycles within the dialog, and focus returns
 * to the element that owned it when the dialog opened. Human-gate dialogs are
 * deliberately exempt — their answers must be explicit choices, never an
 * Escape default.
 */
import { useEffect, useRef } from 'react'

/** Attach to a dialog element while it is open. */
export function useDrawerKeys(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  // Keep the latest close callback without re-running the key listeners.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || ref.current === null) return
      const focusable = [...ref.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter(el => (el as { disabled?: boolean }).disabled !== true && el.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused?.focus()
    }
  }, [open])
  return ref
}
