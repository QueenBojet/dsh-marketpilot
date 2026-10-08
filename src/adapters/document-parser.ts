import { createHash } from 'node:crypto'
import { extname, isAbsolute } from 'node:path'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { DocumentParserAdapter } from './contracts.ts'
import { ensure } from '../domain/common.ts'

/** Complete, bounded UTF-8 input through the active Harness filesystem provider. */
export class HarnessDocumentParser implements DocumentParserAdapter {
  constructor(private readonly fs: FileSystem, private readonly maxBytes: number) {}
  async parse({ path, signal }: { path: string; signal: AbortSignal }) {
    ensure(isAbsolute(path), 'ABSOLUTE_PATH_REQUIRED', '请提供待导入文档的绝对路径。')
    const extension = extname(path).toLowerCase()
    ensure(extension === '.md' || extension === '.txt', 'UNSUPPORTED_FORMAT', '当前支持 .md/.txt；DOCX/PDF 请先提取为 Markdown。')
    signal.throwIfAborted()
    const target = await this.fs.resolve(path, { signal })
    const bytes = await this.fs.readBytes(target, signal, this.maxBytes)
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    ensure(text.trim() && !text.includes('\0'), 'INVALID_DOCUMENT', '文档必须包含有效 UTF-8 文本。')
    signal.throwIfAborted()
    return { text, mimeType: extension === '.md' ? 'text/markdown' : 'text/plain',
      checksum: createHash('sha256').update(bytes).digest('hex') }
  }
}
