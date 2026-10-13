import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const researchSkillUrl = new URL('../../../skills/marketpilot-deep-research/SKILL.md', import.meta.url)

/** Package-owned skill, loaded before research; missing assets fail explicitly. */
export async function researchSkill() {
  const text = await readFile(researchSkillUrl, 'utf8')
  if (!text.startsWith('---\nname: marketpilot-deep-research\n') && !text.startsWith('---\r\nname: marketpilot-deep-research\r\n')) {
    throw new Error('RESEARCH_SKILL_INVALID: marketpilot-deep-research')
  }
  return { text, receipt: `skill:marketpilot-deep-research@${createHash('sha256').update(text).digest('hex').slice(0, 12)}` }
}

/** DSH's public runtime registration contract; optional on older hosts. */
export interface ResearchSkillRegistry {
  register(skill: { name: string; description: string; source: string; content: string; path: string;
    resourceBase: { kind: 'directory'; path: string } }): () => void
}

export async function registerResearchSkill(registry: ResearchSkillRegistry) {
  const skill = await researchSkill()
  return registry.register({ name: 'marketpilot-deep-research', description: 'MarketPilot 工程研究规划、来源核实与证据约束报告。',
    source: 'bundled', content: skill.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''),
    path: fileURLToPath(researchSkillUrl), resourceBase: { kind: 'directory', path: fileURLToPath(new URL('.', researchSkillUrl)) } })
}
