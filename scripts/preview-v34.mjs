/** Read-only screenshots of the installed host. Never generates or approves records. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { desktopSession } from './desktop-session.mjs'

const before = process.argv.includes('--before')
const output = resolve('docs/gui-acceptance/v3.4-home')
mkdirSync(output, { recursive: true })
const d = await desktopSession(9264)
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const facts = { phase: before ? 'before' : 'after', screenshots: [], checks: [], modelCalls: 0, humanAnswers: 0 }
const shot = async (name, width = 1440, height = 900) => {
  const file = `${facts.phase}-${name}.png`
  await d.shot(join(output, file), width, height)
  facts.screenshots.push(file)
  console.log(`Screenshot: ${file}`)
}
try {
  const { projects } = await d.get('/marketpilot/api/projects')
  const calm = projects.find(p => p.name === 'CALM 漏油监测桌面版演示')
  const empty = projects.find(p => p.name === 'V3.3 M1 GUI 空项目 · synthetic QA')
  assert.ok(calm && empty, 'Existing CALM and empty QA projects required')
  const initial = {}
  for (const p of projects) initial[p.id] = hash(await d.get(`/marketpilot/api/projects/${p.id}`))
  const executionsBefore = hash(await d.get('/marketpilot/api/executions'))
  if (!before) {
    assert.equal(await d.evaluate(`document.querySelectorAll('.mp-homeJourney li').length`), 5)
    assert.equal(await d.evaluate(`!!document.querySelector('.mp-homeStats:not([open])')`), true)
    facts.checks.push('Workbench home shows the five-step journey and folds aggregate statistics')
  }
  await shot('home')
  const open = async p => {
    await d.click('我的项目', '.mp-headerNav button')
    await d.wait(`!!document.querySelector('.mp-createInput')`, 'project list')
    await d.click(p.name, '.mp-table button')
    await d.wait(before ? `document.querySelectorAll('.mp-stepCard').length===8` : `document.querySelectorAll('.mp-guidedStepCard').length===5`, 'project overview')
  }
  for (const [name, p] of [['calm', calm], ['empty', empty]]) {
    await open(p)
    await shot(name)
    if (!before) {
      const flow = await d.get(`/marketpilot/api/projects/${p.id}/workflow`)
      const stages = await d.evaluate(`[...document.querySelectorAll('.mp-guidedStepCard')].map(e=>({id:e.dataset.stage,status:e.dataset.status}))`)
      assert.deepEqual(stages, ['S0', 'S1', 'S2', 'S4', 'S5'].map(id => {
        const s = flow.stages.find(s => s.id === id); return { id, status: s.status }
      }))
      assert.equal(await d.evaluate(`/\\bS[0-7]\\b/.test(document.querySelector('.mp-root').innerText)`), false)
      assert.equal(await d.evaluate(`!!document.querySelector('.mp-stageFacts')`), false)
      assert.equal(await d.evaluate(`document.querySelectorAll('.mp-guidedNavStep').length`), 5)
      facts.checks.push(`${name}: five stages match backend; no internal stage labels or four-column statistics`)
      if (name === 'calm') {
        assert.ok(await d.evaluate(`document.querySelector('.mp-guidedArtifact')?.innerText.includes('技术方案')`))
        await shot('calm-1024', 1024, 768)
        await d.theme('深色'); await shot('calm-dark'); await d.theme('浅色')
        for (const [id, marker] of [['S0', '#mp-requirement-upload'], ['S1', '#mp-requirement-analysis'], ['S2', '.mp-researchInput'], ['S4', '.mp-decisionBar'], ['S5', '.mp-artifactContext']]) {
          await d.evaluate(`document.querySelector('.mp-guidedNavStep[data-stage="${id}"]').click()`)
          await d.wait(`!!document.querySelector('${marker}')`, `business step ${id}`)
          assert.equal(await d.evaluate(`document.querySelector('.mp-stageAction').dataset.stage`), id)
          assert.equal(await d.evaluate(`document.querySelectorAll('.mp-guidedNavStep[aria-current="page"]').length`), 1)
        }
        facts.checks.push('All five CALM navigation entries reach their actual existing workspace without executing tools')
        await d.evaluate(`document.querySelector('.mp-guidedNav>.mp-stageItem').click()`)
        await d.wait(`document.querySelectorAll('.mp-guidedStepCard').length===5`, 'return to project home')
        await d.click('专业模式')
        await d.wait(`document.querySelectorAll('.mp-stepCard').length===8`, 'professional overview')
        await shot('calm-professional')
        await d.click('引导模式')
      }
    }
  }
  for (const p of projects) assert.equal(hash(await d.get(`/marketpilot/api/projects/${p.id}`)), initial[p.id], `Project changed: ${p.name}`)
  assert.equal(hash(await d.get('/marketpilot/api/executions')), executionsBefore, 'Execution records changed')
  assert.equal(d.errors.length, 0, 'Browser runtime exception')
  facts.checks.push('All project records and execution records unchanged; no model calls or human answers')
  writeFileSync(join(output, `${facts.phase}-checks.json`), JSON.stringify(facts, null, 2))
  console.log(`PASS: ${facts.checks.length} GUI checks`)
} finally { d.close() }
