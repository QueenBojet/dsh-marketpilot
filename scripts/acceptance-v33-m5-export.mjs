/** Prepare a real export gate, or verify export after the human answers.
 * This script never approves a gate. --prepare must follow final GUI regression.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { desktopSession, pause } from './desktop-session.mjs'

const output=resolve('docs/gui-acceptance/v3.3-m5')
const live=JSON.parse(readFileSync(join(output,'m5-live-facts.json'),'utf8'))
assert.equal(live.status,'completed');assert.ok(live.artifactId)
const factsPath=join(output,'m5-export-facts.json')
const checkpoint=facts=>writeFileSync(factsPath,JSON.stringify(facts,null,2))
const digest=content=>createHash('sha256').update(JSON.stringify(content)).digest('hex')
const d=await desktopSession()
try {
  if(process.argv.includes('--prepare')) {
    assert.ok(!existsSync(factsPath),'An export is already prepared; use --verify')
    const path=join(output,'exports',`CALM-M5-${live.artifactCode}.md`)
    assert.equal(existsSync(path),false,'Never overwrite a file')
    mkdirSync(join(output,'exports'),{recursive:true})
    const before=(await d.get('/marketpilot/api/executions')).executions.map(e=>e.callId)
    const {projects}=await d.get('/marketpilot/api/projects')
    await d.openProject(projects.find(p=>p.id===live.projectId));await d.click('项目成果','.mp-stageItem')
    await d.wait(`document.querySelectorAll('#mp-stage-controls .mp-table tbody tr').length>0`,'artifacts')
    await d.evaluate(`(()=>{const row=[...document.querySelectorAll('#mp-stage-controls .mp-table tbody tr')].find(e=>e.textContent.includes(${JSON.stringify(live.artifactCode)}));if(!row)throw new Error('New artifact missing');row.querySelector('button').click()})()`)
    await d.wait(`!!document.querySelector('.mp-exportBar input')`,'reader export path')
    await d.evaluate(`(()=>{const input=document.querySelector('.mp-exportBar input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(path)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await pause(250)
    await d.evaluate(`(()=>{const button=[...document.querySelectorAll('.mp-exportBar button')].find(e=>e.textContent.trim()==='导出成果');if(button.disabled)throw new Error('Export blocked');button.click();button.click()})()`)
    let added
    for(let i=0;i<100;i++){added=(await d.get(`/marketpilot/api/executions?projectId=${live.projectId}`)).executions.filter(e=>!before.includes(e.callId));if(added.some(e=>e.status==='waiting_human'))break;await pause(250)}
    assert.equal(added.length,1,'Final GUI rapid duplicate export starts one gate')
    assert.equal(added[0].status,'waiting_human')
    await d.wait(`!document.querySelector('.mp-reader')&&document.querySelector('.mp-dialog')?.textContent.includes('approve_artifact')`,'visible export human gate')
    const artifact=(await d.get(`/marketpilot/api/projects/${live.projectId}/artifacts/${live.artifactId}`)).artifact
    assert.equal(artifact.reviewStatus,'draft');assert.equal(existsSync(path),false)
    const facts={preparedAt:new Date().toISOString(),projectId:live.projectId,artifactId:live.artifactId,artifactCode:live.artifactCode,
      artifactHash:digest(artifact.content),path,callId:added[0].callId,status:'waiting_human',humanApproval:'pending',
      checks:['one-gate-on-double-click','export-reader-closes-for-human-gate','draft-until-human-answer','no-file-before-human-approval'],question:added[0].question.question}
    checkpoint(facts);await d.shot(join(output,'m5-real-export-awaiting-human-1440.png'))
    console.log(JSON.stringify({status:facts.status,artifact:facts.artifactCode,path:facts.path,callId:facts.callId}))
  } else if(process.argv.includes('--verify')) {
    const facts=JSON.parse(readFileSync(factsPath,'utf8'))
    const view=await d.get(`/marketpilot/api/executions/${facts.callId}`)
    facts.status=view.status;facts.observedAt=new Date().toISOString()
    if(view.status==='completed') {
      const artifact=(await d.get(`/marketpilot/api/projects/${facts.projectId}/artifacts/${facts.artifactId}`)).artifact
      assert.equal(artifact.reviewStatus,'approved');assert.ok(artifact.review)
      assert.equal(digest(artifact.content),facts.artifactHash)
      assert.equal(readFileSync(facts.path,'utf8'),artifact.content)
      assert.equal(view.value.data.path,facts.path)
      const design=await d.get(`/marketpilot/api/projects/${facts.projectId}/design`)
      assert.equal(design.artifacts.find(a=>a.id===facts.artifactId).context.status,'current')
      facts.review=artifact.review;facts.humanApproval='approved';facts.checks.push('actual-export-bytes-match-approved-snapshot','approval-does-not-invalidate-dependencies')
    }else if(view.status==='failed'||view.status==='cancelled'){facts.error=view.error}
    checkpoint(facts);console.log(JSON.stringify({status:facts.status,humanApproval:facts.humanApproval,path:facts.path}))
  }else throw new Error('Use --prepare or --verify; a human must answer the real gate')
}finally{d.close()}
