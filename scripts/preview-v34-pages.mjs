/** Installed-host screenshots and read-only checks of V3.4 business pages. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { desktopSession } from './desktop-session.mjs'

const before = process.argv.includes('--before')
const output = resolve('docs/gui-acceptance/v3.4-pages'); mkdirSync(output, { recursive: true })
const d = await desktopSession(9265)
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const facts = { phase: before ? 'before' : 'after', screenshots: [], checks: [] }
try {
  const { projects } = await d.get('/marketpilot/api/projects')
  const calm = projects.find(p => p.name === 'CALM 漏油监测桌面版演示')
  assert.ok(calm, 'Existing real CALM project required')
  const initial = {}
  for (const p of projects) initial[p.id] = hash(await d.get(`/marketpilot/api/projects/${p.id}`))
  const executions = hash(await d.get('/marketpilot/api/executions'))
  await d.click('我的项目', '.mp-headerNav button'); await d.click(calm.name, '.mp-table button')
  await d.wait(`document.querySelectorAll('.mp-guidedStepCard').length===5`, 'guided overview')
  for (const [name, id, marker] of [['requirements', 'S1', '#mp-requirement-analysis'], ['research', 'S2', '.mp-researchInput'], ['routes', 'S4', '.mp-decisionBar'], ['solution', 'S5', '.mp-artifactContext']]) {
    await d.evaluate(`document.querySelector('.mp-guidedNavStep[data-stage="${id}"]').click()`)
    await d.wait(`!!document.querySelector('${marker}')`, name)
    if (!before && name === 'research') await d.wait(`document.querySelectorAll('.mp-researchCard').length>0`, 'source-backed research cards')
    if (!before && name === 'solution') await d.wait(`!!document.querySelector('.mp-solutionExcerpt')`, 'saved solution summary')
    const file = `${facts.phase}-${name}.png`
    await d.shot(join(output, file), 1440, 900, before ? '#mp-stage-controls' : undefined)
    facts.screenshots.push(file); console.log(`Screenshot: ${file}`)
    if (!before) {
      const workflow = await d.get(`/marketpilot/api/projects/${calm.id}/workflow`)
      assert.equal(await d.evaluate(`document.querySelector('.mp-stageAction').dataset.status`), workflow.stages.find(s => s.id === id).status)
      if (name === 'requirements') {
        assert.equal(await d.evaluate(`document.querySelectorAll('.mp-requirementResults thead th').length`), 4)
        assert.equal(await d.evaluate(`document.querySelector('.mp-requirementInputs').open`), false)
      }
      if (name === 'research') {
        const research = await d.get(`/marketpilot/api/projects/${calm.id}/research`)
        assert.deepEqual(await d.evaluate(`[...document.querySelectorAll('.mp-researchCard h4')].map(e=>e.textContent)`), research.competitors.map(r => r.product))
        assert.equal(await d.evaluate(`document.querySelector('.mp-researchInput').open`), false)
      }
      if (name === 'routes') {
        const design = await d.get(`/marketpilot/api/projects/${calm.id}/design`)
        assert.deepEqual(await d.evaluate(`[...document.querySelectorAll('.mp-altCard input[type=radio]')].map(e=>e.getAttribute('aria-label'))`), design.alternatives.map(r => r.name))
        assert.equal(await d.evaluate(`document.querySelector('.mp-routeDetails').open`), false)
        await d.evaluate(`document.querySelector('.mp-routeDetails summary').click()`)
        assert.equal(await d.evaluate(`document.querySelector('.mp-coverageBlock tbody').children.length`), design.requirements.filter(r => r.status === 'confirmed').length)
        await d.evaluate(`document.querySelector('.mp-routeDetails summary').click()`)
      }
      if (name === 'solution') {
        const design = await d.get(`/marketpilot/api/projects/${calm.id}/design`)
        const latest = design.artifacts.filter(a => a.type === 'solution').sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0]
        assert.ok(await d.evaluate(`document.querySelector('.mp-solutionOutcome').innerText.includes(${JSON.stringify(design.recordCodes[latest.id])})`))
        assert.equal(await d.evaluate(`document.querySelector('.mp-solutionAudit').open`), false)
        assert.equal(await d.evaluate(`document.querySelectorAll('.mp-solutionAudit>ul>li').length`), design.evidence.filter(e => !['rejected', 'superseded'].includes(e.status) && (e.kind === 'UNKNOWN' || e.status !== 'verified')).length)
        const extraShot = async (file, width = 1440, height = 900) => {
          await d.shot(join(output, file), width, height); facts.screenshots.push(file); console.log(`Screenshot: ${file}`)
        }
        await d.theme('深色'); await extraShot('after-solution-dark.png'); await d.theme('浅色')
        await extraShot('after-solution-1024.png', 1024, 768)
        await d.evaluate(`document.querySelector('.mp-solutionContents li button').click()`)
        await d.wait(`!!document.querySelector('.mp-solutionMarkdown')`, 'full original solution reader')
        assert.equal(await d.evaluate(`document.querySelector('.mp-readerLayout').dataset.rail`), 'closed')
        const full = await d.get(`/marketpilot/api/projects/${calm.id}/artifacts/${latest.id}`)
        assert.ok(full.artifact.content.includes('UNKNOWN'))
        assert.ok(await d.evaluate(`document.querySelector('.mp-solutionMarkdown').innerText.includes('UNKNOWN')`))
        await extraShot('after-solution-reader-1024.png', 1024, 768)
        await d.click('关闭', '.mp-reader button')
      }
      facts.checks.push(`${name}: real backend state, concise results and full details retained`)
    }
  }
  for (const p of projects) assert.equal(hash(await d.get(`/marketpilot/api/projects/${p.id}`)), initial[p.id], `Project changed: ${p.name}`)
  assert.equal(hash(await d.get('/marketpilot/api/executions')), executions, 'Execution records changed')
  assert.equal(d.errors.length, 0, 'Browser exception')
  facts.checks.push('All project and execution records unchanged; no model calls or gate answers')
  writeFileSync(join(output, `${facts.phase}-checks.json`), JSON.stringify(facts, null, 2))
  console.log('PASS: read-only screenshots')
} finally { d.close() }
