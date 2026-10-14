/** Line icons from the V4 workbench design system, rendered as clean SVG JSX. */
import type { ReactNode } from 'react'

const P = (d: string) => <path d={d} />
const icons: Record<string, ReactNode> = {
  home: P('m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z'),
  folder: P('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
  library: P('M5 3v18M9 5v16M13 3v18M17 7l4 13'),
  clock: <><circle cx="12" cy="12" r="9" />{P('M12 7v5l3 2')}</>,
  activity: P('M3 12h4l3-7 4 14 3-7h4'),
  file: <>{P('M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z')}{P('M13 2v7h7')}</>,
  diff: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" />{P('M6 9h2M6 13h2m8-4h2m-2 4h2')}</>,
  microscope: P('m7 21 4-4M5 9l4-4 7 7-4 4zM6 3l2-2 8 8-2 2M4 21h16'),
  settings: <>{P('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z')}{P('M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0')}</>,
  check: P('m4 12 5 5L20 6'),
  plus: P('M12 5v14M5 12h14'),
  search: <><circle cx="10" cy="10" r="6" />{P('m15 15 6 6')}</>,
  spark: P('m12 2 2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1z'),
  message: P('M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7l-4 3V6a1 1 0 0 1 1-1z'),
  chat: P('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
  send: P('m3 11 18-8-8 18-2-8z'),
  layers: P('m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5'),
  coins: <><circle cx="12" cy="12" r="9" />{P('M15 8H11a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v2m0 8v2')}</>,
  book: P('M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1zM12 6v15'),
  upload: P('M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5'),
  link: <>{P('M10 13a5 5 0 0 0 8 .6l2-2a5 5 0 0 0-7-7l-2 2')}{P('M14 11a5 5 0 0 0-8-.6l-2 2a5 5 0 0 0 7 7l2-2')}</>,
  shield: P('m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6z'),
  close: <>{P('M6 6l12 12M18 6L6 18')}</>,
  refresh: <>{P('M21 3v6h-6M3 21v-6h6')}{P('M4 9a8 8 0 0 1 14-4l3 4M3 15l3 4a8 8 0 0 0 14-4')}</>,
  alert: <><circle cx="12" cy="12" r="9" />{P('M12 8v4m0 4h.01')}</>,
  arrowRight: P('M5 12h14m-6-6 6 6-6 6'),
}

export function Icon({ name, size = 17 }: { name: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] ?? icons.file}
    </svg>
  )
}
