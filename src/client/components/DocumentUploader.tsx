/**
 * Browser file upload for UTF-8 .md/.txt through the controlled upload
 * route — the user never provides a host path. Selection and drag-drop both
 * feed the same per-file pipeline; client-side guards catch the obvious
 * rejections before the request, the host re-validates everything.
 */
import { useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { api } from '../api.ts'
import type { MarketPilotText } from '../locales.ts'

const TEXT_EXTENSIONS = ['.md', '.txt']
const DOC_KINDS = ['customer_requirement', 'tender', 'meeting_note', 'internal_reference',
  'competitor_datasheet', 'standard', 'report', 'other'] as const

interface UploadState { uploading: boolean; error: string; done: string }

/** Render the uploader (drop zone + kind picker + per-file outcome). */
export function DocumentUploader({ t, projectId, kind, onKindChange, onUploaded }: {
  t: MarketPilotText
  projectId: string
  kind: string
  onKindChange: (kind: string) => void
  onUploaded: () => void
}) {
  const [state, setState] = useState<UploadState>({ uploading: false, error: '', done: '' })
  const inputRef = useRef<HTMLInputElement | null>(null)

  const uploadFiles = async (files: FileList | File[]): Promise<void> => {
    const list = [...files].filter(file => TEXT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext)))
    const rejected = [...files].length - list.length
    if (list.length === 0) {
      setState({ uploading: false, error: t('docsHint'), done: '' })
      return
    }
    setState({ uploading: true, error: '', done: '' })
    const failures: string[] = []
    for (const file of list) {
      try {
        await api.upload(projectId, file.name, kind, await file.text())
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error && error.message !== '' ? error.message : String(error)}`)
      }
    }
    const error = failures.length === 0 ? '' : `${t('uploadFailed')} — ${failures.join('；')}`
    setState({
      uploading: false,
      error,
      done: failures.length === 0 ? (list.length === 1 ? t('uploadDone') : t('uploadAllDone')) : '',
    })
    if (failures.length < list.length) onUploaded()
    void rejected
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
          {DOC_KINDS.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <span className="mp-caption">{t('docsHint')}</span>
      {state.error === '' ? null : <p className="mp-errorText" role="alert">{state.error}</p>}
      {state.done === '' ? null : <p className="mp-caption">{state.done}</p>}
    </div>
  )
}
