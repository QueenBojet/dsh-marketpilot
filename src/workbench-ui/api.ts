/** Same-origin client for the MarketPilot workbench API; every mutation carries the CSRF header. */
export const API = '/marketpilot/api'

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message) }
}

export async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (method !== 'GET') headers['x-marketpilot-request'] = '1'
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}/${path}`, {
    method, credentials: 'same-origin', headers, ...body === undefined ? {} : { body: JSON.stringify(body) },
  })
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) throw new ApiError(String(data.error ?? `HTTP ${res.status}`), String(data.code ?? 'HTTP_ERROR'), res.status)
  return data as T
}

export const get = <T = unknown>(path: string) => request<T>('GET', path)
export const post = <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body ?? {})
export const put = <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {})
export const patch = <T = unknown>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {})
export const del = <T = unknown>(path: string) => request<T>('DELETE', path)

export const pp = (pid: string, rest: string) => `projects/${encodeURIComponent(pid)}/v4/${rest}`

export interface HumanQuestion { header: string; question: string; detail: string; options: string[] }
export interface Execution {
  callId: string; tool: string; status: 'running' | 'waiting_human' | 'completed' | 'failed' | 'cancelled'
  startedAt: string; projectId?: string; question: HumanQuestion | null; value?: unknown; error?: string
}
export interface Selection { provider: string; model: string; reasoningEffort?: string }

/** Hooks the run driver uses to surface progress and ask the human for a gate decision. */
export interface RunHooks {
  onUpdate(exec: Execution): void
  /** Resolve with the chosen option, or undefined to cancel the run. */
  ask(exec: Execution & { question: HumanQuestion }): Promise<{ selected: string; custom?: string } | undefined>
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Start a gated V4 tool run and follow it to a terminal state, routing Human Gate questions to `hooks.ask`. */
export async function runTool(pid: string, tool: string, args: Record<string, unknown>, hooks: RunHooks, modelSelection?: Selection): Promise<Execution> {
  const { callId } = await post<{ callId: string }>(pp(pid, 'run'), { tool, args, ...modelSelection ? { modelSelection } : {} })
  let answered = ''
  for (;;) {
    const exec = await get<Execution>(`executions/${encodeURIComponent(callId)}`)
    hooks.onUpdate(exec)
    if (exec.status === 'waiting_human' && exec.question) {
      const key = `${exec.question.header}|${exec.question.question}`
      if (answered !== key) {
        const answer = await hooks.ask(exec as Execution & { question: HumanQuestion })
        if (!answer) { await post(`executions/${encodeURIComponent(callId)}/cancel`); answered = key; continue }
        await post(`executions/${encodeURIComponent(callId)}/answer`, answer)
        answered = key
      }
    } else if (exec.status !== 'running') return exec
    await sleep(600)
  }
}

export async function cancelRun(callId: string) { await post(`executions/${encodeURIComponent(callId)}/cancel`) }

/** Read a browser File as base64 without loading huge strings through String.fromCharCode spreads. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.onload = () => {
      const s = String(reader.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

export async function downloadDocx(pid: string, did: string): Promise<{ fileName: string; sha256: string; reviewed: boolean }> {
  const res = await fetch(`${API}/${pp(pid, `docs/${encodeURIComponent(did)}/docx`)}`, { credentials: 'same-origin' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>
    throw new ApiError(String(data.error ?? `HTTP ${res.status}`), String(data.code ?? 'HTTP_ERROR'), res.status)
  }
  const disp = res.headers.get('content-disposition') ?? ''
  const m = /filename\*=UTF-8''([^;]+)/.exec(disp)
  const fileName = m ? decodeURIComponent(m[1]!) : 'document.docx'
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { fileName, sha256: res.headers.get('x-marketpilot-sha256') ?? '', reviewed: res.headers.get('x-marketpilot-reviewed') === 'true' }
}
