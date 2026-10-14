/** Shared presentational pieces: buttons with disabled reasons, badges, modal, drawer, labels, and structured Markdown block renderer. */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

/** A button that is either live or disabled with a stated reason (shown as tooltip and optional inline caption). */
export function Btn(props: {
  children: ReactNode; onClick?: () => void | Promise<void>; kind?: 'primary' | 'ghost' | 'teal' | 'text'; small?: boolean
  disabled?: string | false | null | undefined; title?: string; type?: 'button' | 'submit'; showReason?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const reason = props.disabled || (busy ? '处理中…' : '')
  return (
    <span className="btn-wrap">
      <button type={props.type ?? 'button'} className={cx('btn', props.kind, props.small && 'small')} disabled={Boolean(reason)}
        title={reason || props.title} aria-disabled={Boolean(reason)}
        onClick={async () => {
          if (!props.onClick) return
          setBusy(true)
          try { await props.onClick() } finally { setBusy(false) }
        }}>{props.children}</button>
      {props.showReason && props.disabled ? <span className="disabled-reason">{props.disabled}</span> : null}
    </span>
  )
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'warn' | 'teal' | 'blue' | 'red' | 'gray' }) {
  return <span className={cx('badge', tone)}>{children}</span>
}

/** Explicit marker for anything that is not wired to a real capability. */
export const Pending = ({ children }: { children?: ReactNode }) => <span className="badge gray" title="该功能尚未接入真实能力">演示/待接入{children ? `：${children}` : ''}</span>

export function Modal(props: { open: boolean; title: string; subtitle?: ReactNode; children: ReactNode; onClose: () => void; actions?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.open, props.onClose])
  if (!props.open) return null
  return createPortal(
    <div className="overlay open" onMouseDown={e => { if (e.target === e.currentTarget) props.onClose() }}>
      <div className={cx('modal', props.wide && 'wide')} role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="modal-head">
          <h2>{props.title}</h2>
          {props.subtitle ? <div className="subtitle">{props.subtitle}</div> : null}
        </div>
        <div className="modal-body">{props.children}</div>
        <div className="modal-actions">{props.actions ?? <Btn kind="ghost" onClick={props.onClose}>关闭</Btn>}</div>
      </div>
    </div>, document.body
  )
}

export function Drawer(props: { open: boolean; title: string; cap?: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  return (
    <>
      <div className={cx('detail-shade', props.open && 'open')} onClick={props.onClose} />
      <aside className={cx('drawer', props.open && 'open')} aria-hidden={!props.open} aria-label={props.title}>
        <div className="drawer-top">
          <div>{props.cap ? <div className="eyebrow">{props.cap}</div> : null}<h2>{props.title}</h2></div>
          <button className="icon-btn" aria-label="关闭" onClick={props.onClose}>×</button>
        </div>
        <div className="drawer-scroll">{props.open ? props.children : null}</div>
        {props.footer ? <div className="drawer-footer">{props.footer}</div> : null}
      </aside>
    </>
  )
}

export function Panel(props: { title: ReactNode; subtitle?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('card panel', props.className)}>
      <div className="panel-heading">
        <div>
          <h2>{props.title}</h2>
          {props.subtitle ? <p>{props.subtitle}</p> : null}
        </div>
        {props.extra ? <div className="actions">{props.extra}</div> : null}
      </div>
      {props.children}
    </section>
  )
}

export function PageHead(props: { eyebrow: string; title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow">{props.eyebrow}</div>
        <h1>{props.title}</h1>
        {props.lede ? <p className="lede">{props.lede}</p> : null}
      </div>
      {props.actions ? <div className="actions">{props.actions}</div> : null}
    </div>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty-note">{children}</div>

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return <label className="form-label"><span>{props.label}</span>{props.children}{props.hint ? <small className="tiny-caption">{props.hint}</small> : null}</label>
}

export const fmtTime = (s?: string) => s ? s.replace('T', ' ').slice(0, 16) : '—'

export function inlineText(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="inline-code">{part.slice(1, -1)}</code>
    return part
  })
}

/** Structured Markdown block renderer for reports, brainstorm summaries, and document previews. */
export function Blocks({ content, className }: { content: string; className?: string }) {
  const out: ReactNode[] = []
  let list: string[] = []
  let olist: string[] = []
  let table: string[][] = []
  const flush = () => {
    if (list.length) { out.push(<ul key={`ul-${out.length}`} className="md-list">{list.map((x, i) => <li key={i}>{inlineText(x)}</li>)}</ul>); list = [] }
    if (olist.length) { out.push(<ol key={`ol-${out.length}`} className="md-list">{olist.map((x, i) => <li key={i}>{inlineText(x)}</li>)}</ol>); olist = [] }
    if (table.length) {
      const [head, ...rows] = table
      out.push(
        <div key={`tb-${out.length}`} className="table-scroll">
          <table className="paper-table">
            <thead><tr>{head!.map((c, i) => <th key={i}>{inlineText(c)}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inlineText(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      table = []
    }
  }
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^\|.*\|$/.test(line) && line.length > 2) {
      if (list.length || olist.length) { const t = table; table = []; flush(); table = t }
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      if (!cells.every(c => /^:?-{2,}:?$/.test(c))) table.push(cells)
      continue
    }
    if (/^[-*•]\s+/.test(line)) {
      if (table.length || olist.length) { const l = list; list = []; flush(); list = l }
      list.push(line.replace(/^[-*•]\s+/, ''))
      continue
    }
    if (/^\d+[.)]\s+/.test(line)) {
      if (table.length || list.length) { const ol = olist; olist = []; flush(); olist = ol }
      olist.push(line.replace(/^\d+[.)]\s+/, ''))
      continue
    }
    flush()
    if (!line || /^-{3,}$/.test(line)) continue
    if (line.startsWith('#### ')) out.push(<h5 key={out.length} className="md-h4">{inlineText(line.slice(5))}</h5>)
    else if (line.startsWith('### ')) out.push(<h4 key={out.length} className="md-h3">{inlineText(line.slice(4))}</h4>)
    else if (line.startsWith('## ')) out.push(<h4 key={out.length} className="md-h2">{inlineText(line.slice(3))}</h4>)
    else if (line.startsWith('# ')) out.push(<h3 key={out.length} className="md-h1">{inlineText(line.slice(2))}</h3>)
    else if (line.startsWith('> ')) out.push(<div key={out.length} className="boxnote md-quote">{inlineText(line.slice(2))}</div>)
    else out.push(<p key={out.length} className="md-p">{inlineText(line)}</p>)
  }
  flush()
  return <div className={cx('md-blocks', className)}>{out}</div>
}

export const REQ_STATUS: Record<string, [string, 'warn' | 'teal' | 'blue' | 'red' | 'gray']> = {
  proposed: ['待确认', 'warn'], confirmed: ['已确认', 'teal'], unknown: ['未知', 'gray'], conflict: ['冲突', 'red'], superseded: ['已替代', 'gray'],
}
export const REVIEW: Record<string, [string, 'warn' | 'teal' | 'gray' | 'red']> = {
  none: ['未审核', 'gray'], valid: ['审核有效', 'teal'], stale: ['审核已失效', 'red'],
}
export const ROUTE_SRC: Record<string, string> = { override: '本次指定', project: '项目偏好', default: '全局默认', none: '无模型' }
export const WEB_STATUS: Record<string, string> = {
  not_requested: '未请求联网', unavailable: '联网不可用（未验证）', fetched: '已获取正文', partial: '部分获取', failed: '获取失败',
}
