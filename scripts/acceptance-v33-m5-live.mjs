/** Live GLM acceptance on the installed Desktop. Never answers a Human Gate.
 * --start adds one new CALM solution version via the actual React button.
 * --poll observes that execution, validates saved content, and saves a review copy.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { desktopSession, pause } from './desktop-session.mjs'

const output = resolve('docs/gui-acceptance/v3.3-m5')
mkdirSync(output, { recursive: true })
const factsPath = join(output, 'm5-live-facts.json')
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const families = ['documents', 'requirements', 'evidence', 'competitors', 'policies', 'alternatives', 'decisions', 'tenderItems', 'artifacts', 'workflowRuns']
const checkpoint = facts => writeFileSync(factsPath, JSON.stringify(facts, null, 2))
const d = await desktopSession()
try {
  if (process.argv.includes('--start')) {
    assert.ok(!existsSync(factsPath), 'Existing live facts: inspect or use --poll, do not spend credits again')
    const { projects } = await d.get('/marketpilot/api/projects')
    const project = projects.find(p => p.name === 'CALM 漏油监测桌面版演示')
    assert.ok(project)
    const before = await d.get(`/marketpilot/api/projects/${project.id}`)
    const flow = await d.get(`/marketpilot/api/projects/${project.id}/workflow`)
    assert.equal(flow.capabilities.model.mode, 'live'); assert.equal(flow.capabilities.model.reasoningEffort, 'max')
    assert.ok(flow.capabilities.model.model.startsWith('glm-5.3'))
    assert.ok(before.project.activeDecisionId)
    const executions = (await d.get('/marketpilot/api/executions')).executions
    assert.equal(executions.filter(e=>['running','waiting_human'].includes(e.status)).length, 0)
    const facts = { mode: 'real-desktop-react-click-official-glm', startedAt: new Date().toISOString(),
      projectId: project.id, projectName: project.name, model: flow.capabilities.model,
      research: flow.capabilities.research, humanAnswers: 0, retries: 0,
      activeDecisionId: before.project.activeDecisionId,
      preserved: Object.fromEntries(families.map(key=>[key, Object.fromEntries((before[key]??[]).map(row=>[row.id,hash(row)]))])),
      oldCodes: before.codeBook?.codes ?? {}, confirmed: before.requirements.filter(r=>r.status==='confirmed').length,
      unknowns: before.evidence.filter(e=>e.kind==='UNKNOWN'&&!['rejected','superseded'].includes(e.status)).length,
      executionIdsBefore: executions.map(e=>e.callId), checks: [], status: 'starting' }
    checkpoint(facts)
    await d.openProject(project); await d.click('05 方案生成', '.mp-stageItem')
    await d.wait(`!!document.querySelector('.mp-artifactContext')`, 'solution versions')
    // Two immediate clicks on the same real button test the synchronous duplicate guard.
    await d.evaluate(`(()=>{const b=[...document.querySelectorAll('#mp-stage-controls button')].find(e=>e.textContent.trim()==='生成技术方案');if(!b||b.disabled)throw new Error('Solution blocked');b.click();b.click()})()`)
    let added
    for(let i=0;i<100;i++) {
      added=(await d.get(`/marketpilot/api/executions?projectId=${project.id}`)).executions.filter(e=>!facts.executionIdsBefore.includes(e.callId))
      if(added.length>0)break
      await pause(300)
    }
    assert.equal(added.length,1,'Rapid duplicate click must start exactly one execution')
    facts.callId=added[0].callId; facts.status=added[0].status
    facts.checks.push('rapid-double-click-one-execution'); checkpoint(facts)
    await d.shot(join(output,'m5-live-running-light-1440.png'))
    await d.click('任务中心','.mp-headerNav button')
    await d.wait(`document.querySelector('.mp-root').textContent.includes('方案')`, 'task center sees live task')
    await d.call('Page.reload')
    await d.wait(`!!document.querySelector('button[aria-label="MarketPilot 智策"]')`, 'reload shell',60000)
    await d.evaluate(`document.querySelector('button[aria-label="MarketPilot 智策"]').click()`)
    await d.wait(`!!document.querySelector('.mp-root')`, 'reload panel')
    await d.openProject(project); await d.click('05 方案生成','.mp-stageItem')
    await d.wait(`!!document.querySelector('#mp-stage-controls .mp-progress')`, 'reloaded workflow')
    const after=(await d.get(`/marketpilot/api/executions?projectId=${project.id}`)).executions.filter(e=>!facts.executionIdsBefore.includes(e.callId))
    assert.equal(after.length,1);assert.equal(after[0].callId,facts.callId)
    facts.checks.push('navigate-and-reload-preserve-host-execution');facts.pageErrors=d.errors;checkpoint(facts)
    console.log(JSON.stringify({callId:facts.callId,model:facts.model,status:facts.status,checks:facts.checks}))
  } else if(process.argv.includes('--poll')) {
    const facts=JSON.parse(readFileSync(factsPath,'utf8'));assert.ok(facts.callId)
    const deadline=Date.now()+45000
    let view
    do {
      view=await d.get(`/marketpilot/api/executions/${facts.callId}`)
      const {runs}=await d.get(`/marketpilot/api/projects/${facts.projectId}/runs`)
      const run=runs.filter(r=>r.type==='solution_generation').sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]
      if(run){facts.run=run;facts.runId=run.id}
      facts.status=view.status;facts.lastObservedAt=new Date().toISOString();checkpoint(facts)
      if(view.status!=='running')break
      await pause(5000)
    }while(Date.now()<deadline)
    if(view.status==='completed') {
      const after=await d.get(`/marketpilot/api/projects/${facts.projectId}`)
      for(const key of families) for(const [id,digest] of Object.entries(facts.preserved[key])) {
        assert.equal(hash((after[key]??[]).find(row=>row.id===id)),digest,`Existing ${key} ${id} must remain unchanged`)
      }
      for(const [id,code] of Object.entries(facts.oldCodes))assert.equal(after.codeBook.codes[id],code)
      assert.equal(after.project.activeDecisionId,facts.activeDecisionId)
      const artifacts=after.artifacts.filter(a=>!(a.id in facts.preserved.artifacts))
      assert.equal(artifacts.length,1);const artifact=artifacts[0];assert.equal(artifact.type,'solution')
      const design=await d.get(`/marketpilot/api/projects/${facts.projectId}/design`)
      assert.equal(design.artifacts.find(a=>a.id===artifact.id).context.status,'current')
      assert.equal(artifact.dependencies.decisionId,facts.activeDecisionId)
      assert.equal(artifact.reviewStatus,'draft')
      const body=artifact.content.split(/^## 附录：编号对照/m)[0]
      const citations=[...new Set(body.match(/\b(?:REQ|EVD|ALT|DEC|TND|DOC|ART)-\d+\b/g)??[])]
      const codes=new Set(Object.values(after.codeBook.codes))
      assert.ok(citations.length>0);for(const code of citations)assert.ok(codes.has(code),`Unknown body citation ${code}`)
      assert.ok(body.includes('方案摘要'));assert.ok(body.includes('UNKNOWN'))
      assert.ok(body.includes(`${facts.confirmed} / ${facts.confirmed}`))
      assert.ok(body.includes(`未决 UNKNOWN：${facts.unknowns} 项`))
      assert.ok(body.includes(after.codeBook.codes[facts.activeDecisionId]))
      assert.equal(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i.test(body),false)
      const reviewPath=join(output,'m5-CALM-solution-review.md');writeFileSync(reviewPath,artifact.content)
      facts.completedAt=new Date().toISOString();facts.artifactId=artifact.id;facts.artifactCode=after.codeBook.codes[artifact.id]
      facts.reviewPath=reviewPath;facts.artifactHash=hash(artifact.content);facts.artifactBytes=Buffer.byteLength(artifact.content)
      facts.citations=citations;facts.checks.push('old-records-and-codes-preserved','dependency-current','summary-ledger-reconciled','citations-resolve','no-raw-uuid','new-version-still-draft')
      checkpoint(facts)
    } else if(view.status==='failed'||view.status==='cancelled') {facts.error=view.error;checkpoint(facts)}
    console.log(JSON.stringify({status:facts.status,run:facts.run&&{id:facts.run.id,currentStep:facts.run.currentStep,modelCalls:facts.run.modelCalls,durationMs:facts.run.durationMs},artifactId:facts.artifactId,error:facts.error}))
  } else throw new Error('Use --start or --poll')
} finally { d.close() }
