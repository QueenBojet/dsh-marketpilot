/** Targeted real Desktop display regression; preserves the pending export gate. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { desktopSession } from './desktop-session.mjs'

const output = resolve('docs/gui-acceptance/v3.3-m5')
mkdirSync(output, { recursive: true })
const gate = JSON.parse(readFileSync(join(output, 'm5-export-facts.json'), 'utf8'))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const beforeFix = process.argv.includes('--before')
const prefix = beforeFix ? 'm5-display-before' : 'm5-display-fixed'
const facts = { date: new Date().toISOString(), mode: 'real-installed-desktop-hosted-react', screenshots: [], checks: [], humanAnswers: 0, modelCalls: 0 }
const d = await desktopSession(9259)
const initialTheme = await d.evaluate(`document.body.hasAttribute('data-ds-dark-theme') ? '深色' : '浅色'`)
const shot = async (page, theme, width, height) => {
  const name = `${prefix}-${page}-${theme === '深色' ? 'dark' : 'light'}-${width}.png`
  await d.shot(join(output, name), width, height, page === 'home' && width === 1024 ? '.mp-attention' : undefined)
  facts.screenshots.push({ name, width, height })
}
try {
  const executionsBefore = (await d.get('/marketpilot/api/executions')).executions.map(e => e.callId).sort()
  const pendingBefore = await d.get(`/marketpilot/api/executions/${gate.callId}`)
  assert.equal(pendingBefore.status, 'waiting_human')
  assert.ok(pendingBefore.question?.question.includes('approve_artifact'))
  assert.equal(existsSync(gate.path), false)
  const { projects } = await d.get('/marketpilot/api/projects')
  const snapshots = {}
  for (const project of projects) snapshots[project.id] = hash(await d.get(`/marketpilot/api/projects/${project.id}`))
  const project = projects.find(p => p.id === gate.projectId)
  assert.ok(project)

  for (const theme of ['浅色', '深色']) {
    await d.theme(theme)
    await d.click('首页', '.mp-headerNav button')
    await d.wait(`!!document.querySelector('.mp-attention') && document.querySelectorAll('.mp-attentionRow').length > 0`, 'home live tasks')
    for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768]]) {
      await shot('home', theme, width, height)
      const rows = await d.evaluate(`[...document.querySelectorAll('.mp-attentionRow')].map(row => {
        const button = row.querySelector('button'), caption = row.querySelector('.mp-caption')
        const bounds = node => { const b = node.getBoundingClientRect(); return { left:b.left, right:b.right, top:b.top, bottom:b.bottom, width:b.width } }
        return { label:button.textContent.trim(), caption:caption.textContent.trim(), row:bounds(row), button:bounds(button), info:bounds(caption), clipped:[button,caption].some(e=>e.scrollWidth>e.clientWidth+1) }
      })`)
      ;(facts.homeChecks ??= []).push({ theme, width, rows })
      const task = rows.find(row => row.caption.includes(project.name))
      assert.ok(task, 'The pending export must remain visible on home')
      assert.equal(task.label, '导出成果', 'Export task uses its localized execution label')
      assert.ok(task.caption.includes('等待审核'), 'Show the real waiting state')
      for (const row of rows) {
        assert.equal(row.clipped, false, 'Home task text must not be clipped')
        assert.ok(row.info.width >= row.row.width - 1, 'Project/status can use the full sidebar width')
        assert.ok(row.info.top >= row.button.bottom - 1, 'Project/status is readable below the task label')
      }
    }
  }
  await d.theme('浅色')
  await d.click('任务中心', '.mp-headerNav button')
  await d.wait(`!!document.querySelector('.mp-taskCard[data-status="waiting_human"]')`, 'pending export task')
  const card = await d.evaluate(`(() => {
    const card=[...document.querySelectorAll('.mp-taskCard')].find(e=>e.dataset.status==='waiting_human'&&e.textContent.includes(${JSON.stringify(project.name)}))
    return card ? { label:card.querySelector('.mp-cellMain').textContent.trim(), text:card.textContent } : null
  })()`)
  assert.equal(card?.label, '导出成果')
  await shot('tasks', '浅色', 1440, 900)
  await shot('tasks', '浅色', 1024, 768)
  await d.click('展开步骤', '.mp-taskCard[data-status="waiting_human"] button')
  await d.wait(`document.querySelector('.mp-taskCard[data-status="waiting_human"]').textContent.includes('暂无对应运行记录')`, 'export does not invent a workflow run')
  facts.checks.push('localized-export-on-home-and-tasks', 'readable-sidebar-at-three-sizes-in-two-themes', 'no-invented-export-run')

  await d.openProject(project)
  await d.click('项目成果', '.mp-stageItem')
  await d.wait(`!!document.querySelector('.mp-dialog') && document.querySelector('.mp-dialog').textContent.includes('approve_artifact')`, 'original human gate remains actionable')
  await shot('pending-gate', '浅色', 1440, 900)
  const pendingAfter = await d.get(`/marketpilot/api/executions/${gate.callId}`)
  assert.deepEqual(pendingAfter, pendingBefore, 'The original gate is unchanged')
  for (const p of projects) assert.equal(hash(await d.get(`/marketpilot/api/projects/${p.id}`)), snapshots[p.id], `Project ${p.id} unchanged`)
  const artifact = (await d.get(`/marketpilot/api/projects/${gate.projectId}/artifacts/${gate.artifactId}`)).artifact
  assert.equal(artifact.reviewStatus, 'draft')
  assert.equal(hash(artifact.content), gate.artifactHash)
  assert.equal(existsSync(gate.path), false)
  assert.deepEqual((await d.get('/marketpilot/api/executions')).executions.map(e=>e.callId).sort(), executionsBefore)
  assert.deepEqual(d.errors, [])
  facts.checks.push('all-project-detail-hashes-unchanged', 'original-export-gate-unchanged', 'draft-and-content-hash-unchanged', 'no-official-file', 'no-new-executions', 'no-page-exceptions')
  facts.projects = projects.length
  facts.callId = gate.callId
  facts.status = pendingAfter.status
  writeFileSync(join(output, `${prefix}-facts.json`), JSON.stringify(facts, null, 2))
  console.log(JSON.stringify({ screenshots:facts.screenshots.length, projects:facts.projects, status:facts.status, checks:facts.checks }))
} catch (error) {
  if (beforeFix) {
    facts.failure = error.message
    writeFileSync(join(output, `${prefix}-facts.json`), JSON.stringify(facts, null, 2))
  }
  throw error
} finally {
  try { await d.theme(initialTheme) } finally { d.close() }
}
