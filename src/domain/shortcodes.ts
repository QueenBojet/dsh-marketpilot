/**
 * Business short codes over record UUIDs. Formal reading surfaces (generated
 * artifacts, solution/baseline/compliance templates, detail drawers) show
 * `REQ-01`-style labels instead of raw UUIDs, while every persisted reference
 * keeps the real UUID primary key — this module only derives a deterministic,
 * reproducible display mapping. Pure data in, pure data out: no Harness
 * runtime, no zod, no DOM, so both the server renderers and the client
 * bundle share one implementation and never disagree on a code.
 */

/** Record families that carry a short code. */
export type ShortCodeKind =
  | 'requirement' | 'evidence' | 'alternative' | 'decision'
  | 'tenderItem' | 'document' | 'artifact'

/** The persisted half of the short-code mapping (see {@link applyShortCodeBook}).
 * Stored on the project state as an optional `codeBook`; absent on legacy
 * projects, which keep the derived mapping until their next write. */
export interface ShortCodeBook {
  /** Next sequence number per family — deletions never reuse a number. */
  readonly seq: Readonly<Record<string, number>>
  /** Frozen `record id → code` assignments, assigned once at creation. */
  readonly codes: Readonly<Record<string, string>>
}

export function emptyShortCodeBook(): ShortCodeBook {
  return { seq: {}, codes: {} }
}

const PREFIX: Record<ShortCodeKind, string> = {
  requirement: 'REQ', evidence: 'EVD', alternative: 'ALT', decision: 'DEC',
  tenderItem: 'TND', document: 'DOC', artifact: 'ART',
}

const KIND_LABEL: Record<ShortCodeKind, string> = {
  requirement: '需求', evidence: '证据', alternative: '技术路线', decision: '人工决策',
  tenderItem: '招标条款', document: '资料', artifact: '成果',
}

/** The structural input: any projection of these collections qualifies.
 * `codeBook` (optional) pins previously assigned codes over the derivation;
 * JSON `null` (wire absence on legacy projects) is normalized to absent. */
export interface ShortCodeCollections {
  codeBook?: ShortCodeBook | null | undefined
  requirements?: readonly { id: string; normalizedText?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined }[] | undefined
  evidence?: readonly { id: string; title?: string | undefined; statement?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined }[] | undefined
  alternatives?: readonly { id: string; name?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined }[] | undefined
  decisions?: readonly { id: string; rationale?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined }[] | undefined
  tenderItems?: readonly { id: string; clauseId?: string | undefined; normalizedRequirement?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined }[] | undefined
  documents?: readonly { id: string; name?: string | undefined; importedAt?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined }[] | undefined
  artifacts?: readonly { id: string; name?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined }[] | undefined
}

export interface ShortCodeEntry {
  code: string
  kind: ShortCodeKind
  kindLabel: string
  label: string
  id: string
}

export interface ShortCodeIndex {
  /** The stable short code for a record id, or undefined when unknown. */
  codeOf(id: string): string | undefined
  /** All entries in code order — the mapping table behind traceability. */
  entries(): readonly ShortCodeEntry[]
  /** Replace known UUIDs and compact legacy Harness reviewer labels. Other ids stay untouched. */
  replace(text: string): string
}

/** Full canonical UUID pattern (case-insensitive). */
export const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** The 8-char trace fragment kept next to every code. */
export function shortFragment(id: string): string {
  return id.slice(0, 8)
}

