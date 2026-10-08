import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { api, type ExecutionView, type ProjectDetail, type ProjectRow } from './api.ts'

/** Locale keys used by the workbench panel. */
export type WorkbenchTextKey =
  | 'refresh' | 'createProject' | 'projectName' | 'create' | 'back' | 'documents' | 'requirements' | 'evidence'
  | 'alternatives' | 'artifacts' | 'runs' | 'importDoc' | 'docPath' | 'docKind' | 'importGo' | 'extract'
  | 'confirmSelected' | 'unknownCount' | 'generateAlternatives' | 'pickRoute' | 'confirmRoute' | 'rationale'
  | 'generateSolution' | 'viewArtifact' | 'tenderExtract' | 'tenderReview' | 'noProject' | 'loading'
  | 'running' | 'confirmLabel' | 'rejectLabel' | 'cancelRun' | 'reason' | 'customReason' | 'selectDocs'
  | 'selectRequirements' | 'decisions' | 'tenderItems' | 'loadError' | 'status' | 'summary'

export type WorkbenchText = (key: WorkbenchTextKey) => string

interface SectionProps { title: string; children: ReactNode[] }

function section({ title, children }: SectionProps) {
  return h('section', { style: sectionStyle }, h('h3', { style: headingStyle }, title), ...children)
}

const panelStyle: Record<string, string | number> = {
  padding: '12px', fontSize: '13px', lineHeight: '1.5', overflowY: 'auto', height: '100%', boxSizing: 'border-box',
}
const sectionStyle: Record<string, string | number> = { marginBottom: '16px' }
const headingStyle: Record<string, string | number> = { margin: '0 0 6px', fontSize: '13px', fontWeight: 600 }
const listStyle: Record<string, string | number> = { margin: 0, paddingLeft: '18px' }
const buttonStyle: Record<string, string | number> = { marginRight: '6px', marginBottom: '6px', padding: '3px 10px', cursor: 'pointer' }
const inputStyle: Record<string, string | number> = {
  width: '100%', boxSizing: 'border-box', marginBottom: '6px', padding: '3px 6px',
}
const mutedStyle: Record<string, string | number> = { opacity: 0.65 }
const chipStyle = (tone: string): Record<string, string | number> => ({
  display: 'inline-block', marginLeft: '6px', padding: '0 6px', borderRadius: '8px',
  fontSize: '11px', background: tone === 'ok' ? '#2f9e44' : tone === 'warn' ? '#e8590c' : '#868e96', color: '#fff',
})
const questionCardStyle: Record<string, string | number> = {
  border: '1px solid #e8590c', borderRadius: '8px', padding: '10px', marginBottom: '12px', background: 'rgba(232,89,12,0.06)',
}

const DOC_KINDS = ['customer_requirement', 'tender', 'meeting_note', 'internal_reference', 'competitor_datasheet', 'standard', 'report']

