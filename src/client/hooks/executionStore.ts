/**
 * Module-level execution registry: click-driven tool executions outlive the
 * page component that started them (switching pages never aborts a host
 * workflow), so polling state lives here instead of React state. The store
 * is a bare observable for useSyncExternalStore; answers and cancels still
 * flow through the real HTTP routes (never local status writes).
 */
import { api, type ExecutionView } from '../api.ts'

/** One tracked execution; `lost` marks a record whose host execution vanished (restart). */
export interface TrackedExecution extends ExecutionView { lost?: boolean }

const POLL_MS = 1500

const records = new Map<string, TrackedExecution>()
const timers = new Map<string, number>()
const listeners = new Set<() => void>()
let snapshot: readonly TrackedExecution[] = []

function publish(): void {
  snapshot = [...records.values()]
  for (const listener of listeners) listener()
}

function stopPolling(callId: string): void {
  const timer = timers.get(callId)
  if (timer !== undefined) {
    window.clearInterval(timer)
    timers.delete(callId)
  }
}

async function poll(callId: string): Promise<void> {
  try {
    const view = await api.execution(callId) as TrackedExecution
    records.set(callId, view)
    publish()
    if (view.status !== 'running' && view.status !== 'waiting_human') stopPolling(callId)
  } catch {
    // Unknown execution (host restarted or record evicted): an in-flight record
    // becomes "lost" instead of silently pretending to still run.
    const current = records.get(callId)
    if (current !== undefined && (current.status === 'running' || current.status === 'waiting_human')) {
      records.set(callId, { ...current, lost: true })
      publish()
    }
    stopPolling(callId)
  }
}

function track(callId: string): void {
  void poll(callId)
  timers.set(callId, window.setInterval(() => { void poll(callId) }, POLL_MS))
}

/** The observable execution registry shared by every panel page. */
export const executionStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot(): readonly TrackedExecution[] {
    return snapshot
  },
  /** Start a guarded tool execution and begin tracking it. */
  async start(tool: string, args: Record<string, unknown>): Promise<string> {
    const { callId } = await api.start(tool, args)
    const projectId = typeof args.projectId === 'string' ? args.projectId : undefined
    records.set(callId, {
      callId, tool, status: 'running', startedAt: new Date().toISOString(), question: null,
      ...projectId === undefined ? {} : { projectId },
    })
    publish()
    track(callId)
    return callId
  },
  /**
   * Adopt a host-side execution this session did not start (another browser,
   * or before a reload): in-flight records resume polling so their progress
   * and pending gates become visible here. Already-tracked and settled
   * records are ignored.
   */
  adopt(view: TrackedExecution): void {
    if (records.has(view.callId)) return
    if (view.status !== 'running' && view.status !== 'waiting_human') return
    records.set(view.callId, view)
    publish()
    track(view.callId)
  },
  /** Answer the pending human question (a real user gesture). */
  answer(callId: string, selected: string, custom?: string): Promise<{ answered: boolean }> {
    return api.answer(callId, selected, custom)
  },
  /** Cancel one execution; its record settles as cancelled. */
  cancel(callId: string): Promise<{ cancelled: boolean }> {
    return api.cancel(callId)
  },
}
