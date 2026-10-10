/**
 * Human-review dialog: forwards a real user's choice to the pending gate
 * question through the execution routes. The component never settles a gate
 * by itself — answers only leave through the callbacks. The dialog leads
 * with a business summary (action, affected-record estimate, risk note) and
 * keeps the full proposal JSON in an audit-friendly disclosure.
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ExecutionView } from '../api.ts'
import type { MarketPilotText } from '../locales.ts'

/** Count the records a proposal touches: array items, or one scalar object. */
function countRecords(detail: string): number | null {
  try {
    const parsed: unknown = JSON.parse(detail)
    const visit = (node: unknown): number | null => {
      if (Array.isArray(node)) {
        const inner = node.map(visit).reduce<number | null>((sum, value) =>
          sum === null || value === null ? null : sum + value, 0)
        if (inner === null || inner === 0) return node.length
        return inner
      }
      if (typeof node === 'object' && node !== null) {
        let total: number | null = 0
        let sawArray = false
        for (const value of Object.values(node as Record<string, unknown>)) {
          if (Array.isArray(value)) {
            sawArray = true
            const inner = visit(value)
            total = total === null || inner === null ? null : total + inner
          }
        }
        return sawArray ? total : 1
      }
      return 0
    }
    const count = visit(parsed)
    return count === null || count === 0 ? 1 : count
  } catch {
    return null
  }
}

/** Render the modal for one waiting execution's question. */
export function HumanReviewDialog({ t, execution, onAnswer, onCancel, busy }: {
  t: MarketPilotText
  execution: ExecutionView
  onAnswer: (selected: string, custom?: string) => void
  onCancel: () => void
  busy?: boolean
}) {
  const question = execution.question
  const [custom, setCustom] = useState('')
  const firstRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { firstRef.current?.focus() }, [])
  if (question === null) return null
  // Business action label: the gate question always asks 是否确认 <action>？
  const action = question.question.replace(/^是否确认\s*/, '').replace(/？$/, '')
  const affected = countRecords(question.detail)
  return (
    <div className="mp-dialogMask" role="presentation">
      <div className="mp-dialog" role="dialog" aria-modal="true" aria-label={question.header}>
        <h2 className="mp-dialogTitle">{question.header}</h2>
        <div className="mp-dialogSummary" role="group" aria-label={t('dialogSummaryLabel')}>
          <div className="mp-dialogSummaryRow">
            <span className="mp-caption">{t('dialogAction')}</span>
            <strong>{action}</strong>
          </div>
          {affected === null ? null : (
            <div className="mp-dialogSummaryRow">
              <span className="mp-caption">{t('dialogAffected')}</span>
              <strong>{`${String(affected)} ${t('dialogAffectedUnit')}`}</strong>
            </div>
          )}
          <p className="mp-caption">{t('dialogRiskHint')}</p>
        </div>
        {question.detail === '' ? null : (
          <details className="mp-dialogDetail">
            <summary className="mp-caption">{t('reason')}</summary>
            <pre className="mp-dialogPre">{question.detail}</pre>
          </details>
        )}
        <textarea
          className="mp-dialogInput" placeholder={t('dialogCustomPlaceholder')} value={custom}
          onChange={event => { setCustom(event.target.value) }}
        />
        <div className="mp-dialogActions">
          {question.options.map((option, index) => (
            <Button
              key={option} variant={index === 0 ? 'primary' : 'outline'} disabled={busy === true}
              ref={index === 0 ? firstRef : undefined}
              onClick={() => { onAnswer(option, custom.trim() === '' ? undefined : custom.trim()) }}
            >
              {option}
            </Button>
          ))}
          <Button variant="ghost" disabled={busy === true} onClick={onCancel}>{t('cancelRun')}</Button>
        </div>
      </div>
    </div>
  )
}
