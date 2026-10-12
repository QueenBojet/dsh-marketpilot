import { inflateRawSync, inflateSync } from 'node:zlib'
import { MarketPilotError, ensure } from '../domain/common.ts'
import { readZip } from '../render/zip.ts'

export interface ExtractedSegment { readonly locator: string; readonly text: string }
export interface ExtractedDocument {
  readonly format: 'md' | 'txt' | 'csv' | 'docx' | 'xlsx' | 'pdf'
  readonly mimeType: string
  readonly text: string
  readonly segments: readonly ExtractedSegment[]
  readonly warnings: readonly string[]
}

export const SUPPORTED_EXTENSIONS: readonly string[] = ['.md', '.txt', '.csv', '.docx', '.xlsx', '.pdf']

const MIME: Record<string, string> = {
  md: 'text/markdown', txt: 'text/plain', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

const MAX_TOTAL_TEXT = 2_000_000

/** Decode strict UTF-8, stripping a leading BOM and rejecting NUL bytes. */
function decodeStrictText(bytes: Uint8Array, label: string): string {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new MarketPilotError('INVALID_DOCUMENT', `${label} 必须是有效的 UTF-8 文本。`) }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  ensure(!text.includes('\0'), 'INVALID_DOCUMENT', `${label} 不能包含 NUL 字符。`)
  return text
}

function checkTotalTextLimit(text: string) {
  ensure(text.length <= MAX_TOTAL_TEXT, 'INVALID_DOCUMENT', '提取文本超过 2,000,000 字符上限。')
}

function finish(doc: ExtractedDocument): ExtractedDocument {
  ensure(doc.text.trim().length > 0, 'EXTRACTION_EMPTY', '文档中未提取到任何文本内容。')
  checkTotalTextLimit(doc.text)
  return { ...doc, warnings: [...new Set(doc.warnings)] }
}

/** Dispatch extraction by file extension, validating magic bytes against the claimed format. */
export function extractDocument(fileName: string, bytes: Uint8Array): ExtractedDocument {
  const match = /\.[a-z0-9]+$/i.exec(fileName)
  const extension = (match?.[0] ?? '').toLowerCase()
  switch (extension) {
    case '.md': return finish(extractPlainText(bytes, 'md'))
    case '.txt': return finish(extractPlainText(bytes, 'txt'))
    case '.csv': return finish(extractCsv(bytes))
    case '.docx': return finish(extractDocx(bytes))
    case '.xlsx': return finish(extractXlsx(bytes))
    case '.pdf': return finish(extractPdf(bytes))
    default: throw new MarketPilotError('UNSUPPORTED_FORMAT', `不支持的文件格式：${extension || '（无扩展名）'}。`)
  }
}
function extractPlainText(bytes: Uint8Array, format: 'md' | 'txt'): ExtractedDocument {
  const text = decodeStrictText(bytes, format === 'md' ? 'Markdown 文档' : '文本文档')
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0)
  const segments: ExtractedSegment[] = paragraphs.map((p, i) => ({ locator: `段落 ${String(i + 1)}`, text: p }))
  return { format, mimeType: MIME[format]!, text: segments.map(s => s.text).join('\n\n'), segments, warnings: [] }
}

