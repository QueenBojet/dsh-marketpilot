import { cp, mkdir, readdir } from 'node:fs/promises'
const output = new URL('../lib/prompts/', import.meta.url)
await mkdir(output, { recursive: true })
const source = new URL('../src/prompts/', import.meta.url)
for (const name of await readdir(source)) if (name.endsWith('.md')) await cp(new URL(name, source), new URL(name, output))
