/**
 * Human-review dialog: forwards a real user's choice to the pending gate
 * question through the execution routes. The component never settles a gate
 * by itself — answers only leave through the callbacks.
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ExecutionView } from '../api.ts'
import type { MarketPilotText } from '../locales.ts'

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
  return (
    <div className="mp-dialogMask" role="presentation">
      <div className="mp-dialog" role="dialog" aria-modal="true" aria-label={question.header}>
        <h2 className="mp-dialogTitle">{question.header}</h2>
        <p className="mp-dialogQuestion">{question.question}</p>
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