/** Minimal RFC-4180-ish CSV row splitter: handles quoted fields, embedded commas/newlines, doubled quotes. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += ch; i++
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function extractCsv(bytes: Uint8Array): ExtractedDocument {
  const text = decodeStrictText(bytes, 'CSV 文档')
  const rows = parseCsvRows(text).filter(r => !(r.length === 1 && r[0] === ''))
  const segments: ExtractedSegment[] = rows.map((r, i) => ({ locator: `第 ${String(i + 1)} 行`, text: r.map(c => c.trim()).join(' | ') }))
  return { format: 'csv', mimeType: MIME.csv!, text: segments.map(s => s.text).join('\n'), segments, warnings: [] }
}
// ---- Tiny hand-written XML tokenizer (no deps), robust to attributes and self-closing tags. ----

interface XmlNode { readonly tag: string; readonly attrs: Readonly<Record<string, string>>; readonly children: XmlNode[] }

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(parseInt(body.slice(2), 16))
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10))
    return XML_ENTITIES[body] ?? match
  })
}

const ATTR_RE = /([a-zA-Z_][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"|([a-zA-Z_][-a-zA-Z0-9_:.]*)\s*=\s*'([^']*)'/g

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1] ?? m[3]
    const value = m[2] ?? m[4] ?? ''
    if (name) attrs[name] = decodeXmlEntities(value)
  }
  return attrs
}

function findTagEnd(xml: string, start: number): number {
  let inQuote: string | null = null
  for (let i = start + 1; i < xml.length; i++) {
    const ch = xml[i]
    if (inQuote) { if (ch === inQuote) inQuote = null; continue }
    if (ch === '"' || ch === "'") { inQuote = ch; continue }
    if (ch === '>') return i
  }
  return -1
}

/** Parse an XML document into a lightweight node tree; text nodes are stored as tag '#text' via attrs.value. */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', attrs: {}, children: [] }
  const stack: XmlNode[] = [root]
  let i = 0
  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    if (lt === -1) {
      const trailing = xml.slice(i)
      if (trailing.trim()) stack[stack.length - 1]!.children.push({ tag: '#text', attrs: { value: decodeXmlEntities(trailing) }, children: [] })
      break
    }
    if (lt > i) {
      const raw = xml.slice(i, lt)
      if (raw.trim()) stack[stack.length - 1]!.children.push({ tag: '#text', attrs: { value: decodeXmlEntities(raw) }, children: [] })
    }
    if (xml.startsWith('<!--', lt)) { const end = xml.indexOf('-->', lt); i = end === -1 ? xml.length : end + 3; continue }
    if (xml.startsWith('<?', lt)) { const end = xml.indexOf('?>', lt); i = end === -1 ? xml.length : end + 2; continue }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt)
      const content = end === -1 ? '' : xml.slice(lt + 9, end)
      if (content) stack[stack.length - 1]!.children.push({ tag: '#text', attrs: { value: content }, children: [] })
      i = end === -1 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith('<!', lt)) { const end = xml.indexOf('>', lt); i = end === -1 ? xml.length : end + 1; continue }
    const end = findTagEnd(xml, lt)
    if (end === -1) break
    let content = xml.slice(lt + 1, end)
    if (content.startsWith('/')) {
      const name = content.slice(1).trim()
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s]!.tag === name) { stack.length = s; break }
      }
      i = end + 1
      continue
    }
    const selfClosing = content.endsWith('/')
    if (selfClosing) content = content.slice(0, -1)
    const nameMatch = /^([^\s/]+)/.exec(content)
    const name = nameMatch?.[1] ?? ''
    const attrsRaw = content.slice(name.length)
    const node: XmlNode = { tag: name, attrs: parseAttrs(attrsRaw), children: [] }
    stack[stack.length - 1]!.children.push(node)
    if (!selfClosing) stack.push(node)
    i = end + 1
  }
  return root
}

function findAll(node: XmlNode, tag: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of node.children) {
    if (child.tag === tag) out.push(child)
    findAll(child, tag, out)
  }
  return out
}

function findFirst(node: XmlNode, tag: string): XmlNode | undefined {
  for (const child of node.children) {
    if (child.tag === tag) return child
    const found = findFirst(child, tag)
    if (found) return found
  }
  return undefined
}

function directChildren(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter(c => c.tag === tag)
}

function textOf(node: XmlNode): string {
  let text = ''
  for (const child of node.children) {
    if (child.tag === '#text') text += child.attrs.value ?? ''
    else text += textOf(child)
  }
  return text
}

function magicIsZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

function readZipPart(zip: Map<string, Uint8Array>, name: string): string | undefined {
  const bytes = zip.get(name)
  if (!bytes) return undefined
  return new TextDecoder('utf-8').decode(bytes)
}
function docxParagraphText(p: XmlNode): string {
  let text = ''
  const walk = (node: XmlNode) => {
    for (const child of node.children) {
      if (child.tag === 'w:delText') continue // deleted (tracked-change) text is excluded
      if (child.tag === 'w:t') { text += textOf(child); continue }
      if (child.tag === 'w:tab') { text += '\t'; continue }
      if (child.tag === 'w:br' || child.tag === 'w:cr') { text += '\n'; continue }
      walk(child)
    }
  }
  walk(p)
  return text
}

function docxHeadingLevel(p: XmlNode): string | undefined {
  const pPr = findFirst(p, 'w:pPr')
  if (!pPr) return undefined
  const pStyle = findFirst(pPr, 'w:pStyle')
  const styleId = pStyle?.attrs['w:val']
  if (!styleId) return undefined
  if (/^Heading|^标题/i.test(styleId)) return styleId
  return undefined
}

