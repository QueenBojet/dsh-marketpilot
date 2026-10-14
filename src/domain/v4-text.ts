/**
 * Rule-based text comparison for intake batches. Cheap and deterministic: it
 * only proposes candidate changes; humans decide what becomes a Requirement.
 */
import { createHash } from 'node:crypto'

export interface SourceLine { readonly text: string; readonly locator: string }
export interface CorpusLine extends SourceLine {
  readonly documentId?: string
  readonly requirementId?: string
  readonly confirmed?: boolean
}
export interface LineChange {
  readonly kind: 'added' | 'modified' | 'conflict' | 'background'
  readonly text: string
  readonly locator: string
  readonly old?: CorpusLine
  readonly similarity?: number
}

const REQUIREMENT_MARKER = /须|必须|应当|应|要求|不低于|不高于|不少于|不超过|不大于|不小于|至少|最多|≥|≤|>=|<=|shall|must|should|require/i
const NUMBER = /\d+(?:\.\d+)?/g

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Stable JSON (sorted keys) so hashes do not depend on property order. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}
export function hashOf(value: unknown): string { return sha256(stableStringify(value)) }

/** Split text into requirement-sized lines with a human-readable locator. */
export function splitLines(text: string, prefix = '第'): SourceLine[] {
  const out: SourceLine[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    for (const part of raw.split(/(?<=[。；;])/)) {
      const clean = part.replace(/^\s*(?:[-*•·]|\d+[.、)]|[（(]\d+[)）])\s*/, '').trim()
      if (clean.length >= 4 && clean.length <= 500) out.push({ text: clean, locator: `${prefix}${index + 1}行` })
    }
  })
  return out
}

function normalize(value: string): string { return value.replace(/[\s，,。.;；:：、"'“”‘’()（）\-]/g, '').toLowerCase() }
function bigrams(value: string): Set<string> {
  const n = normalize(value)
  const set = new Set<string>()
  for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2))
  if (n.length === 1) set.add(n)
  return set
}
/** Dice coefficient over character bigrams; works for CJK and Latin text. */
export function similarity(a: string, b: string): number {
  const x = bigrams(a), y = bigrams(b)
  if (!x.size || !y.size) return 0
  let common = 0
  for (const g of x) if (y.has(g)) common++
  return (2 * common) / (x.size + y.size)
}
function numbers(value: string): string { return [...value.matchAll(NUMBER)].map(m => m[0]).join('|') }

/**
 * Compare new lines with the existing corpus. Exact repeats are dropped; close
 * matches with different wording are `modified`, or `conflict` when they
 * contradict a confirmed requirement's figures; unmatched lines with
 * requirement wording are `added`, the rest `background`.
 */
export function compareLines(incoming: readonly SourceLine[], corpus: readonly CorpusLine[], limit = 400): LineChange[] {
  const known = new Set(corpus.map(c => normalize(c.text)))
  const prepared = corpus.map(c => ({ line: c, grams: bigrams(c.text) }))
  const seen = new Set<string>()
  const out: LineChange[] = []
  for (const line of incoming) {
    const key = normalize(line.text)
    if (!key || known.has(key) || seen.has(key)) continue
    seen.add(key)
    const grams = bigrams(line.text)
    let best: { line: CorpusLine; score: number } | undefined
    for (const c of prepared) {
      let common = 0
      for (const g of grams) if (c.grams.has(g)) common++
      const score = grams.size + c.grams.size ? (2 * common) / (grams.size + c.grams.size) : 0
      if (!best || score > best.score) best = { line: c.line, score }
    }
    if (best && best.score >= 0.5) {
      const differs = numbers(best.line.text) !== numbers(line.text)
      const kind = best.line.confirmed && differs ? 'conflict' : 'modified'
      out.push({ kind, text: line.text, locator: line.locator, old: best.line, similarity: Math.round(best.score * 100) / 100 })
    } else {
      out.push({ kind: REQUIREMENT_MARKER.test(line.text) ? 'added' : 'background', text: line.text, locator: line.locator })
    }
    if (out.length >= limit) break
  }
  return out
}

export function guessPriority(value: string): 'must' | 'should' | 'could' {
  if (/必须|须|shall|must|不得|严禁/i.test(value)) return 'must'
  if (/宜|可选|could|may|optional/i.test(value)) return 'could'
  return 'should'
}
export function guessRequirementType(value: string): 'functional' | 'performance' | 'interface' | 'environment' | 'safety'
  | 'compliance' | 'installation' | 'maintenance' | 'commercial' | 'constraint' | 'other' {
  const rules: [RegExp, ReturnType<typeof guessRequirementType>][] = [
    [/接口|协议|通信|Modbus|RS-?485|以太网|NMEA|interface/i, 'interface'],
    [/温度|湿度|防护|IP\d|盐雾|海况|水深|环境|environment/i, 'environment'],
    [/防爆|安全|报警|safety|Ex\b/i, 'safety'],
    [/认证|标准|规范|船级社|CCS|DNV|ABS|compliance|standard/i, 'compliance'],
    [/安装|布置|吊装|installation/i, 'installation'],
    [/维护|保养|备件|寿命|maintenance/i, 'maintenance'],
    [/价格|报价|付款|交期|商务|质保|commercial/i, 'commercial'],
    [/精度|灵敏|分辨率|响应时间|检测限|量程|ppm|功耗|performance/i, 'performance'],
  ]
  for (const [pattern, type] of rules) if (pattern.test(value)) return type
  return 'functional'
}
