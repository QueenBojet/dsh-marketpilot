import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensure } from '../domain/common.ts'

/** Template substitution is single-pass so document content cannot introduce new variables. */
export function renderPrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g, (_token, key: string) => {
    ensure(Object.hasOwn(variables, key), 'MISSING_PROMPT_VARIABLE', `Prompt 缺少变量：${key}`)
    return variables[key]!
  })
}

export type PromptName = 'requirement-extract' | 'alternative-generate' | 'solution-outline' | 'solution-section' | 'tender-extract' | 'tender-review'
  | 'competitor-extract' | 'policy-extract' | 'discovery' | 'brainstorm'

/** Resolve through plain fs paths (not `new URL`): a replaced global URL (e.g. under jsdom)
 *  must never change which file is read. */
const promptDir = dirname(fileURLToPath(import.meta.url))
export async function loadPrompt(name: PromptName): Promise<string> {
  return readFile(join(promptDir, `${name}.md`), 'utf8')
}
