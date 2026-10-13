/** App-wide state: current project overview, toasts, and the gated-run driver with its Human Gate modal. */
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, cancelRun, get, pp, runTool } from './api.ts'
import type { Execution, HumanQuestion, Selection } from './api.ts'
import type { Overview } from './types.ts'
import { Btn, Modal } from './ui.tsx'
import { useModelSelection } from './model-selection.ts'

interface Ask { exec: Execution & { question: HumanQuestion }; resolve: (a: { selected: string; custom?: string } | undefined) => void }
export interface Store extends ReturnType<typeof useModelSelection> {
  pid: string | undefined
  ov: Overview | undefined
  loading: boolean
  error: string | undefined
  refresh(): Promise<void>
  toast(msg: string, tone?: 'ok' | 'err'): void
  /** Run a mutation; errors become a toast and the overview is reloaded afterwards. */
  act<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined>
  /** Start a gated tool run, following it to completion; returns the final execution. */
  run(tool: string, args: Record<string, unknown>, opts?: { ok?: string; model?: Selection }): Promise<Execution | undefined>
  active: Execution | undefined
}

const Ctx = createContext<Store | undefined>(undefined)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('Store missing')
  return s
}

export const errText = (e: unknown) => e instanceof ApiError ? `${e.message}（${e.code}）` : e instanceof Error ? e.message : String(e)

export function StoreProvider({ pid, children }: { pid: string | undefined; children: ReactNode }) {
  const models = useModelSelection()
  const [ov, setOv] = useState<Overview>()
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<{ pid: string; message: string }>()
  const [toastMsg, setToast] = useState<{ msg: string; tone: string }>()
  const [ask, setAsk] = useState<Ask>()
  const [custom, setCustom] = useState('')
  const [active, setActive] = useState<Execution>()
  const timer = useRef<number | undefined>(undefined)
  const pidRef = useRef(pid)
  const refreshId = useRef(0)
  pidRef.current = pid

  const toast = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tone })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(undefined), tone === 'err' ? 6000 : 3000)
  }, [])

  const refresh = useCallback(async () => {
    const id = pidRef.current
    const request = ++refreshId.current
    if (!id) { setOv(undefined); setLoading(false); setFailure(undefined); return }
    setLoading(true)
    try {
      const data = await get<Overview>(pp(id, 'overview'))
      if (pidRef.current === id && refreshId.current === request) { setOv(data); setFailure(undefined) }
    } catch (e) {
      if (pidRef.current === id && refreshId.current === request) setFailure({ pid: id, message: errText(e) })
    } finally {
      if (pidRef.current === id && refreshId.current === request) setLoading(false)
    }
  }, [])

  const act = useCallback(async <T,>(fn: () => Promise<T>, ok?: string) => {
    try {
      const out = await fn()
      if (ok) toast(ok)
      return out
    } catch (e) { toast(errText(e), 'err'); return undefined } finally { await refresh() }
  }, [refresh, toast])

  const run = useCallback(async (tool: string, args: Record<string, unknown>, opts: { ok?: string; model?: Selection } = {}) => {
    const id = pidRef.current
    if (!id) return undefined
    try {
      const exec = await runTool(id, tool, args, {
        onUpdate: e => setActive(e),
        ask: exec => new Promise(resolve => { setCustom(''); setAsk({ exec, resolve }) }),
      }, opts.model ?? models.selection)
      if (exec.status === 'completed') { if (opts.ok) toast(opts.ok) }
      else if (exec.status === 'cancelled') toast('已取消，本次未产生任何变更。', 'err')
      else toast(`运行失败：${exec.error ?? exec.status}`, 'err')
      return exec
    } catch (e) { toast(errText(e), 'err'); return undefined } finally { setActive(undefined); await refresh() }
  }, [refresh, toast, models.selection])

  const answer = (a: { selected: string; custom?: string } | undefined) => { ask?.resolve(a); setAsk(undefined) }
  // A new route must never expose the old project's controls while its request is pending.
  const currentOverview = ov?.project.id === pid ? ov : undefined
  const error = failure && failure.pid === pid ? failure.message : undefined
  const store: Store = { pid, ov: currentOverview, loading, error, refresh, toast, act, run, active, ...models }
  return (
    <Ctx.Provider value={store}>
      {children}
      {active && !ask ? (
        <div className="run-banner" role="status">
          <span className="online-dot" /> 正在运行 {active.tool.replace(/^marketpilot_(v4_)?/, '')}：{active.status === 'running' ? '运行中…' : active.status}
          <Btn small kind="text" onClick={() => cancelRun(active.callId).catch(() => {})}>取消</Btn>
        </div>
      ) : null}
      <Modal open={Boolean(ask)} title={ask?.exec.question.header || '需要人工确认'} onClose={() => answer(undefined)}
        subtitle="Human Gate：这一步必须由人确认，AI 不能代替。"
        actions={<>
          <Btn kind="ghost" onClick={() => answer(undefined)}>取消运行</Btn>
          {ask?.exec.question.options.map(o => (
            <Btn key={o} kind={/确认|批准|发布|采纳/.test(o) ? 'primary' : 'ghost'} onClick={() => answer({ selected: o, ...custom.trim() ? { custom: custom.trim() } : {} })}>{o}</Btn>
          ))}
        </>}>
        <p><strong>{ask?.exec.question.question}</strong></p>
        {ask?.exec.question.detail ? <pre className="gate-detail">{ask.exec.question.detail}</pre> : null}
        <label className="form-label"><span>备注（可选）</span>
          <textarea className="text-field" rows={2} value={custom} onChange={e => setCustom(e.target.value)} /></label>
      </Modal>
      <div className={toastMsg ? `toast show ${toastMsg.tone}` : 'toast'} role="alert">{toastMsg?.msg}</div>
    </Ctx.Provider>
  )
}