function extractDocx(bytes: Uint8Array): ExtractedDocument {
  ensure(magicIsZip(bytes), 'INVALID_DOCUMENT', '文件扩展名为 .docx，但内容不是有效的 ZIP/OOXML 归档。')
  let zip: Map<string, Uint8Array>
  try { zip = readZip(bytes) }
  catch { throw new MarketPilotError('INVALID_DOCUMENT', '无法解析 DOCX 归档结构。') }
  const documentXml = readZipPart(zip, 'word/document.xml')
  ensure(documentXml !== undefined, 'INVALID_DOCUMENT', 'DOCX 缺少 word/document.xml，不是有效的 Word 文档。')
  const root = parseXml(documentXml)
  const body = findFirst(root, 'w:body')
  ensure(body !== undefined, 'INVALID_DOCUMENT', 'DOCX 文档缺少正文内容。')

  const segments: ExtractedSegment[] = []
  const warnings: string[] = []
  let tableIndex = 0

  const walkBody = (node: XmlNode) => {
    for (const child of node.children) {
      if (child.tag === 'w:p') {
        const raw = docxParagraphText(child).trim()
        if (raw) {
          const heading = docxHeadingLevel(child)
          segments.push({ locator: `段落 ${String(segments.length + 1)}`, text: heading ? `# ${raw}` : raw })
        }
      } else if (child.tag === 'w:tbl') {
        tableIndex += 1
        const rows = directChildren(child, 'w:tr')
        rows.forEach((row, rowIndex) => {
          const cells = directChildren(row, 'w:tc').map(cell => {
            const parts = directChildren(cell, 'w:p').map(p => docxParagraphText(p).trim())
            return parts.filter(Boolean).join(' ')
          })
          const text = cells.join(' | ')
          if (text.trim()) segments.push({ locator: `表 ${String(tableIndex)} 第 ${String(rowIndex + 1)} 行`, text })
        })
      } else if (child.tag === 'w:sdt') {
        const content = findFirst(child, 'w:sdtContent')
        if (content) walkBody(content)
      } else {
        walkBody(child)
      }
    }
  }
  walkBody(body)

  if (findFirst(root, 'w:drawing') || findFirst(root, 'w:pict')) warnings.push('文档中包含图片或图形对象，未提取其内容。')
  if (findFirst(root, 'w:object') || findAll(root, 'w:OLEObject').length > 0) warnings.push('文档中包含嵌入对象，未提取其内容。')
  if (findAll(root, 'c:chart').length > 0) warnings.push('文档中包含图表，未提取其数据。')

  const text = segments.map(s => s.text).join('\n\n')
  return { format: 'docx', mimeType: MIME.docx!, text, segments, warnings }
}
const MAX_ROWS_PER_SHEET = 5000

function columnLetterToIndex(letters: string): number {
  let index = 0
  for (const ch of letters) index = index * 26 + (ch.toUpperCase().charCodeAt(0) - 64)
  return index - 1
}

function parseCellRef(ref: string): { col: number; row: number } | undefined {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return undefined
  return { col: columnLetterToIndex(m[1]!), row: parseInt(m[2]!, 10) }
}

function sharedStringText(si: XmlNode): string {
  const direct = findFirst(si, 't')
  if (direct) return textOf(direct)
  // Rich text: concatenate every run's <t>.
  return findAll(si, 'r').map(r => { const t = findFirst(r, 't'); return t ? textOf(t) : '' }).join('')
}

