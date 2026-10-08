import { z } from 'zod'
import { text, timestamp, recordFields } from './common.ts'

export const workflowType = z.enum(['requirement_analysis', 'competitor_analysis', 'policy_analysis',
  'alternative_generation', 'solution_generation', 'tender_review', 'product_gap'])
export const workflowStatus = z.enum(['pending', 'running', 'waiting_human', 'completed', 'failed', 'cancelled'])
export const workflowInput = z.strictObject({ type: workflowType, input: z.record(z.string(), z.json()).default({}) })
export const workflowSchema = workflowInput.extend({
  ...recordFields, status: workflowStatus, currentStep: text,
  startedAt: timestamp, completedAt: timestamp.optional(), durationMs: z.number().nonnegative(),
  modelCalls: z.number().int().nonnegative(), toolCalls: z.number().int().nonnegative(),
  humanWaitMs: z.number().nonnegative(), waitingSince: timestamp.optional(),
  steps: z.array(z.strictObject({ step: text, at: timestamp })), error: text.optional(),
  output: z.record(z.string(), z.json()).optional(),
}).superRefine((run, ctx) => {
  if ((run.status === 'waiting_human') !== !!run.waitingSince) ctx.addIssue({ code: 'custom', message: 'Human wait timestamp must match waiting status' })
  if (['completed', 'failed', 'cancelled'].includes(run.status) !== !!run.completedAt) ctx.addIssue({ code: 'custom', message: 'Terminal status must have completion time' })
  if (run.status === 'failed' && !run.error) ctx.addIssue({ code: 'custom', message: 'Failed run needs an error' })
})
export type WorkflowRun = z.infer<typeof workflowSchema>
