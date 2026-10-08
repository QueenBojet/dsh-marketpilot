import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('retains the CALM input topics, candidate methods and unfrozen conditions', async () => {
  const root = new URL('../fixtures/calm/', import.meta.url)
  const expected = JSON.parse(await readFile(new URL('expected/acceptance.json', root), 'utf8')) as {
    requiredTopics: string[]; unknownTopics: string[]; candidateTechnologies: string[]
  }
  const brief = await readFile(new URL('input/brief.md', root), 'utf8')
  const research = await readFile(new URL('input/technology-notes.md', root), 'utf8')
  for (const topic of [...expected.requiredTopics, ...expected.unknownTopics]) expect(brief).toContain(topic)
  for (const method of expected.candidateTechnologies) expect(research).toContain(method)
  expect(brief).toContain('未冻结')
  expect(research).toContain('没有可核验的厂家型号')
})
