import type { z } from 'zod'
import type { HumanReview } from '../domain/common.ts'

/** Host adapter asks a real user. Model output must never implement this authority. */
export interface HumanGate {
  review(request: { projectId: string; action: string; proposal: unknown }): Promise<HumanReview>
}
export interface DocumentParserAdapter {
  parse(input: { path: string; signal: AbortSignal }): Promise<{ text: string; mimeType: string; checksum: string }>
}
export interface ResearchAdapter {
  search(query: string, signal: AbortSignal): Promise<{ title: string; url: string; text: string }[]>
}
export interface ModelStructuredOutputAdapter {
  generate<T>(request: { prompt: string; schema: z.ZodType<T>; signal: AbortSignal }): Promise<T>
}