function extractXlsx(bytes: Uint8Array): ExtractedDocument {
  ensure(magicIsZip(bytes), 'INVALID_DOCUMENT', '文件扩展名为 .xlsx，但内容不是有效的 ZIP/OOXML 归档。')
  let zip: Map<string, Uint8Array>
  try { zip = readZip(bytes) }
  catch { throw new MarketPilotError('INVALID_DOCUMENT', '无法解析 XLSX 归档结构。') }
  const workbookXml = readZipPart(zip, 'xl/workbook.xml')
  ensure(workbookXml !== undefined, 'INVALID_DOCUMENT', 'XLSX 缺少 xl/workbook.xml，不是有效的 Excel 文档。')
  const workbookRoot = parseXml(workbookXml)
  const sheets = findAll(workbookRoot, 'sheet').map(s => ({
    name: s.attrs.name ?? '', rId: s.attrs['r:id'] ?? '',
  }))
  ensure(sheets.length > 0, 'INVALID_DOCUMENT', 'XLSX 工作簿不包含任何工作表。')

  const relsXml = readZipPart(zip, 'xl/_rels/workbook.xml.rels')
  const relsRoot = relsXml ? parseXml(relsXml) : undefined
  const relTargets = new Map<string, string>()
  if (relsRoot) for (const rel of findAll(relsRoot, 'Relationship')) {
    if (rel.attrs.Id) relTargets.set(rel.attrs.Id, rel.attrs.Target ?? '')
  }

  const sharedStringsXml = readZipPart(zip, 'xl/sharedStrings.xml')
  const sharedStrings: string[] = []
  if (sharedStringsXml) {
    const ssRoot = parseXml(sharedStringsXml)
    for (const si of directChildren(ssRoot.children.find(c => c.tag === 'sst') ?? ssRoot, 'si')) {
      sharedStrings.push(sharedStringText(si))
    }
  }

  const segments: ExtractedSegment[] = []
  const warnings: string[] = []

  for (const sheet of sheets) {
    const target = relTargets.get(sheet.rId)
    if (!target) { warnings.push(`工作表 ${sheet.name} 缺少对应的工作表数据，已跳过。`); continue }
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.?\/?/, '')}`
    const sheetXml = readZipPart(zip, path)
    if (!sheetXml) { warnings.push(`工作表 ${sheet.name} 缺少对应的工作表数据，已跳过。`); continue }
    const sheetRoot = parseXml(sheetXml)
    const sheetData = findFirst(sheetRoot, 'sheetData')
    if (!sheetData) continue
    const rows = directChildren(sheetData, 'row')
    let truncated = false
    rows.forEach((row, idx) => {
      if (idx >= MAX_ROWS_PER_SHEET) { truncated = true; return }
      const rowNumber = row.attrs.r ? parseInt(row.attrs.r, 10) : idx + 1
      const cells = directChildren(row, 'c')
      const byCol = new Map<number, string>()
      let maxCol = -1
      for (const cell of cells) {
        const ref = cell.attrs.r
        const parsed = ref ? parseCellRef(ref) : undefined
        const col = parsed ? parsed.col : byCol.size
        maxCol = Math.max(maxCol, col)
        const type = cell.attrs.t
        const vNode = findFirst(cell, 'v')
        let value = ''
        if (type === 's') {
          const idx2 = vNode ? parseInt(textOf(vNode), 10) : NaN
          value = Number.isFinite(idx2) ? (sharedStrings[idx2] ?? '') : ''
        } else if (type === 'inlineStr') {
          const isNode = findFirst(cell, 'is')
          value = isNode ? sharedStringText(isNode) : ''
        } else if (type === 'str' || type === 'n' || type === undefined) {
          if (vNode) value = textOf(vNode)
          else if (findFirst(cell, 'f')) { warnings.push(`工作表 ${sheet.name} 第 ${String(rowNumber)} 行存在公式但缺少缓存值，已留空。`); value = '' }
        } else if (type === 'b') {
          value = vNode ? (textOf(vNode) === '1' ? 'TRUE' : 'FALSE') : ''
        } else if (type === 'e') {
          value = vNode ? textOf(vNode) : '#ERR'
        }
        byCol.set(col, value)
      }
      const rowCells: string[] = []
      for (let c = 0; c <= maxCol; c++) rowCells.push(byCol.get(c) ?? '')
      const text = rowCells.join(' | ')
      if (text.replace(/\|/g, '').trim()) segments.push({ locator: `工作表 ${sheet.name} 第 ${String(rowNumber)} 行`, text })
    })
    if (truncated) warnings.push(`工作表 ${sheet.name} 超过 ${String(MAX_ROWS_PER_SHEET)} 行，仅提取前 ${String(MAX_ROWS_PER_SHEET)} 行。`)
  }

  const text = segments.map(s => s.text).join('\n')
  return { format: 'xlsx', mimeType: MIME.xlsx!, text, segments, warnings }
}
// ---- Minimal PDF object model (best-effort, no external deps). ----

type PdfValue =
  | { readonly kind: 'dict'; readonly value: Map<string, PdfValue> }
  | { readonly kind: 'array'; readonly value: PdfValue[] }
  | { readonly kind: 'name'; readonly value: string }
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'ref'; readonly value: { num: number; gen: number } }
  | { readonly kind: 'str'; readonly value: string }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'null' }

interface PdfObject { readonly dict: PdfValue | undefined; readonly stream: Uint8Array | undefined }

function dictGet(value: PdfValue | undefined, key: string): PdfValue | undefined {
  return value && value.kind === 'dict' ? value.value.get(key) : undefined
}
function asArray(value: PdfValue | undefined): PdfValue[] | undefined { return value?.kind === 'array' ? value.value : undefined }
function asName(value: PdfValue | undefined): string | undefined { return value?.kind === 'name' ? value.value : undefined }
function asRefNum(value: PdfValue | undefined): number | undefined { return value?.kind === 'ref' ? value.value.num : undefined }
const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const DELIMITERS = new Set('()<>[]{}/%'.split('').map(c => c.charCodeAt(0)))

function skipWs(buf: Buffer, pos: number): number {
  let i = pos
  while (i < buf.length) {
    if (WHITESPACE.has(buf[i]!)) { i++; continue }
    if (buf[i] === 0x25) { // '%' comment to end of line
      while (i < buf.length && buf[i] !== 0x0a && buf[i] !== 0x0d) i++
      continue
    }
    break
  }
  return i
}

function readToken(buf: Buffer, pos: number): { token: string; next: number } {
  let i = pos
  while (i < buf.length && !WHITESPACE.has(buf[i]!) && !DELIMITERS.has(buf[i]!)) i++
  return { token: buf.subarray(pos, i).toString('latin1'), next: i }
}

/** Parse one PDF value (dict/array/name/number/ref/string/bool/null) starting at pos. */
function parsePdfValue(buf: Buffer, pos: number): { value: PdfValue; next: number } {
  let i = skipWs(buf, pos)
  const byte = buf[i]
  if (byte === undefined) return { value: { kind: 'null' }, next: i }

  if (byte === 0x2f) { // '/Name'
    i++
    let name = ''
    while (i < buf.length && !WHITESPACE.has(buf[i]!) && !DELIMITERS.has(buf[i]!)) {
      if (buf[i] === 0x23 && i + 2 < buf.length) { // '#XX' hex escape
        const hex = buf.subarray(i + 1, i + 3).toString('latin1')
        if (/^[0-9a-fA-F]{2}$/.test(hex)) { name += String.fromCharCode(parseInt(hex, 16)); i += 3; continue }
      }
      name += String.fromCharCode(buf[i]!); i++
    }
    return { value: { kind: 'name', value: name }, next: i }
  }

  if (byte === 0x28) return parsePdfLiteralString(buf, i) // '('
  if (byte === 0x3c && buf[i + 1] === 0x3c) { // '<<' dict
    i += 2
    const map = new Map<string, PdfValue>()
    for (;;) {
      i = skipWs(buf, i)
      if (buf[i] === 0x3e && buf[i + 1] === 0x3e) { i += 2; break }
      if (i >= buf.length) break
      const keyParsed = parsePdfValue(buf, i)
      i = keyParsed.next
      if (keyParsed.value.kind !== 'name') break
      const valParsed = parsePdfValue(buf, i)
      map.set(keyParsed.value.value, valParsed.value)
      i = valParsed.next
    }
    return { value: { kind: 'dict', value: map }, next: i }
  }
  if (byte === 0x3c) return parsePdfHexString(buf, i) // '<' hex string
  if (byte === 0x5b) { // '[' array
    i++
    const arr: PdfValue[] = []
    for (;;) {
      i = skipWs(buf, i)
      if (buf[i] === 0x5d) { i++; break }
      if (i >= buf.length) break
      const parsed = parsePdfValue(buf, i)
      arr.push(parsed.value)
      i = parsed.next
    }
    return { value: { kind: 'array', value: arr }, next: i }
  }
  if (byte === 0x2b || byte === 0x2d || byte === 0x2e || (byte >= 0x30 && byte <= 0x39)) {
    const { token, next } = readToken(buf, i)
    // Could be "<num> <gen> R" reference; peek ahead.
    const after1 = skipWs(buf, next)
    const tok2 = readToken(buf, after1)
    const after2 = skipWs(buf, tok2.next)
    if (/^\d+$/.test(token) && /^\d+$/.test(tok2.token) && buf[after2] === 0x52 &&
        (after2 + 1 >= buf.length || WHITESPACE.has(buf[after2 + 1]!) || DELIMITERS.has(buf[after2 + 1]!))) {
      return { value: { kind: 'ref', value: { num: parseInt(token, 10), gen: parseInt(tok2.token, 10) } }, next: after2 + 1 }
    }
    return { value: { kind: 'num', value: parseFloat(token) }, next }
  }
  const { token, next } = readToken(buf, i)
  if (token === 'true') return { value: { kind: 'bool', value: true }, next }
  if (token === 'false') return { value: { kind: 'bool', value: false }, next }
  if (token === 'null' || token === '') return { value: { kind: 'null' }, next: next === i ? i + 1 : next }
  return { value: { kind: 'null' }, next }
}

function parsePdfLiteralString(buf: Buffer, pos: number): { value: PdfValue; next: number } {
  let i = pos + 1
  let depth = 1
  const bytes: number[] = []
  while (i < buf.length && depth > 0) {
    const b = buf[i]!
    if (b === 0x5c) { // backslash escape
      const next = buf[i + 1]
      if (next === undefined) { i++; continue }
      if (next === 0x6e) { bytes.push(0x0a); i += 2; continue }
      if (next === 0x72) { bytes.push(0x0d); i += 2; continue }
      if (next === 0x74) { bytes.push(0x09); i += 2; continue }
      if (next === 0x62) { bytes.push(0x08); i += 2; continue }
      if (next === 0x66) { bytes.push(0x0c); i += 2; continue }
      if (next === 0x28 || next === 0x29 || next === 0x5c) { bytes.push(next); i += 2; continue }
      if (next === 0x0a) { i += 2; continue } // line continuation
      if (next === 0x0d) { i += (buf[i + 2] === 0x0a ? 3 : 2); continue }
      if (next >= 0x30 && next <= 0x37) { // octal escape, up to 3 digits
        let oct = ''
        let j = i + 1
        while (j < buf.length && oct.length < 3 && buf[j]! >= 0x30 && buf[j]! <= 0x37) { oct += String.fromCharCode(buf[j]!); j++ }
        bytes.push(parseInt(oct, 8) & 0xff)
        i = j
        continue
      }
      bytes.push(next); i += 2; continue
    }
    if (b === 0x28) { depth++; bytes.push(b); i++; continue }
    if (b === 0x29) { depth--; i++; if (depth === 0) break; bytes.push(b); continue }
    bytes.push(b); i++
  }
  return { value: { kind: 'str', value: Buffer.from(bytes).toString('latin1') }, next: i }
}

function parsePdfHexString(buf: Buffer, pos: number): { value: PdfValue; next: number } {
  let i = pos + 1
  let hex = ''
  while (i < buf.length && buf[i] !== 0x3e) {
    const ch = buf[i]!
    if (!WHITESPACE.has(ch)) hex += String.fromCharCode(ch)
    i++
  }
  if (hex.length % 2 === 1) hex += '0'
  const bytes: number[] = []
  for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16) || 0)
  return { value: { kind: 'str', value: Buffer.from(bytes).toString('latin1') }, next: i + 1 }
}
const OBJ_RE = /(\d+)\s+(\d+)\s+obj\b/g

function decodeStream(raw: Buffer, filter: string | undefined): Uint8Array {
  if (filter === 'FlateDecode') {
    try { return inflateSync(raw) }
    catch { try { return inflateRawSync(raw) } catch { return new Uint8Array(0) } }
  }
  return new Uint8Array(raw)
}

/** Scan the raw PDF bytes for "N G obj ... endobj" objects (ignores xref tables; approximation is acceptable). */
function scanPdfObjects(buf: Buffer): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>()
  for (const m of buf.toString('latin1').matchAll(OBJ_RE)) {
    const num = parseInt(m[1]!, 10)
    const start = m.index! + m[0].length
    const parsed = parsePdfValue(buf, start)
    let streamBytes: Uint8Array | undefined
    const afterDict = skipWs(buf, parsed.next)
    if (buf.toString('latin1', afterDict, afterDict + 6) === 'stream') {
      let streamStart = afterDict + 6
      if (buf[streamStart] === 0x0d) streamStart++
      if (buf[streamStart] === 0x0a) streamStart++
      const endIdx = buf.toString('latin1', streamStart).indexOf('endstream')
      const rawLen = dictGet(parsed.value, 'Length')
      let declaredLen = rawLen?.kind === 'num' ? rawLen.value : undefined
      let rawStream: Buffer
      if (declaredLen !== undefined && streamStart + declaredLen <= buf.length) {
        rawStream = buf.subarray(streamStart, streamStart + declaredLen)
      } else if (endIdx >= 0) {
        rawStream = buf.subarray(streamStart, streamStart + endIdx)
      } else {
        rawStream = buf.subarray(streamStart, buf.length)
      }
      const filterVal = dictGet(parsed.value, 'Filter')
      const filterName = asName(filterVal) ?? (asArray(filterVal)?.[0] ? asName(asArray(filterVal)![0]) : undefined)
      streamBytes = decodeStream(rawStream, filterName)
    }
    objects.set(num, { dict: parsed.value, stream: streamBytes })
  }
  return objects
}

/** Expand compressed object streams (/Type /ObjStm) using /N and /First, merging their objects in. */
function expandObjectStreams(objects: Map<number, PdfObject>) {
  for (const obj of [...objects.values()]) {
    if (asName(dictGet(obj.dict, 'Type')) !== 'ObjStm' || !obj.stream) continue
    const nVal = dictGet(obj.dict, 'N')
    const firstVal = dictGet(obj.dict, 'First')
    if (nVal?.kind !== 'num' || firstVal?.kind !== 'num') continue
    const n = nVal.value
    const first = firstVal.value
    const header = Buffer.from(obj.stream.subarray(0, first)).toString('latin1')
    const pairs = header.trim().split(/\s+/).map(Number)
    const body = Buffer.from(obj.stream.subarray(first))
    for (let k = 0; k < n; k++) {
      const objNum = pairs[k * 2]
      const relOffset = pairs[k * 2 + 1]
      if (objNum === undefined || relOffset === undefined) continue
      if (objects.has(objNum)) continue // real indirect object takes precedence
      const parsed = parsePdfValue(body, relOffset)
      objects.set(objNum, { dict: parsed.value, stream: undefined })
    }
  }
}
interface CMap { readonly codeBytes: 1 | 2; readonly map: Map<number, string> }

function utf16beToString(hex: string): string {
  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16) || 0)
  const units: number[] = []
  for (let i = 0; i < bytes.length; i += 2) units.push(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0))
  return String.fromCharCode(...units)
}

/** Parse a ToUnicode CMap stream: bfchar/bfrange, 1-2 byte source codes, UTF-16BE destinations (incl. surrogate pairs). */
function parseToUnicodeCMap(text: string): CMap {
  const map = new Map<number, string>()
  let codeBytes: 1 | 2 = 2
  const rangeMatch = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(text)
  if (rangeMatch) {
    const hex = /<([0-9a-fA-F]+)>/.exec(rangeMatch[1]!)
    if (hex && hex[1]!.length <= 2) codeBytes = 1
  }
  const bfcharRe = /beginbfchar([\s\S]*?)endbfchar/g
  for (const section of text.matchAll(bfcharRe)) {
    const pairRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g
    for (const pair of section[1]!.matchAll(pairRe)) {
      const src = parseInt(pair[1]!, 16)
      map.set(src, utf16beToString(pair[2]!))
    }
  }
  const bfrangeRe = /beginbfrange([\s\S]*?)endbfrange/g
  for (const section of text.matchAll(bfrangeRe)) {
    const arrayRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g
    for (const m of section[1]!.matchAll(arrayRe)) {
      const lo = parseInt(m[1]!, 16)
      const dests = [...m[3]!.matchAll(/<([0-9a-fA-F]+)>/g)].map(d => d[1]!)
      dests.forEach((dest, offset) => map.set(lo + offset, utf16beToString(dest)))
    }
    const simpleRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g
    for (const m of section[1]!.matchAll(simpleRe)) {
      const lo = parseInt(m[1]!, 16)
      const hi = parseInt(m[2]!, 16)
      const destStart = parseInt(m[3]!, 16)
      for (let code = lo; code <= hi; code++) {
        const codePoint = destStart + (code - lo)
        map.set(code, String.fromCodePoint(codePoint))
      }
    }
  }
  return { codeBytes, map }
}

/** Decode a raw PDF string value (each char code 0-255 is one byte) via a ToUnicode CMap, or fall back to Latin-1. */
function decodeWithCMap(raw: string, cmap: CMap | undefined): string {
  if (!cmap) return raw
  let out = ''
  const bytesPerCode = cmap.codeBytes
  for (let i = 0; i + bytesPerCode <= raw.length; i += bytesPerCode) {
    let code = 0
    for (let b = 0; b < bytesPerCode; b++) code = (code << 8) | raw.charCodeAt(i + b)
    const mapped = cmap.map.get(code)
    out += mapped ?? ''
  }
  return out
}
const OPERATOR_RE = /^[A-Za-z'"*]+$/

/**
 * Render a content stream to lines of text. Font selection (Tf) switches the
 * active ToUnicode CMap (if any) used to decode subsequent show-text strings;
 * Td/TD/Tm/T-star start a new line heuristically.
 */
function renderContentStream(buf: Buffer, fonts: Map<string, CMap | undefined>): string[] {
  const lines: string[] = []
  let currentLine = ''
  let currentCMap: CMap | undefined
  const operands: PdfValue[] = []
  const flushLine = () => { if (currentLine.trim()) lines.push(currentLine); currentLine = '' }
  const appendString = (raw: string) => { currentLine += decodeWithCMap(raw, currentCMap) }

  let i = skipWs(buf, 0)
  while (i < buf.length) {
    const byte = buf[i]!
    if (byte === 0x2f || byte === 0x28 || byte === 0x3c || byte === 0x5b ||
        byte === 0x2b || byte === 0x2d || byte === 0x2e || (byte >= 0x30 && byte <= 0x39)) {
      const parsed = parsePdfValue(buf, i)
      operands.push(parsed.value)
      i = skipWs(buf, parsed.next)
      continue
    }
    const { token, next } = readToken(buf, i)
    if (!token) { i = next > i ? next : i + 1; i = skipWs(buf, i); continue }
    if (OPERATOR_RE.test(token)) {
      switch (token) {
        case 'BT': flushLine(); break
        case 'ET': flushLine(); break
        case 'Tf': {
          const nameOperand = operands[operands.length - 2]
          const fontName = nameOperand?.kind === 'name' ? nameOperand.value : undefined
          currentCMap = fontName ? fonts.get(fontName) : undefined
          break
        }
        case 'Td': case 'TD': case 'Tm': case 'T*': flushLine(); break
        case 'Tj': {
          const s = operands[operands.length - 1]
          if (s?.kind === 'str') appendString(s.value)
          break
        }
        case "'": {
          flushLine()
          const s = operands[operands.length - 1]
          if (s?.kind === 'str') appendString(s.value)
          break
        }
        case '"': {
          flushLine()
          const s = operands[operands.length - 1]
          if (s?.kind === 'str') appendString(s.value)
          break
        }
        case 'TJ': {
          const arr = operands[operands.length - 1]
          if (arr?.kind === 'array') {
            for (const el of arr.value) {
              if (el.kind === 'str') appendString(el.value)
              else if (el.kind === 'num' && el.value < -100) currentLine += ' '
            }
          }
          break
        }
        default: break
      }
      operands.length = 0
      i = skipWs(buf, next)
      continue
    }
    // Unknown bare token (e.g. 'R' leftover, booleans, null) — drop it.
    i = skipWs(buf, next)
  }
  flushLine()
  return lines
}
function resolve(objects: Map<number, PdfObject>, value: PdfValue | undefined): PdfValue | undefined {
  if (value?.kind === 'ref') return objects.get(value.value.num)?.dict
  return value
}

function resolveStream(objects: Map<number, PdfObject>, value: PdfValue | undefined): Uint8Array | undefined {
  if (value?.kind !== 'ref') return undefined
  return objects.get(value.value.num)?.stream
}

/** Walk a /Pages tree (following /Kids), falling back to scanning all /Type /Page objects by number. */
function collectPagesInOrder(objects: Map<number, PdfObject>, rootDict: PdfValue | undefined): PdfValue[] {
  const pages: PdfValue[] = []
  const seen = new Set<number>()
  const visit = (node: PdfValue | undefined, refNum: number | undefined) => {
    if (!node) return
    if (refNum !== undefined) { if (seen.has(refNum)) return; seen.add(refNum) }
    const type = asName(dictGet(node, 'Type'))
    if (type === 'Page') { pages.push(node); return }
    const kids = asArray(dictGet(node, 'Kids'))
    if (kids) for (const kid of kids) visit(resolve(objects, kid), asRefNum(kid))
  }
  const pagesRef = dictGet(rootDict, 'Pages')
  visit(resolve(objects, pagesRef), asRefNum(pagesRef))
  if (pages.length > 0) return pages
  // Fallback: no usable tree — approximate document order via ascending object numbers.
  return [...objects.entries()].sort((a, b) => a[0] - b[0])
    .filter(([, obj]) => asName(dictGet(obj.dict, 'Type')) === 'Page')
    .map(([, obj]) => obj.dict!)
}

function findTrailerDict(buf: Buffer, objects: Map<number, PdfObject>): PdfValue | undefined {
  const text = buf.toString('latin1')
  const idx = text.lastIndexOf('trailer')
  if (idx >= 0) {
    const parsed = parsePdfValue(buf, idx + 'trailer'.length)
    if (parsed.value.kind === 'dict') return parsed.value
  }
  for (const obj of objects.values()) {
    if (asName(dictGet(obj.dict, 'Type')) === 'Catalog') return obj.dict
  }
  return undefined
}

function fontCMapsForResources(objects: Map<number, PdfObject>, resources: PdfValue | undefined): Map<string, CMap | undefined> {
  const result = new Map<string, CMap | undefined>()
  const fontDict = dictGet(resources, 'Font')
  if (fontDict?.kind !== 'dict') return result
  for (const [name, fontRef] of fontDict.value) {
    const fontObj = resolve(objects, fontRef)
    const toUnicodeRef = dictGet(fontObj, 'ToUnicode')
    const stream = resolveStream(objects, toUnicodeRef)
    if (stream) result.set(name, parseToUnicodeCMap(Buffer.from(stream).toString('latin1')))
    else result.set(name, undefined)
  }
  return result
}

function pageContentBytes(objects: Map<number, PdfObject>, page: PdfValue): Buffer {
  const contents = dictGet(page, 'Contents')
  const parts: Buffer[] = []
  const addRef = (ref: PdfValue | undefined) => {
    const stream = resolveStream(objects, ref)
    if (stream) parts.push(Buffer.from(stream))
  }
  if (contents?.kind === 'array') for (const ref of contents.value) addRef(ref)
  else if (contents) addRef(contents)
  return Buffer.concat(parts.flatMap(p => [p, Buffer.from('\n')]))
}

function extractPdf(bytes: Uint8Array): ExtractedDocument {
  const header = Buffer.from(bytes.subarray(0, 5)).toString('latin1')
  ensure(header === '%PDF-', 'INVALID_DOCUMENT', '文件扩展名为 .pdf，但内容不是有效的 PDF 文档。')
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const objects = scanPdfObjects(buf)
  expandObjectStreams(objects)
  const trailer = findTrailerDict(buf, objects)
  ensure(dictGet(trailer, 'Encrypt') === undefined, 'INVALID_DOCUMENT', '不支持加密的 PDF 文档。')

  const rootRef = dictGet(trailer, 'Root')
  const rootDict = rootRef ? resolve(objects, rootRef) : trailer
  const pages = collectPagesInOrder(objects, rootDict)

  const segments: ExtractedSegment[] = []
  pages.forEach((page, idx) => {
    const resources = resolve(objects, dictGet(page, 'Resources'))
    const fonts = fontCMapsForResources(objects, resources)
    const content = pageContentBytes(objects, page)
    const lines = content.length ? renderContentStream(content, fonts) : []
    const text = lines.join('\n').trim()
    if (text) segments.push({ locator: `第 ${String(idx + 1)} 页`, text })
  })

  const text = segments.map(s => s.text).join('\n\n')
  ensure(text.trim().length > 0, 'EXTRACTION_EMPTY', '未能从 PDF 提取文本（可能为扫描件），请提供文本版或人工录入摘要。')
  const warnings = ['PDF 的版式与表格结构未被保留，均以纯文本行提取。']
  return { format: 'pdf', mimeType: MIME.pdf!, text, segments, warnings }
}
