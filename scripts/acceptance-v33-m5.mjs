/** Final real Desktop GUI regression. Read-only project records; no gate answers. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { desktopSession } from './desktop-session.mjs'
import { buildShortCodeIndex } from '../src/domain/shortcodes.ts'

const output = resolve('docs/gui-acceptance/v3.3-m5'); mkdirSync(output, { recursive: true })
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const d = await desktopSession(9258)
const started=Date.now()
const facts = { date: new Date().toISOString(), mode: 'real-installed-desktop-hosted-react', screenshots: [], checks: [], modelCalls: 0, humanAnswers: 0 }
const shot = async (name, width=1440, height=900, anchor) => {
  await d.shot(join(output,name),width,height,anchor);facts.screenshots.push({name,width,height});console.log(`Screenshot: ${name}`)
}
try {
  const {projects}=await d.get('/marketpilot/api/projects')
  const all=[]
  for(const project of projects)all.push({project,detail:await d.get(`/marketpilot/api/projects/${project.id}`)})
  const empty=all.find(p=>p.project.name==='V3.3 M1 GUI 空项目 · synthetic QA')
  const calm=all.find(p=>p.project.name==='CALM 漏油监测桌面版演示')
  const requirements=all.find(p=>p.detail.requirements.some(r=>r.status==='confirmed')&&!p.detail.project.activeDecisionId&&!p.detail.artifacts.some(a=>a.type==='solution'))
  const waiting=all.find(p=>p.detail.workflowRuns.some(r=>r.type==='requirement_analysis'&&r.status==='waiting_human'))
  assert.ok(empty&&calm&&requirements&&waiting, 'Empty, requirements-only, complete CALM and waiting cases required')
  const initial=Object.fromEntries(all.map(p=>[p.project.id,hash(p.detail)]))
  const live=JSON.parse(readFileSync(join(output,'m5-live-facts.json'),'utf8'))
  const legacy=Object.fromEntries(Object.entries(live.preserved).map(([key,rows])=>[key,(calm.detail[key]??[]).filter(row=>row.id in rows)]))
  const oldIndex=buildShortCodeIndex({...legacy,codeBook:{seq:{},codes:live.oldCodes}})
  for(const entry of oldIndex.entries())assert.equal(calm.detail.codeBook.codes[entry.id],entry.code,'First write must preserve legacy displayed codes')
  facts.checks.push('legacy-derived-codes-preserved-on-first-write')
  const executionsBefore=(await d.get('/marketpilot/api/executions')).executions.map(e=>e.callId).sort()
  assert.equal((await d.get('/marketpilot/api/executions')).executions.filter(e=>['running','waiting_human'].includes(e.status)).length,0,'Finish live tasks before final read-only GUI')
  await d.theme('浅色')
  for(const [label,item] of [['empty',empty],['requirements',requirements],['calm',calm]]) {
    for(const theme of ['浅色','深色']) {
      await d.theme(theme);await d.openProject(item.project)
      const flow=await d.get(`/marketpilot/api/projects/${item.project.id}/workflow`)
      const stages=await d.evaluate(`[...document.querySelectorAll('.mp-stepCard')].map(e=>({id:e.dataset.stage,status:e.dataset.status}))`)
      assert.deepEqual(stages,flow.stages.map(s=>({id:s.id,status:s.status})))
      assert.equal(await d.evaluate(`document.querySelector('.mp-stageAction').dataset.stage`),flow.currentStage)
      assert.equal(flow.unknowns,item.detail.evidence.filter(e=>e.kind==='UNKNOWN'&&!['rejected','superseded'].includes(e.status)).length)
      facts.checks.push({project:item.project.name,projectId:item.project.id,theme,currentStage:flow.currentStage,stages,model:flow.capabilities.model,research:flow.capabilities.research})
      for(const [width,height] of [[1440,900],[1366,768],[1024,768]]) {
        await shot(`m5-${label}-${theme==='浅色'?'light':'dark'}-${width}.png`,width,height)
        if(width===1024)assert.equal(await d.evaluate(`getComputedStyle(document.querySelector('.mp-stageNav')).flexDirection`),'row')
      }
    }
  }
  await d.theme('浅色');await d.openProject(empty.project)
  for(const [label,section,button] of [['routes','04 技术路线','生成候选路线'],['solution','05 方案生成','生成技术方案']]) {
    await d.click(section,'.mp-stageItem')
    await d.wait(`!!document.querySelector('#mp-stage-controls')`,label)
    assert.equal(await d.evaluate(`[...document.querySelectorAll('#mp-stage-controls button')].find(e=>e.textContent.trim()===${JSON.stringify(button)}).disabled`),true)
    await shot(`m5-empty-${label}-blocked-1440.png`)
  }
  await d.openProject(waiting.project);await d.click('01 资料与需求','.mp-stageItem')
  await d.wait(`!!document.querySelector('.mp-reviewBlock')`,'waiting batch')
  await shot('m5-requirements-waiting-batch-1440.png',1440,900,'.mp-reviewBlock')
  const review=await d.get(`/marketpilot/api/projects/${waiting.project.id}/review`)
  facts.checks.push({waitingProject:waiting.project.id,batches:review.batches.map(b=>({runId:b.id,status:b.status,proposed:b.proposedIds.length}))})
  await d.openProject(calm.project);await d.click('02 情报研究','.mp-stageItem')
  await d.wait(`!!document.querySelector('.mp-researchInput')`,'research page')
  await shot('m5-calm-research-1440.png',1440,900,'#mp-stage-controls')
  const flow=await d.get(`/marketpilot/api/projects/${calm.project.id}/workflow`)
  assert.equal(flow.capabilities.research.available,false);assert.equal(flow.capabilities.research.mode,'unverified')
  await d.click('03 证据审查','.mp-stageItem');await d.wait(`!!document.querySelector('.mp-reviewFilters')`,'ledger')
  await shot('m5-calm-evidence-1366.png',1366,768,'#mp-stage-controls')
  await d.click('04 技术路线','.mp-stageItem');await d.wait(`!!document.querySelector('.mp-altPage')`,'routes')
  await d.click('矩阵视图');await shot('m5-calm-route-matrix-1024.png',1024,768,'#mp-stage-controls')
  await d.click('05 方案生成','.mp-stageItem');await d.wait(`!!document.querySelector('.mp-artifactContext')`,'solution versions')
  const design=await d.get(`/marketpilot/api/projects/${calm.project.id}/design`)
  const solutions=design.artifacts.filter(a=>a.type==='solution').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))
  const latest=solutions[0];assert.equal(latest.context.status,'current')
  assert.equal(await d.evaluate(`document.querySelector('.mp-artifactContext').dataset.context`),'current')
  await shot('m5-calm-new-version-1440.png',1440,900,'#mp-stage-controls')
  await d.click('预览','#mp-stage-controls button');await d.wait(`!!document.querySelector('.mp-solutionMarkdown')`,'new reader')
  assert.ok(await d.evaluate(`document.querySelector('.mp-solutionMarkdown').textContent.includes('方案摘要')`))
  assert.ok(await d.evaluate(`document.querySelector('.mp-solutionMarkdown').textContent.includes('UNKNOWN')`))
  assert.equal(await d.evaluate(`document.querySelector('.mp-solutionMarkdown').textContent.includes('Harness human (call_')`),false)
  await shot('m5-calm-live-solution-reader-1440.png')
  await d.click('关闭','.mp-reader button')
  const old=solutions.find(a=>a.context.status==='untracked');assert.ok(old)
  const label=await d.evaluate(`[...document.querySelectorAll('#mp-stage-controls button')].find(e=>e.textContent.includes(${JSON.stringify(design.recordCodes[old.id])})).textContent.trim()`)
  await d.click(label,'#mp-stage-controls button');await d.wait(`!!document.querySelector('.mp-solutionMarkdown')`,'old version reader')
  assert.ok(await d.evaluate(`document.querySelector('.mp-reader').textContent.includes('未记录')`))
  await shot('m5-calm-historical-version-1440.png')
  await d.click('关闭','.mp-reader button');await d.theme('深色')
  const latestLabel=await d.evaluate(`[...document.querySelectorAll('#mp-stage-controls button')].find(e=>e.textContent.includes(${JSON.stringify(design.recordCodes[latest.id])})).textContent.trim()`)
  await d.click(latestLabel,'#mp-stage-controls button');await d.wait(`!!document.querySelector('.mp-solutionMarkdown')`,'dark reader')
  assert.equal(await d.evaluate(`document.querySelector('.mp-reader .mp-artifactContext').dataset.context`),'current')
  await shot('m5-calm-solution-reader-dark-1024.png',1024,768)
  await d.click('关闭','.mp-reader button');await d.theme('浅色')
  await d.click('06 投标检查','.mp-stageItem');await d.wait(`document.querySelectorAll('#mp-stage-controls .mp-table tbody tr').length>0`,'tender')
  await shot('m5-calm-tender-1440.png',1440,900,'#mp-stage-controls')
  await d.click('导出符合性矩阵');await d.wait(`!!document.querySelector('.mp-exportBar')`,'export landing')
  assert.equal(await d.evaluate(`[...document.querySelectorAll('.mp-exportBar button')].find(e=>e.textContent==='导出成果').disabled`),true)
  await shot('m5-compliance-export-entry-1440.png')
  await d.click('关闭','.mp-reader button');await d.click('任务中心','.mp-headerNav button')
  await shot('m5-persisted-task-history-1440.png')
  for(const item of all)assert.equal(hash(await d.get(`/marketpilot/api/projects/${item.project.id}`)),initial[item.project.id],`GUI must not mutate ${item.project.name}`)
  assert.deepEqual((await d.get('/marketpilot/api/executions')).executions.map(e=>e.callId).sort(),executionsBefore)
  assert.equal(d.errors.length,0);facts.pageErrors=d.errors
  facts.checks.push('all-project-detail-hashes-unchanged','no-new-executions','new-and-historical-solution-readers','unverified-search-blocked','theme-restored-light')
  await d.openProject(calm.project)
  facts.completedAt=new Date().toISOString();facts.durationMs=Date.now()-started
  writeFileSync(join(output,'m5-gui-facts.json'),JSON.stringify(facts,null,2))
  console.log(`Accepted ${facts.screenshots.length} real-host screenshots; all project hashes unchanged`)
} finally {d.close()}
