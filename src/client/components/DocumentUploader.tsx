/**
 * Browser file upload for UTF-8 .md/.txt through the controlled upload
 * route — the user never provides a host path. Selection and drag-drop both
 * feed the same per-file pipeline; every file gets an explicit success or
 * failure outcome (unsupported formats are rejected by name, never silently
 * dropped); client-side guards catch the obvious rejections before the
 * request, the host re-validates everything.
 */
import { useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { api } from '../api.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'

const TEXT_EXTENSIONS = ['.md', '.txt']
const DOC_KINDS = ['customer_requirement', 'tender', 'meeting_note', 'internal_reference',
  'competitor_datasheet', 'standard', 'report', 'other'] as const

/** One file's upload outcome, rendered verbatim. */
interface UploadOutcome { name: string; ok: boolean; message: string }

interface UploadState { uploading: boolean; error: string; done: string; outcomes: UploadOutcome[] }

/** Render the uploader (drop zone + kind picker + per-file outcome). */
export function DocumentUploader({ t, projectId, kind, onKindChange, onUploaded }: {
  t: MarketPilotText
  projectId: string
  kind: string
  onKindChange: (kind: string) => void
  onUploaded: () => void
}) {
  const [state, setState] = useState<UploadState>({ uploading: false, error: '', done: '', outcomes: [] })
  const inputRef = useRef<HTMLInputElement | null>(null)

  const uploadFiles = async (files: FileList | File[]): Promise<void> => {
    const outcomes: UploadOutcome[] = []
    for (const file of [...files]) {
      // Unsupported formats are reported per file — never silently filtered.
      if (!TEXT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
        outcomes.push({ name: file.name, ok: false, message: t('uploadRejected') })
        continue
      }
      try {
        await api.upload(projectId, file.name, kind, await file.text())
        outcomes.push({ name: file.name, ok: true, message: t('uploadFileDone') })
      } catch (error) {
        outcomes.push({
          name: file.name, ok: false,
          message: error instanceof Error && error.message !== '' ? error.message : String(error),
        })
      }
    }
    const okCount = outcomes.filter(outcome => outcome.ok).length
    setState({
      uploading: false,
      error: '',
      done: outcomes.length === 0 ? '' : okCount === outcomes.length ? t('uploadAllDone') : '',
      outcomes,
    })
    if (okCount > 0) onUploaded()
  }

  return (
    <div
      className="mp-dropzone"
      onDragOver={event => { event.preventDefault() }}
      onDrop={event => { event.preventDefault(); void uploadFiles(event.dataTransfer.files) }}
    >
      <span className="mp-muted">{t('docsDrop')}</span>
      <Button variant="outline" disabled={state.uploading} onClick={() => { inputRef.current?.click() }}>
        {state.uploading ? t('uploading') : t('docsBrowse')}
      </Button>
      <input
        ref={inputRef} type="file" accept=".md,.txt" multiple hidden
        onChange={event => {
          if (event.target.files !== null) void uploadFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <label className="mp-caption">
        {`${t('docsKind')}:`}
        <select
          className="mp-kindSelect" value={kind}
          onChange={event => { onKindChange(event.target.value) }}
        >
          {DOC_KINDS.map(option => (
            <option key={option} value={option}>{t(`docKind.${option}` as MarketPilotTextKey)}</option>
          ))}
        </select>
      </label>
      <span className="mp-caption">{t('docsHint')}</span>
      {state.error === '' ? null : <p className="mp-errorText" role="alert">{state.error}</p>}
      {state.done === '' ? null : <p className="mp-caption">{state.done}</p>}
      {state.outcomes.length === 0 ? null : (
        <ul className="mp-uploadOutcomes" role="status">
          {state.outcomes.map(outcome => (
            <li key={outcome.name} className="mp-uploadOutcome" data-ok={outcome.ok}>
              {`${outcome.ok ? '✓' : '✗'} ${outcome.name} — ${outcome.message}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
