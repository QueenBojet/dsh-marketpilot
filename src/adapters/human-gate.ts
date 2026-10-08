import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-user-questions'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { HumanGate } from './contracts.ts'
import { ensure } from '../domain/common.ts'

/** Only a returned answer from the host's human question provider authorizes a review. */
export function harnessHumanGate(ctx: Context, exec: ToolRunContext, signal: AbortSignal): HumanGate {
  return { async review(request) {
    signal.throwIfAborted()
    const result = await ctx.userQuestions.ask({
      signal, ...(exec.agent ? { agent: exec.agent } : {}),
      wait: { callId: exec.callId },
      questions: [{ id: 'marketpilot-review', header: 'MarketPilot 人工审核',
        question: `是否确认 ${request.action}？`, detail: JSON.stringify(request.proposal, null, 2),
        options: [{ label: '确认' }, { label: '退回修改' }],
      }],
    })
    signal.throwIfAborted()
    const answer = result.answers.find(a => a.id === 'marketpilot-review')
    ensure(result.answers.length === 1 && answer?.selected.length === 1 && answer.selected[0] === '确认',
      'HUMAN_REJECTED', '人工审核未确认，业务状态未改变。')
    return { reviewer: `Harness human (${exec.callId})`, reviewedAt: new Date().toISOString(),
      reason: answer.custom?.trim() || '用户通过 Harness 人工审核入口明确确认。' }
  } }
}
