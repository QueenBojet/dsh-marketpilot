/**
 * Business status → localized label + Tag tone. Raw codes stay visible as
 * the fallback so advanced detail never hides the underlying value.
 */
import { Tag, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

type StatusKind = 'project' | 'run' | 'requirement'

interface StatusEntry { readonly key: MarketPilotTextKey; readonly tone: TagTone }

const PROJECT_STATUS: Record<string, StatusEntry> = {
  draft: { key: 'projectStatus.draft', tone: 'neutral' },
  requirements_ready: { key: 'projectStatus.requirements_ready', tone: 'info' },
  researching: { key: 'projectStatus.researching', tone: 'info' },
  alternatives_ready: { key: 'projectStatus.alternatives_ready', tone: 'warning' },
  decision_confirmed: { key: 'projectStatus.decision_confirmed', tone: 'success' },
  solution_ready: { key: 'projectStatus.solution_ready', tone: 'success' },
  tender_review: { key: 'projectStatus.tender_review', tone: 'warning' },
  archived: { key: 'projectStatus.archived', tone: 'quiet' },
}

const RUN_STATUS: Record<string, StatusEntry> = {
  running: { key: 'runStatus.running', tone: 'info' },
  waiting_human: { key: 'runStatus.waiting_human', tone: 'warning' },
  completed: { key: 'runStatus.completed', tone: 'success' },
  failed: { key: 'runStatus.failed', tone: 'danger' },
  cancelled: { key: 'runStatus.cancelled', tone: 'neutral' },
}

const REQUIREMENT_STATUS: Record<string, StatusEntry> = {
  proposed: { key: 'requirementStatus.proposed', tone: 'warning' },
  confirmed: { key: 'requirementStatus.confirmed', tone: 'success' },
  unknown: { key: 'requirementStatus.unknown', tone: 'warning' },
  conflict: { key: 'requirementStatus.conflict', tone: 'danger' },
  superseded: { key: 'requirementStatus.superseded', tone: 'quiet' },
}

/**
 * Render one business status as a read-only tag.
 * @param props.t - the locale-bound text function.
 * @param props.kind - which status family the raw value belongs to.
 * @param props.value - the raw status code from the API.
 * @returns the tag element; unknown codes render verbatim in `outline` tone.
 */
export function StatusTag({ t, kind, value }: { t: MarketPilotText; kind: StatusKind; value: string }) {
  const entry = (kind === 'project' ? PROJECT_STATUS : kind === 'run' ? RUN_STATUS : REQUIREMENT_STATUS)[value]
  if (entry === undefined) return <Tag tone="outline">{value}</Tag>
  return <Tag tone={entry.tone}>{t(entry.key)}</Tag>
}