/** The whole MarketPilot workbench: project list, detail, steps, and the human-question card. */
export function WorkbenchPanel({ t }: { t: WorkbenchText }) {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [pathInput, setPathInput] = useState('')
  const [kindInput, setKindInput] = useState(DOC_KINDS[0]!)
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([])
  const [selectedAlternative, setSelectedAlternative] = useState('')
  const [rationaleInput, setRationaleInput] = useState('')
  const [execution, setExecution] = useState<ExecutionView | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [artifactPreview, setArtifactPreview] = useState('')
  const pollRef = useRef<number>(0)

  const refreshProjects = useCallback(() => {
    api.projects().then(result => { setProjects(result.projects); setError('') }).catch(e => setError(String(e.message ?? e)))
  }, [])
  useEffect(refreshProjects, [refreshProjects])
  useEffect(() => () => { window.clearInterval(pollRef.current) }, [])

  const refreshDetail = useCallback((id: string) => {
    api.project(id).then(result => { setDetail(result); setError('') }).catch(e => setError(String(e.message ?? e)))
  }, [])

  const openProject = (id: string) => {
    setArtifactPreview('')
    setExecution(null)
    setSelectedDocs([])
    setSelectedRequirements([])
    setSelectedAlternative('')
    refreshDetail(id)
  }

  /** Start one click-driven tool execution and begin polling its outcome. */
  const run = (name: string, args: Record<string, unknown>) => {
    if (detail === null) return
    setError('')
    api.start(name, args).then(({ callId }) => {
      window.clearInterval(pollRef.current)
      const poll = () => {
        api.execution(callId).then(view => {
          setExecution(view)
          if (view.status === 'completed') {
            window.clearInterval(pollRef.current)
            refreshDetail(detail.project.id)
          }
          if (view.status === 'failed' || view.status === 'cancelled') window.clearInterval(pollRef.current)
        }).catch(e => { setError(String(e.message ?? e)); window.clearInterval(pollRef.current) })
      }
      poll()
      pollRef.current = window.setInterval(poll, 1500)
    }).catch(e => setError(String(e.message ?? e)))
  }

  const answer = (selected: string) => {
    if (execution === null) return
    api.answer(execution.callId, selected, customInput.trim() === '' ? undefined : customInput.trim())
      .then(() => setCustomInput(''))
      .catch(e => setError(String(e.message ?? e)))
  }

  const proposedRequirements = useMemo(
    () => (detail?.requirements ?? []).filter(r => r.status === 'proposed'), [detail])
  const waitingRun = useMemo(
    () => (detail?.workflowRuns ?? []).find(r => r.status === 'waiting_human'), [detail])
  const unknownCount = useMemo(
    () => (detail?.evidence ?? []).filter(e => e.kind === 'UNKNOWN').length, [detail])

  const busy = execution !== null && (execution.status === 'running' || execution.status === 'waiting_human')

  if (detail !== null) {
    return h('div', { style: panelStyle },
      execution !== null ? executionCard(execution, t, customInput, setCustomInput, answer, () => {
        api.cancel(execution.callId).catch(e => setError(String(e.message ?? e)))
      }) : null,
      error === '' ? null : h('div', { style: { color: '#c92a2a', marginBottom: '8px' } }, error),
      h('button', { style: buttonStyle, onClick: () => { setDetail(null); refreshProjects() } }, `← ${t('back')}`),
      h('h2', { style: { margin: '4px 0 10px', fontSize: '15px' } }, detail.project.name,
        h('span', { style: chipStyle('muted') }, detail.project.status)),
      section({ title: t('documents'), children: [
        h('ul', { style: listStyle }, detail.documents.map(doc => h('li', { key: doc.id },
          h('label', null, h('input', {
            type: 'checkbox', checked: selectedDocs.includes(doc.id),
            onChange: () => setSelectedDocs(selected => selected.includes(doc.id)
              ? selected.filter(id => id !== doc.id) : [...selected, doc.id]),
          }), ` ${doc.name} (${doc.kind})`)))),
        h('div', null,
          h('input', { style: inputStyle, placeholder: t('docPath'), value: pathInput, onChange: (e: ChangeEvent<HTMLInputElement>) => setPathInput(e.target.value) }),
          h('select', { style: { ...inputStyle, width: 'auto' }, value: kindInput, onChange: (e: ChangeEvent<HTMLSelectElement>) => setKindInput(e.target.value) },
            DOC_KINDS.map(kind => h('option', { key: kind, value: kind }, kind))),
          h('button', { style: buttonStyle, disabled: busy || pathInput.trim() === '', onClick: () => {
            run('marketpilot_document_import', { projectId: detail.project.id, path: pathInput.trim(), kind: kindInput })
            setPathInput('')
          } }, t('importGo'))),
        h('button', { style: buttonStyle, disabled: busy || selectedDocs.length === 0,
          onClick: () => run('marketpilot_requirement_extract', { projectId: detail.project.id, documentIds: selectedDocs }) },
        `${t('extract')}（${String(selectedDocs.length)}）`),
      ] }),
      section({ title: `${t('requirements')}（${t('unknownCount')} ${String(unknownCount)}）`, children: [
        h('ul', { style: listStyle }, detail.requirements.map(r => h('li', { key: r.id },
          h('label', null, h('input', {
            type: 'checkbox', disabled: r.status !== 'proposed',
            checked: selectedRequirements.includes(r.id),
            onChange: () => setSelectedRequirements(selected => selected.includes(r.id)
              ? selected.filter(id => id !== r.id) : [...selected, r.id]),
          }), ` ${r.normalizedText}`),
          h('span', { style: chipStyle(r.status === 'confirmed' ? 'ok' : r.status === 'unknown' ? 'warn' : 'muted') }, r.status)))),
        h('button', {
          style: buttonStyle,
          disabled: busy || selectedRequirements.length === 0 || waitingRun === undefined,
          title: waitingRun === undefined ? t('selectRequirements') : '',
          onClick: () => waitingRun !== undefined && run('marketpilot_requirement_confirm', {
            projectId: detail.project.id, runId: waitingRun.id, requirementIds: selectedRequirements,
          }),
        }, `${t('confirmSelected')}（${String(selectedRequirements.length)}）`),
      ] }),
      section({ title: t('evidence'), children: [
        h('ul', { style: listStyle }, detail.evidence.slice(0, 50).map(e => h('li', { key: e.id },
          `${e.kind} · ${e.title}`,
          h('span', { style: chipStyle(e.status === 'verified' ? 'ok' : 'muted') }, e.status)))),
        h('button', { style: buttonStyle, disabled: busy, onClick: () => {
          const documentIds = selectedDocs.length > 0 ? selectedDocs : detail.documents.map(d => d.id)
          if (documentIds.length > 0) run('marketpilot_competitor_extract', { projectId: detail.project.id, documentIds })
        } }, '抽取竞品'),
      ] }),
      section({ title: t('alternatives'), children: [
        h('ul', { style: listStyle }, detail.alternatives.map(a => h('li', { key: a.id },
          h('label', null, h('input', {
            type: 'radio', name: 'alternative', checked: selectedAlternative === a.id,
            onChange: () => setSelectedAlternative(a.id),
          }), ` ${a.name} — ${a.summary}`)))),
        h('input', { style: inputStyle, placeholder: t('rationale'), value: rationaleInput, onChange: (e: ChangeEvent<HTMLInputElement>) => setRationaleInput(e.target.value) }),
        h('button', { style: buttonStyle, disabled: busy, onClick: () =>
          run('marketpilot_alternative_generate', { projectId: detail.project.id }) }, t('generateAlternatives')),
        h('button', {
          style: buttonStyle, disabled: busy || selectedAlternative === '' || rationaleInput.trim() === '',
          title: t('pickRoute'),
          onClick: () => run('marketpilot_decision_confirm', {
            projectId: detail.project.id, alternativeId: selectedAlternative, decision: 'selected',
            rationale: rationaleInput.trim(), evidenceIds: [], requirementIds: detail.requirements.filter(r => r.status === 'confirmed').map(r => r.id),
          }),
        }, t('confirmRoute')),
      ] }),
      section({ title: t('artifacts'), children: [
        h('button', { style: buttonStyle, disabled: busy, onClick: () => run('marketpilot_solution_generate', { projectId: detail.project.id }) }, t('generateSolution')),
        h('ul', { style: listStyle }, detail.artifacts.map(a => h('li', { key: a.id },
          h('a', {
            href: '#', onClick: (e: ReactMouseEvent<HTMLAnchorElement>) => {
              e.preventDefault()
              setArtifactPreview(artifactPreview === a.id ? '' : a.id)
            },
          }, `${a.name}`),
          h('span', { style: chipStyle(a.status === 'approved' ? 'ok' : 'muted') }, a.status)))),
        artifactPreview === '' ? null : h('pre', {
          style: { maxHeight: '260px', overflow: 'auto', background: 'rgba(134,142,150,0.12)', padding: '8px', borderRadius: '6px' },
        }, detail.artifacts.find(a => a.id === artifactPreview)?.content ?? ''),
      ] }),
      section({ title: t('tenderItems'), children: [
        h('button', { style: buttonStyle, disabled: busy || selectedDocs.length === 0,
          onClick: () => run('marketpilot_tender_extract', { projectId: detail.project.id, documentIds: selectedDocs }) }, t('tenderExtract')),
        h('button', { style: buttonStyle, disabled: busy || detail.tenderItems.length === 0,
          onClick: () => run('marketpilot_tender_review', {
            projectId: detail.project.id,
            tenderItemIds: detail.tenderItems.map(i => i.id),
          }) }, t('tenderReview')),
        h('ul', { style: listStyle }, detail.tenderItems.map(i => h('li', { key: i.id },
          i.normalizedRequirement, h('span', { style: chipStyle(i.status === 'compliant' ? 'ok' : 'warn') }, i.status)))),
      ] }),
      section({ title: t('runs'), children: [
        h('ul', { style: listStyle }, detail.workflowRuns.slice(-12).reverse().map(r => h('li', { key: r.id },
          `${r.type} · ${r.status} · ${r.currentStep}`,
          r.error === undefined ? null : h('div', { style: mutedStyle }, r.error)))),
      ] }),
    )
  }

  return h('div', { style: panelStyle },
    executionCard(execution, t, customInput, setCustomInput, answer, () => {
      if (execution !== null) api.cancel(execution.callId).catch(e => setError(String(e.message ?? e)))
    }),
    error === '' ? null : h('div', { style: { color: '#c92a2a', marginBottom: '8px' } }, error),
    h('button', { style: buttonStyle, onClick: refreshProjects }, t('refresh')),
    h('div', { style: { margin: '8px 0' } },
      h('input', { style: inputStyle, placeholder: t('projectName'), value: nameInput, onChange: (e: ChangeEvent<HTMLInputElement>) => setNameInput(e.target.value) }),
      h('button', { style: buttonStyle, disabled: nameInput.trim() === '', onClick: () => {
        api.start('marketpilot_project_create', { name: nameInput.trim() }).then(({ callId }) => {
          setNameInput('')
          const poll = window.setInterval(() => {
            api.execution(callId).then(view => {
              if (view.status === 'completed' || view.status === 'failed' || view.status === 'cancelled') {
                window.clearInterval(poll)
                refreshProjects()
                if (view.status === 'failed') setError(view.error ?? '创建失败')
              }
            }).catch(() => { window.clearInterval(poll) })
          }, 1200)
        }).catch(e => setError(String(e.message ?? e)))
      } }, t('create'))),
    projects === null ? h('div', { style: mutedStyle }, t('loading'))
      : projects.length === 0 ? h('div', { style: mutedStyle }, t('noProject'))
        : h('ul', { style: listStyle }, projects.map(p => h('li', { key: p.id },
          h('a', { href: '#', onClick: (e: ReactMouseEvent<HTMLAnchorElement>) => { e.preventDefault(); openProject(p.id) } }, p.name),
          h('span', { style: chipStyle('muted') }, p.status)))),
  )
}