/** Truncate a record label for the mapping table without breaking CJK text. */
function clampLabel(label: string, max = 42): string {
  const trimmed = label.replace(/\s+/g, ' ').trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`
}

/** Older Harness gates used a call/item pair instead of a canonical UUID. */
function compactGateIdentity(text: string): string {
  return text.replace(/Harness human \(call_([0-9a-f]{16,64})(?:\|item_[0-9a-f]{16,64})?\)/gi,
    (_match, callId: string) => `Harness human (#${callId.slice(0, 8)})`)
}

/** Keep a trace fragment for both UUID and legacy call/item reviewer identities. */
export function reviewerLabel(reviewer: string): string {
  return compactGateIdentity(reviewer).replace(UUID_PATTERN, match => `#${match.slice(0, 8)}`)
}

interface Seed { kind: ShortCodeKind; id: string; time: string; label: string }

/**
 * Build the deterministic index. Within a family, ordering is by record
 * creation time, tie-broken by id — so the same persisted state always
 * produces the same codes, on the server and in any browser. When a
 * {@link ShortCodeBook} is supplied, its frozen assignments win over the
 * derivation, so codes survive deletions of sibling records unchanged.
 */
export function buildShortCodeIndex(collections: ShortCodeCollections): ShortCodeIndex {
  // `null` (JSON absence over the wire) must behave exactly like an absent
  // book — a null here crashed the whole client slot on legacy projects.
  const book = collections.codeBook ?? undefined
  const frozen = new Set<string>(book === undefined ? [] : Object.values(book.codes))
  const seeds: Seed[] = []
  const push = <R extends { id: string }>(kind: ShortCodeKind, rows: readonly R[] | undefined,
    labelOf: (row: R) => string, timeOf: (row: R) => string): void => {
    for (const row of rows ?? []) {
      if (typeof row.id !== 'string' || row.id === '') continue
      seeds.push({ kind, id: row.id, time: timeOf(row) ?? '', label: labelOf(row) })
    }
  }
  push('requirement', collections.requirements, row => row.normalizedText ?? '', row => row.createdAt ?? row.updatedAt ?? '')
  push('evidence', collections.evidence, row => row.title ?? row.statement ?? '', row => row.createdAt ?? row.updatedAt ?? '')
  push('alternative', collections.alternatives, row => row.name ?? '', row => row.createdAt ?? row.updatedAt ?? '')
  push('decision', collections.decisions, row => row.rationale ?? '', row => row.createdAt ?? row.updatedAt ?? '')
  push('tenderItem', collections.tenderItems, row => row.clauseId !== undefined ? `${row.clauseId} ${row.normalizedRequirement ?? ''}` : row.normalizedRequirement ?? '', row => row.createdAt ?? row.updatedAt ?? '')
  push('document', collections.documents, row => row.name ?? '', row => row.importedAt ?? row.createdAt ?? '')
  push('artifact', collections.artifacts, row => row.name ?? '', row => row.createdAt ?? row.updatedAt ?? '')

  const byId = new Map<string, ShortCodeEntry>()
  const counters = new Map<ShortCodeKind, number>()
  const ordered = seeds
    .map((seed, index) => ({ seed, index }))
    .sort((left, right) => left.seed.time.localeCompare(right.seed.time)
      || left.seed.id.localeCompare(right.seed.id)
      || left.index - right.index)
  for (const { seed } of ordered) {
    if (byId.has(seed.id)) continue
    const pinned = book?.codes[seed.id]
    if (typeof pinned === 'string' && pinned !== '') {
      byId.set(seed.id, {
        code: pinned, kind: seed.kind, kindLabel: KIND_LABEL[seed.kind],
        label: clampLabel(seed.label === '' ? '—' : seed.label), id: seed.id,
      })
      continue
    }
    let next = (counters.get(seed.kind) ?? 0) + 1
    let code = `${PREFIX[seed.kind]}-${String(next).padStart(2, '0')}`
    // Skip numbers frozen for other (possibly deleted) records.
    while (frozen.has(code)) {
      next += 1
      code = `${PREFIX[seed.kind]}-${String(next).padStart(2, '0')}`
    }
    counters.set(seed.kind, next)
    frozen.add(code)
    byId.set(seed.id, {
      code, kind: seed.kind, kindLabel: KIND_LABEL[seed.kind],
      label: clampLabel(seed.label === '' ? '—' : seed.label), id: seed.id,
    })
  }

  return {
    codeOf(id: string): string | undefined {
      return typeof id === 'string' ? byId.get(id)?.code : undefined
    },
    entries(): readonly ShortCodeEntry[] {
      return [...byId.values()].sort((left, right) => left.code.localeCompare(right.code))
    },
    replace(text: string): string {
      if (typeof text !== 'string' || text === '') return text
      return compactGateIdentity(text).replace(UUID_PATTERN, match => {
        const code = byId.get(match.toLowerCase())?.code
        return code ?? match
      })
    },
  }
}

/**
 * Repository-side persistence step: give every record still missing a code
 * its frozen family number, in the exact (createdAt, id) order the derived
 * index uses — so a legacy project's first write pins precisely the codes it
 * has always displayed. Assignments are never reused or renumbered: deleting
 * a record retires its code, and later records continue after the family's
 * high-water mark. Mutates `book`; returns whether anything changed (so a
 * no-op read does not bump the project revision).
 */
export function applyShortCodeBook(collections: ShortCodeCollections, book: { seq: Record<string, number>; codes: Record<string, string> }): boolean {
  const seeds: Seed[] = []
  const push = <R extends { id: string }>(kind: ShortCodeKind, rows: readonly R[] | undefined,
    timeOf: (row: R) => string): void => {
    for (const row of rows ?? []) {
      if (typeof row.id !== 'string' || row.id === '') continue
      seeds.push({ kind, id: row.id, time: timeOf(row) ?? '', label: '' })
    }
  }
  push('requirement', collections.requirements, row => row.createdAt ?? row.updatedAt ?? '')
  push('evidence', collections.evidence, row => row.createdAt ?? row.updatedAt ?? '')
  push('alternative', collections.alternatives, row => row.createdAt ?? row.updatedAt ?? '')
  push('decision', collections.decisions, row => row.createdAt ?? row.updatedAt ?? '')
  push('tenderItem', collections.tenderItems, row => row.createdAt ?? row.updatedAt ?? '')
  push('document', collections.documents, row => row.importedAt ?? row.createdAt ?? '')
  push('artifact', collections.artifacts, row => row.createdAt ?? row.updatedAt ?? '')

  const taken = new Set(Object.values(book.codes))
  let changed = false
  for (const seed of seeds.sort((left, right) => left.time.localeCompare(right.time) || left.id.localeCompare(right.id))) {
    if (book.codes[seed.id] !== undefined) continue
    let next = (book.seq[seed.kind] ?? 0) + 1
    let code = `${PREFIX[seed.kind]}-${String(next).padStart(2, '0')}`
    while (taken.has(code)) {
      next += 1
      code = `${PREFIX[seed.kind]}-${String(next).padStart(2, '0')}`
    }
    book.codes[seed.id] = code
    book.seq[seed.kind] = next
    taken.add(code)
    changed = true
  }
  return changed
}

/**
 * The mapping appendix rendered at the end of generated artifacts: every code
 * keeps its record fragment so the full UUID stays retrievable without ever
 * appearing inline in the formal document body.
 */
export function renderCodeAppendix(index: ShortCodeIndex): string {
  const entries = index.entries()
  if (entries.length === 0) return ''
  return ['', '## 附录：编号对照', '',
    '正文使用业务短编号；括号内为记录 ID 前 8 位，可用于系统内精确定位原始记录。',
    '',
    ...entries.map(entry => `- \`${entry.code}\` ${entry.kindLabel} · ${entry.label} ·（${shortFragment(entry.id)}）`),
  ].join('\n')
}
