import { useEffect, useState } from 'react'
import { get } from './api.ts'
import { useStore } from './store.tsx'
import { Btn, Field, Modal } from './ui.tsx'

export function ModelPicker() {
  const { selection, selectModel, catalog, catalogError, reloadModels, active, toast } = useStore()
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [efforts, setEfforts] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [effortLoading, setEffortLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const unavailable = selection && catalog && !catalog.providers.some(p => p.id === selection.provider)
  const show = () => {
    setProvider(selection?.provider ?? catalog?.providers[0]?.id ?? '')
    setModel(selection?.model ?? ''); setEffort(selection?.reasoningEffort ?? ''); setOpen(true)
  }
  useEffect(() => {
    if (!open || !provider) return
    let live = true
    setLoading(true); setError(''); setModels([])
    get<{ models: { id: string; name: string }[] }>(`v4/model-catalog?provider=${encodeURIComponent(provider)}`)
      .then(data => { if (live) setModels(data.models) }, e => { if (live) setError(String(e.message ?? e)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, provider, retry])
  useEffect(() => {
    if (!open || !provider || !model) { setEfforts([]); return }
    let live = true
    setEffortLoading(true); setEfforts([]); setError('')
    get<{ efforts: { id: string; name: string }[]; defaultEffort: string | null }>(`v4/model-catalog?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`)
      .then(data => { if (live) {
        setEfforts(data.efforts)
        setEffort(current => data.efforts.some(e => e.id === current) ? current : data.defaultEffort ?? '')
      } }, e => { if (live) setError(String(e.message ?? e)) })
      .finally(() => { if (live) setEffortLoading(false) })
    return () => { live = false }
  }, [open, provider, model, retry])
  const save = () => {
    try { selectModel({ provider, model, ...effort ? { reasoningEffort: effort } : {} }); setOpen(false) }
    catch { toast('模型选择无法保存，请检查浏览器存储权限。', 'err') }
  }
  const reason = active ? '运行结束后可切换模型' : loading || effortLoading ? '正在读取模型配置' : error || catalogError ||
    (!provider || !model ? '请选择供应商和模型' : !catalog?.providers.some(p => p.id === provider) ? '供应商已不可用' : '')
  return <>
    <button className="model-trigger" onClick={show} aria-label="选择模型与思考强度" aria-haspopup="dialog" title={selection ? `${selection.provider} / ${selection.model}` : '选择模型'}>
      <span className={`model-indicator${unavailable || catalogError ? ' unavailable' : ''}`} />
      <span className="model-trigger-name">{selection?.model ?? '选择模型'}</span>
      {selection?.reasoningEffort ? <span className="model-effort">{selection.reasoningEffort}</span> : null}<span aria-hidden="true">⌄</span>
    </button>
    <Modal open={open} title="模型" onClose={() => setOpen(false)} actions={<><Btn kind="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn kind="primary" disabled={reason} onClick={save}>使用此模型</Btn></>}>
      <Field label="供应商"><select className="text-field" value={provider} onChange={e => { setProvider(e.target.value); setModel(''); setEffort('') }}>
        <option value="">选择供应商</option>{catalog?.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="模型"><select className="text-field" value={model} disabled={loading || !provider} onChange={e => { setModel(e.target.value); setEffort('') }}>
        <option value="">{loading ? '读取模型…' : '选择模型'}</option>
        {model && !models.some(m => m.id === model) ? <option value={model}>{model}（当前选择）</option> : null}
        {models.map(m => <option key={m.id} value={m.id}>{m.name === m.id ? m.id : `${m.name} · ${m.id}`}</option>)}</select></Field>
      <Field label="思考强度"><select className="text-field" value={effort} disabled={effortLoading || !efforts.length} onChange={e => setEffort(e.target.value)}>
        <option value="">{effortLoading ? '读取配置…' : efforts.length ? '自动' : '由模型处理'}</option>
        {efforts.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
      {error || catalogError ? <div role="alert" className="boxnote">{error || catalogError} <Btn small kind="text" onClick={() => { void reloadModels(); setRetry(v => v + 1) }}>重新读取</Btn></div> : null}
      {active ? <p className="tiny-caption">运行结束后可切换模型。</p> : null}
    </Modal>
  </>
}