function executionCard(
  execution: ExecutionView | null, t: WorkbenchText,
  custom: string, setCustom: (value: string) => void,
  answer: (selected: string) => void, cancel: () => void,
) {
  if (execution === null) return null
  if (execution.status === 'completed') {
    return h('div', { style: questionCardStyle, key: execution.callId },
      h('strong', null, `${execution.tool} ✓`))
  }
  if (execution.status === 'failed' || execution.status === 'cancelled') {
    return h('div', { style: questionCardStyle, key: execution.callId },
      h('strong', null, `${execution.tool} ${execution.status === 'failed' ? '✗' : '⏹'}`),
      h('div', null, execution.error ?? ''))
  }
  if (execution.status === 'waiting_human' && execution.question !== null) {
    return h('div', { style: questionCardStyle, key: execution.callId },
      h('strong', null, execution.question.header),
      h('div', null, execution.question.question),
      execution.question.detail === '' ? null : h('details', { style: { margin: '6px 0' } },
        h('summary', { style: mutedStyle }, t('reason')),
        h('pre', { style: { maxHeight: '200px', overflow: 'auto', margin: '4px 0', fontSize: '11px' } }, execution.question.detail)),
      h('textarea', {
        style: { ...inputStyle, minHeight: '36px' }, placeholder: t('customReason'),
        value: custom, onChange: (e: ChangeEvent<HTMLTextAreaElement>) => setCustom(e.target.value),
      }),
      h('div', null, execution.question.options.map(option =>
        h('button', { key: option, style: buttonStyle, onClick: () => answer(option) }, option)),
        h('button', { style: buttonStyle, onClick: cancel }, t('cancelRun'))),
    )
  }
  return h('div', { style: questionCardStyle, key: execution.callId },
    h('strong', null, `${execution.tool} … ${t('running')}`),
    h('button', { style: buttonStyle, onClick: cancel }, t('cancelRun')))
}
