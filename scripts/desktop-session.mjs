/** Installed Desktop/CDP acceptance session. Tokens remain in memory. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function desktopSession(port = 9257) {
  const log = readFileSync(join(process.env.APPDATA, 'dsh-desktop/logs/harness.log'), 'utf8')
  const line = log.split('\n').filter(row => row.includes('dsh web: http://127.0.0.1')).at(-1)
  const endpoint = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/.exec(line ?? '')
  assert.ok(endpoint, 'Start the installed DSH Desktop first')
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `marketpilot-m5-${Date.now()}`)}`,
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true })
  let socket
  const close = () => { socket?.close(); chrome.kill() }
  try {
    let tabs
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
        if (tabs.some(tab => tab.type === 'page')) break
      } catch { /* bounded CDP startup retry */ }
      await pause(250)
    }
    assert.ok(tabs?.some(tab => tab.type === 'page'), 'Chrome CDP did not start')
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
    const pending = new Map(), errors = []; let nextId = 1
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id); pending.delete(message.id)
        message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
      } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true })
    })
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
    })
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
      return result.result.value
    }
    const wait = async (expression, label, timeout = 30000) => {
      const start = Date.now()
      while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await pause(250) }
      throw new Error(`Timed out: ${label}`)
    }
    const click = async (label, selector = 'button') => {
      assert.ok(await evaluate(`(() => { const element=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent?.trim()===${JSON.stringify(label)});if(!element||element.disabled)return false;element.click();return true })()`), `Missing or disabled ${label}`)
      await pause(300)
    }
    const request = async (path, method = 'GET', body) => evaluate(`(async()=>{
      const response=await fetch(${JSON.stringify(path)},${JSON.stringify({ method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })});
      const value=await response.json();return {status:response.status,body:value}
    })()`)
    const get = async path => {
      const response = await request(path); assert.equal(response.status, 200, `GET ${path}`); return response.body
    }
    const openProject = async project => {
      await click('我的项目', '.mp-headerNav button')
      await wait(`!!document.querySelector('.mp-createInput')`, 'projects page')
      await click(project.name, '.mp-table button')
      await wait(`document.querySelectorAll('.mp-stepCard').length===8`, 'project overview')
    }
    const shot = async (path, width = 1440, height = 900, anchor) => {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(300)
      await evaluate(anchor ? `document.querySelector(${JSON.stringify(anchor)})?.scrollIntoView({block:'start'})` : `document.querySelector('.mp-scroll')?.scrollTo(0,0)`)
      assert.equal(await evaluate('document.documentElement.scrollWidth>window.innerWidth'), false, 'Page overflow')
      const capture = await call('Page.captureScreenshot', { format: 'png' })
      writeFileSync(path, Buffer.from(capture.data, 'base64'))
    }
    const theme = async name => {
      await evaluate(`document.querySelector('button[aria-label="设置"]').click()`)
      await wait(`document.querySelectorAll('button[class*="themeCube"]').length>=3`, 'theme settings')
      await click(name, 'button[class*="themeCube"]')
      await wait(name === '深色' ? `document.body.hasAttribute('data-ds-dark-theme')` : `!document.body.hasAttribute('data-ds-dark-theme')`, 'theme applied')
      await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(b=>String(b.className).includes('VOzbGW_close')||b.textContent?.trim()==='关闭');e.click()})()`)
      await wait(`document.querySelectorAll('button[class*="themeCube"]').length===0`, 'settings closed')
    }
    await call('Page.enable'); await call('Runtime.enable')
    await call('Page.navigate', { url: `http://127.0.0.1:${endpoint[1]}/?token=${endpoint[2]}` })
    await wait(`!!document.querySelector('button[aria-label="MarketPilot 智策"]')`, 'Desktop shell', 60000)
    await evaluate(`document.querySelector('button[aria-label="MarketPilot 智策"]').click()`)
    await wait(`!!document.querySelector('.mp-root')`, 'MarketPilot panel')
    return { call, evaluate, wait, click, request, get, openProject, shot, theme, errors, close }
  } catch (error) { close(); throw error }
}
