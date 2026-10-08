import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as DomainPlugin from '@deepseek-ai/dsh-storage-domain'
import * as SqlitePlugin from '@deepseek-ai/dsh-storage-sqlite'
import * as JsonPlugin from '@deepseek-ai/dsh-storage-json'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach } from 'vitest'
import { HarnessProjectRepository } from '../src/storage/harness-repository.ts'
import { createServices } from '../src/services/index.ts'
import type { HumanGate } from '../src/adapters/contracts.ts'

export const approved: HumanGate = { async review() {
  return { reviewer: 'test-engineer', reviewedAt: '2026-10-03T12:00:00.000Z', reason: '测试中的显式人工审核。' }
} }
const cleanups: (() => Promise<void>)[] = []
export function addCleanup(cleanup: () => Promise<void>) { cleanups.push(cleanup) }
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

export async function storageAt(directory: string, medium: 'sqlite' | 'json') {
  const root = new Context()
  const hub = await root.plugin(Storage)
  const backend = medium === 'sqlite'
    ? await root.plugin(SqlitePlugin, { path: join(directory, 'marketpilot.db') })
    : await root.plugin(JsonPlugin, { root: directory })
  const domain = await root.plugin(DomainPlugin, { backend: medium })
  let repository: HarnessProjectRepository
  try { repository = await HarnessProjectRepository.open(root.storageDomain) }
  catch (error) { await domain.dispose(); await backend.dispose(); await hub.dispose(); throw error }
  const close = async () => { await repository.close(); await domain.dispose(); await backend.dispose(); await hub.dispose() }
  return { root, repository, close }
}

export async function setup(medium: 'sqlite' | 'json' = 'sqlite', humanGate: HumanGate = approved) {
  const directory = await mkdtemp(join(tmpdir(), 'marketpilot-test-'))
  cleanups.push(async () => {
    const target = resolve(directory)
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1)?.startsWith('marketpilot-test-')) throw new Error('Unsafe test cleanup path')
    await rm(target, { recursive: true, force: true })
  })
  const storage = await storageAt(directory, medium)
  cleanups.push(storage.close)
  let time = Date.parse('2026-10-03T12:00:00.000Z')
  const services = createServices(storage.repository, humanGate, () => new Date(time))
  const project = await services.projects.create({ name: '匿名监测需求测试' })
  return { ...storage, services, project, directory, advance: (ms: number) => { time += ms } }
}

export const requirement = { originalText: '连续监测', normalizedText: '系统连续监测并保留报警事件', type: 'functional', priority: 'must' }
export const evidence = { kind: 'SOURCE', title: '匿名客户纪要', statement: '客户要求连续监测。', sourceType: 'customer', sourceLocator: '第 1 条' }
export const alternative = { name: '候选多源路线', summary: '采用多源观测并人工复核。', components: ['监测传感器', '事件记录平台'], strengths: [], limitations: [], risks: [], unknowns: ['最小检漏率待确认'], requirementCoverage: {}, evidenceIds: [] }
export const tender = { originalText: '设备检出率不低于指定指标', normalizedRequirement: '检出率需达到招标指标', claimKinds: ['technical_parameter'], status: 'compliant', requirementIds: [], evidenceIds: [] }

export async function confirmedRequirement(services: ReturnType<typeof createServices>, projectId: string) {
  const [row] = await services.requirements.addMany(projectId, [requirement])
  await services.requirements.confirm(projectId, [row!.id])
  return row!.id
}
