/** Prepare a real export gate, verify it, or retry an already approved snapshot.
 * This script never approves a gate. --prepare must follow final GUI regression.
 */
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { desktopSession, pause } from './desktop-session.mjs'

const output=resolve('docs/gui-acceptance/v3.3-m5')
const live=JSON.parse(readFileSync(join(output,'m5-live-facts.json'),'utf8'))
assert.equal(live.status,'completed');assert.ok(live.artifactId)
const factsPath=join(output,'m5-export-facts.json')
const checkpoint=facts=>writeFileSync(factsPath,JSON.stringify(facts,null,2))
const digest=content=>createHash('sha256').update(JSON.stringify(content)).digest('hex')
const recordAttempt=facts=>{
  facts.attempts??=[]
  for(const attempt of facts.attempts)attempt.path??=facts.path
  const attempt={callId:facts.callId,path:facts.path,status:facts.status,observedAt:facts.observedAt,humanApproval:facts.humanApproval,
    ...(facts.error?{error:facts.error}:{}),...(facts.review?{review:facts.review}:{})}
  const index=facts.attempts.findIndex(a=>a.callId===facts.callId)
  if(index<0)facts.attempts.push(attempt);else facts.attempts[index]=attempt
}
const verify=async facts=>{
  const view=await d.get(`/marketpilot/api/executions/${facts.callId}`)
  const artifact=(await d.get(`/marketpilot/api/projects/${facts.projectId}/artifacts/${facts.artifactId}`)).artifact
  assert.equal(digest(artifact.content),facts.artifactHash)
  facts.status=view.status;facts.observedAt=new Date().toISOString()
  facts.artifactReviewStatus=artifact.reviewStatus
  facts.humanApproval=artifact.reviewStatus==='approved'?'approved':'pending'
  if(artifact.review)facts.review=artifact.review
  if(view.status==='failed'||view.status==='cancelled')facts.error=view.error
  else delete facts.error
  recordAttempt(facts);checkpoint(facts)
  if(view.status==='completed') {
    assert.equal(artifact.reviewStatus,'approved');assert.ok(artifact.review)
    const bytes=readFileSync(facts.path)
    assert.equal(bytes.toString('utf8'),artifact.content)
    assert.equal(view.value.data.path,facts.path)
    assert.equal(view.value.data.operation,'create')
    const design=await d.get(`/marketpilot/api/projects/${facts.projectId}/design`)
    assert.equal(design.artifacts.find(a=>a.id===facts.artifactId).context.status,'current')
    if(facts.retryBaseline) {
      assert.deepEqual(artifact.review,facts.retryBaseline.review)
      for(const [id,hash] of Object.entries(facts.retryBaseline.projectDetailHashes))
        assert.equal(digest(await d.get(`/marketpilot/api/projects/${id}`)),hash,'Export must not mutate project records or codes')
    }
    facts.bytes=bytes.length;facts.fileSha256=createHash('sha256').update(bytes).digest('hex')
    facts.operation=view.value.data.operation
    facts.checks=[...new Set([...facts.checks,'actual-export-bytes-match-approved-snapshot','approval-does-not-invalidate-dependencies',
      ...(facts.retryBaseline?['retry-reuses-original-human-approval','all-project-records-and-codes-unchanged']:[])])]
    if(process.argv.includes('--archive')) {
      const archivePath=join(output,'exports',`CALM-M5-${facts.artifactCode}.md`)
      if(archivePath!==facts.path) {
        // Archive the verified official export, never a draft/review copy.
        mkdirSync(join(output,'exports'),{recursive:true})
        if(!existsSync(archivePath))copyFileSync(facts.path,archivePath,constants.COPYFILE_EXCL)
        assert.deepEqual(readFileSync(archivePath),bytes)
      }
      facts.archivePath=archivePath
      facts.checks=[...new Set([...facts.checks,'repository-archive-bytes-match-official-export'])]
    }
    checkpoint(facts)
  }
  console.log(JSON.stringify({status:facts.status,humanApproval:facts.humanApproval,path:facts.path,bytes:facts.bytes}))
}
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
    await verify(facts)
  } else if(process.argv.includes('--retry')) {
    const facts=JSON.parse(readFileSync(factsPath,'utf8'))
    assert.ok(['failed','cancelled'].includes(facts.status),'Only retry a recorded failed export')
    const artifact=(await d.get(`/marketpilot/api/projects/${facts.projectId}/artifacts/${facts.artifactId}`)).artifact
    assert.equal(artifact.reviewStatus,'approved');assert.ok(artifact.review)
    assert.equal(digest(artifact.content),facts.artifactHash)
    recordAttempt(facts)
    const pathIndex=process.argv.indexOf('--path')
    if(pathIndex>=0) {
      const path=process.argv[pathIndex+1]
      assert.ok(path&&isAbsolute(path)&&path.endsWith('.md'),'A new absolute Markdown export path is required')
      facts.originalRequestedPath??=facts.path;facts.path=path
    }
    assert.equal(existsSync(facts.path),false,'Never overwrite a file')
    const {projects}=await d.get('/marketpilot/api/projects')
    const projectDetailHashes={}
    for(const project of projects)projectDetailHashes[project.id]=digest(await d.get(`/marketpilot/api/projects/${project.id}`))
    facts.retryBaseline={observedAt:new Date().toISOString(),review:artifact.review,projectDetailHashes}
    const before=(await d.get('/marketpilot/api/executions')).executions.map(e=>e.callId)
    await d.openProject(projects.find(p=>p.id===facts.projectId));await d.click('项目成果','.mp-stageItem')
    await d.wait(`document.querySelectorAll('#mp-stage-controls .mp-table tbody tr').length>0`,'artifacts')
    await d.evaluate(`(()=>{const row=[...document.querySelectorAll('#mp-stage-controls .mp-table tbody tr')].find(e=>e.textContent.includes(${JSON.stringify(facts.artifactCode)}));if(!row)throw new Error('Approved artifact missing');row.querySelector('button').click()})()`)
    await d.wait(`!!document.querySelector('.mp-exportBar input')`,'reader export path')
    await d.evaluate(`(()=>{const input=document.querySelector('.mp-exportBar input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(facts.path)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await pause(250);await d.click('导出成果','.mp-exportBar button')
    let added
    for(let i=0;i<100;i++){added=(await d.get(`/marketpilot/api/executions?projectId=${facts.projectId}`)).executions.filter(e=>!before.includes(e.callId));if(added.length)break;await pause(250)}
    assert.equal(added.length,1,'Retry starts exactly one execution')
    facts.callId=added[0].callId;facts.status=added[0].status;facts.retriedAt=new Date().toISOString();delete facts.error
    recordAttempt(facts);checkpoint(facts)
    for(let i=0;i<100;i++){const view=await d.get(`/marketpilot/api/executions/${facts.callId}`);if(view.status!=='running')break;await pause(250)}
    await verify(facts)
    assert.equal(facts.status,'completed','Official export must complete')
    await d.click('任务中心','.mp-headerNav button')
    await d.wait(`[...document.querySelectorAll('.mp-taskCard')].some(e=>e.textContent.includes('导出成果')&&e.textContent.includes('已完成'))`,'successful export task shown')
    await d.shot(join(output,'m5-real-export-completed-1440.png'))
    assert.equal(d.errors.length,0,'No page errors')
  }else throw new Error('Use --prepare, --verify or --retry; this script never answers human gates')
}finally{d.close()}
