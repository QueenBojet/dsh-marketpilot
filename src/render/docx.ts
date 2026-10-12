import { MarketPilotError, ensure } from '../domain/common.ts'
import { readZip, writeZip } from './zip.ts'

export type DocBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'bullets'; readonly items: readonly string[] }
  | { readonly kind: 'table'; readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] }

export interface DocSection {
  readonly key: string
  readonly title: string
  readonly blocks: readonly DocBlock[]
}

/** Flat dotted-path values for `{{name}}` placeholders, plus the sections used to fill `{{sections}}`/`{{section:KEY}}` slots. */
export interface RenderInput {
  readonly values: Readonly<Record<string, string>>
  readonly sections: readonly DocSection[]
}

export interface TemplateInfo {
  readonly placeholders: readonly string[]
  readonly hasSectionsSlot: boolean
  readonly sectionSlots: readonly string[]
  readonly warnings: readonly string[]
}

// ---- Minimal XML tree: parse + serialize (no external deps). ----

interface XmlNode { tag: string; attrs: Record<string, string>; children: XmlNode[] }

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(parseInt(body.slice(2), 16))
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10))
    return XML_ENTITIES[body] ?? match
  })
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeXmlAttr(s: string): string {
  return escapeXmlText(s).replace(/"/g, '&quot;')
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
/** Parse an XML document into a lightweight node tree; text nodes use tag '#text' with attrs.value. */
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

function textOf(node: XmlNode): string {
  let text = ''
  for (const child of node.children) {
    if (child.tag === '#text') text += child.attrs.value ?? ''
    else text += textOf(child)
  }
  return text
}
// ---- Placeholder scanning + substitution, with split-run handling. ----

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.:-]+)\s*\}\}/g
const SECTION_KEY_RE = /^\{\{\s*section:([a-zA-Z0-9_.-]+)\s*\}\}$/

function sanitizeText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

function el(tag: string, attrs: Record<string, string> = {}, children: XmlNode[] = []): XmlNode {
  return { tag, attrs, children }
}

function textNode(value: string): XmlNode {
  return { tag: '#text', attrs: { value }, children: [] }
}

function cloneNode(node: XmlNode): XmlNode {
  return { tag: node.tag, attrs: { ...node.attrs }, children: node.children.map(cloneNode) }
}

interface RunFragment { readonly parent: XmlNode; readonly run: XmlNode; readonly tNode: XmlNode; text: string }

/** Collect every <w:r><w:t> fragment under a paragraph in document order, with enough context to splice new runs. */
function collectRunFragments(node: XmlNode, out: RunFragment[] = []): RunFragment[] {
  for (const child of node.children) {
    if (child.tag === 'w:r') {
      const t = findFirst(child, 'w:t')
      if (t) out.push({ parent: node, run: child, tNode: t, text: textOf(t) })
    } else {
      collectRunFragments(child, out)
    }
  }
  return out
}

function setRunText(tNode: XmlNode, value: string) {
  tNode.attrs['xml:space'] = 'preserve'
  tNode.children = value.length ? [textNode(value)] : []
}

/** Build one or more <w:r> for a (possibly multi-line) string, cloning rPr for every line's run. */
function buildRunsForText(text: string, rPr?: XmlNode, bold = false): XmlNode[] {
  const lines = sanitizeText(text).split('\n')
  return lines.map((line, idx) => {
    const runProps = rPr ? cloneNode(rPr) : (bold ? el('w:rPr', {}, [el('w:b')]) : undefined)
    if (runProps && bold && !findFirst(runProps, 'w:b')) runProps.children.push(el('w:b'))
    return el('w:r', {}, [
      ...(runProps ? [runProps] : []),
      ...(idx > 0 ? [el('w:br')] : []),
      el('w:t', { 'xml:space': 'preserve' }, line.length ? [textNode(line)] : []),
    ])
  })
}
/** Replace `{{key}}` placeholders in `values` across every paragraph, merging split runs as needed. */
function substitutePlaceholders(root: XmlNode, values: Readonly<Record<string, string>>) {
  for (const p of findAll(root, 'w:p')) {
    const fragments = collectRunFragments(p)
    if (fragments.length === 0) continue
    const combined = fragments.map(f => f.text).join('')
    if (!combined.includes('{{')) continue
    const replaced = combined.replace(PLACEHOLDER_RE, (match, key: string) => {
      if (key === 'sections' || key.startsWith('section:')) return match
      const value = values[key]
      return value === undefined ? match : sanitizeText(value)
    })
    if (replaced === combined) continue
    const first = fragments[0]!
    const rPr = findFirst(first.run, 'w:rPr')
    const lines = sanitizeText(replaced).split('\n')
    const newChildren: XmlNode[] = []
    if (rPr) newChildren.push(rPr)
    lines.forEach((line, idx) => {
      if (idx > 0) newChildren.push(el('w:br'))
      newChildren.push(el('w:t', { 'xml:space': 'preserve' }, line.length ? [textNode(line)] : []))
    })
    first.run.children = newChildren
    for (let i = 1; i < fragments.length; i++) setRunText(fragments[i]!.tNode, '')
  }
}

function paragraphWithStyle(styleId: string, text: string, bold = false): XmlNode {
  return el('w:p', {}, [el('w:pPr', {}, [el('w:pStyle', { 'w:val': styleId })]), ...buildRunsForText(text, undefined, bold)])
}

function bulletParagraph(text: string): XmlNode {
  return el('w:p', {}, [
    el('w:pPr', {}, [el('w:pStyle', { 'w:val': 'MPListBullet' }), el('w:numPr', {}, [el('w:ilvl', { 'w:val': '0' }), el('w:numId', { 'w:val': '1' })])]),
    ...buildRunsForText(text),
  ])
}

function tableCell(text: string, header: boolean): XmlNode {
  const tcPr = header ? el('w:tcPr', {}, [el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': 'D9E2F3' })]) : el('w:tcPr')
  return el('w:tc', {}, [tcPr, el('w:p', {}, buildRunsForText(text, undefined, header))])
}

function buildTable(header: readonly string[], rows: readonly (readonly string[])[]): XmlNode {
  const cols = header.length
  const grid = el('w:tblGrid', {}, Array.from({ length: cols }, () => el('w:gridCol', { 'w:w': String(Math.floor(9000 / cols)) })))
  const tblPr = el('w:tblPr', {}, [
    el('w:tblStyle', { 'w:val': 'MPTable' }),
    el('w:tblW', { 'w:w': '0', 'w:type': 'auto' }),
    el('w:tblLayout', { 'w:type': 'autofit' }),
    el('w:tblBorders', {}, (['top', 'left', 'bottom', 'right', 'insideH', 'insideV'] as const)
      .map(side => el(`w:${side}`, { 'w:val': 'single', 'w:sz': '4', 'w:space': '0', 'w:color': 'BFBFBF' }))),
  ])
  const headerRow = el('w:tr', {}, header.map(h => tableCell(h, true)))
  const bodyRows = rows.map(row => el('w:tr', {}, header.map((_, i) => tableCell(row[i] ?? '', false))))
  return el('w:tbl', {}, [tblPr, grid, headerRow, ...bodyRows])
}

function blockToNodes(block: DocBlock): XmlNode[] {
  switch (block.kind) {
    case 'heading': return [paragraphWithStyle(`Heading${String(block.level)}`, block.text)]
    case 'paragraph': return [paragraphWithStyle('MPBody', block.text)]
    case 'note': return [paragraphWithStyle('MPNote', block.text)]
    case 'bullets': return block.items.map(item => bulletParagraph(item))
    case 'table': return [buildTable(block.header, block.rows)]
  }
}

function renderSectionNodes(section: DocSection): XmlNode[] {
  return [paragraphWithStyle('Heading2', section.title), ...section.blocks.flatMap(blockToNodes)]
}

/** Expand `{{sections}}` / `{{section:KEY}}` slot paragraphs into real content. Returns whether any slot was found. */
function replaceSlots(root: XmlNode, input: RenderInput): boolean {
  let replacedAny = false
  const sectionsByKey = new Map(input.sections.map(s => [s.key, s]))
  const walk = (node: XmlNode) => {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!
      if (child.tag === 'w:p') {
        const fragments = collectRunFragments(child)
        if (fragments.length === 1) {
          const trimmed = fragments[0]!.text.trim()
          if (trimmed === '{{sections}}') {
            const nodes = input.sections.flatMap(renderSectionNodes)
            node.children.splice(i, 1, ...nodes)
            i += nodes.length - 1
            replacedAny = true
            continue
          }
          const sectionMatch = SECTION_KEY_RE.exec(trimmed)
          if (sectionMatch) {
            const section = sectionsByKey.get(sectionMatch[1]!)
            const nodes = section ? renderSectionNodes(section) : []
            node.children.splice(i, 1, ...nodes)
            i += nodes.length - 1
            replacedAny = true
            continue
          }
        }
      }
      walk(child)
    }
  }
  walk(root)
  return replacedAny
}

/** Fallback when the template declares no slot: append all sections right before the final sectPr. */
function appendSectionsBeforeSectPr(body: XmlNode, sections: readonly DocSection[]) {
  if (sections.length === 0) return
  const nodes = sections.flatMap(renderSectionNodes)
  const sectPrIndex = body.children.findIndex(c => c.tag === 'w:sectPr')
  if (sectPrIndex === -1) body.children.push(...nodes)
  else body.children.splice(sectPrIndex, 0, ...nodes)
}
function serializeXml(node: XmlNode): string {
  if (node.tag === '#text') return escapeXmlText(node.attrs.value ?? '')
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${escapeXmlAttr(v)}"`).join('')
  if (node.children.length === 0) return `<${node.tag}${attrs}/>`
  return `<${node.tag}${attrs}>${node.children.map(serializeXml).join('')}</${node.tag}>`
}

function serializeDocument(root: XmlNode): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n${root.children.map(serializeXml).join('')}`
}

/** Document parts whose text may carry `{{...}}` placeholders or slots: the body plus any header/footer. */
const TEXT_PART_RE = /^word\/(document|header\d*|footer\d*)\.xml$/

/** Inspect a template's placeholders and section slots without rendering it. */
export function inspectTemplate(bytes: Uint8Array): TemplateInfo {
  const zip = readTemplateZip(bytes)
  const documentXml = requirePart(zip, 'word/document.xml')
  const documentRoot = parseXml(documentXml)
  const body = findFirst(documentRoot, 'w:body')
  ensure(body !== undefined, 'INVALID_TEMPLATE', '模板缺少正文内容。')

  const placeholders = new Set<string>()
  let hasSectionsSlot = false
  const sectionSlots = new Set<string>()
  for (const [name] of zip) {
    if (!TEXT_PART_RE.test(name)) continue
    const allText = textOf(parseXml(requirePart(zip, name)))
    for (const m of allText.matchAll(PLACEHOLDER_RE)) {
      const key = m[1]!
      if (key === 'sections') { hasSectionsSlot = true; continue }
      if (key.startsWith('section:')) { sectionSlots.add(key.slice('section:'.length)); continue }
      placeholders.add(key)
    }
  }

  const warnings: string[] = []
  if (!hasSectionsSlot && sectionSlots.size === 0) warnings.push('模板未声明 {{sections}} 或 {{section:KEY}} 插槽，渲染时章节内容将追加到正文末尾。')

  return { placeholders: [...placeholders], hasSectionsSlot, sectionSlots: [...sectionSlots], warnings }
}
function readTemplateZip(bytes: Uint8Array): Map<string, Uint8Array> {
  ensure(bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b, 'INVALID_TEMPLATE', '模板不是有效的 ZIP/OOXML 归档。')
  try { return readZip(bytes) }
  catch { throw new MarketPilotError('INVALID_TEMPLATE', '无法解析模板的 OOXML 归档结构。') }
}

function requirePart(zip: Map<string, Uint8Array>, name: string): string {
  const bytes = zip.get(name)
  ensure(bytes !== undefined, 'INVALID_TEMPLATE', `模板缺少必需部件：${name}。`)
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * Render a template with the given input: substitute `{{name}}` placeholders,
 * expand `{{sections}}` / `{{section:KEY}}` slots (or append to the body end
 * if the template declares none), and repackage as a DOCX.
 */
export function renderDocx(template: Uint8Array, input: RenderInput): Uint8Array {
  const zip = readTemplateZip(template)
  const documentXml = requirePart(zip, 'word/document.xml')
  const root = parseXml(documentXml)
  const body = findFirst(root, 'w:body')
  ensure(body !== undefined, 'INVALID_TEMPLATE', '模板缺少正文内容。')

  const hadSlot = replaceSlots(root, input)
  if (!hadSlot) appendSectionsBeforeSectPr(body, input.sections)
  substitutePlaceholders(root, input.values)
  const rendered = new Map<string, string>([['word/document.xml', serializeDocument(root)]])

  // Headers/footers only carry inline placeholders (no section slots).
  for (const [name] of zip) {
    if (name === 'word/document.xml' || !TEXT_PART_RE.test(name)) continue
    const partRoot = parseXml(requirePart(zip, name))
    substitutePlaceholders(partRoot, input.values)
    rendered.set(name, serializeDocument(partRoot))
  }

  const outEntries = [...zip.entries()].map(([name, data]) => {
    const text = rendered.get(name)
    return text === undefined ? { name, data } : { name, data: new TextEncoder().encode(text) }
  })
  return writeZip(outEntries)
}
// ---- Raw OOXML parts for the built-in default template. ----

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

const CONTENT_TYPES_XML = XML_DECL + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

const ROOT_RELS_XML = XML_DECL + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

const DOCUMENT_RELS_XML = XML_DECL + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`
const STYLES_XML = XML_DECL + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="SimSun" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:rFonts w:eastAsia="SimHei"/><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:rFonts w:eastAsia="SimHei"/><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="2"/></w:pPr>
<w:rPr><w:rFonts w:eastAsia="SimHei"/><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="MPBody"><w:name w:val="MP Body"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="MPNote"><w:name w:val="MP Note"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:after="120"/><w:ind w:left="200"/></w:pPr>
<w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="MPListBullet"><w:name w:val="MP List Bullet"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:after="80"/><w:ind w:left="420" w:hanging="420"/></w:pPr></w:style>
<w:style w:type="table" w:styleId="MPTable"><w:name w:val="MP Table"/><w:basedOn w:val="TableNormal"/>
<w:pPr><w:spacing w:after="80"/></w:pPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/></w:style>
</w:styles>`

const SETTINGS_XML = XML_DECL + `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:defaultTabStop w:val="420"/>
<w:compat/>
</w:settings>`

const NUMBERING_XML = XML_DECL + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0">
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>
<w:pPr><w:ind w:left="420" w:hanging="420"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:hint="default"/></w:rPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`

const HEADER_XML = XML_DECL + `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t xml:space="preserve">{{project.name}}</w:t></w:r></w:p>
</w:hdr>`

const FOOTER_XML = XML_DECL + `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:pPr><w:jc w:val="center"/></w:pPr>
<w:r><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:t>1</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p>
</w:ftr>`

const CORE_PROPS_XML = XML_DECL + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>{{doc.title}}</dc:title>
<dc:creator>MarketPilot</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">1980-01-01T00:00:00Z</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">1980-01-01T00:00:00Z</dcterms:modified>
</cp:coreProperties>`

const APP_PROPS_XML = XML_DECL + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>MarketPilot</Application>
</Properties>`

/** The default body: a cover block, a TOC field, a page break, then a `{{sections}}` slot. */
const DOCUMENT_XML = XML_DECL + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="2000" w:after="200"/></w:pPr>
<w:r><w:rPr><w:rFonts w:eastAsia="SimHei"/><w:b/><w:sz w:val="56"/></w:rPr><w:t xml:space="preserve">{{doc.title}}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="4000"/></w:pPr>
<w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">{{project.name}}</w:t></w:r></w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>目录</w:t></w:r></w:p>
<w:p>
<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>
<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">{{sections}}</w:t></w:r></w:p>
<w:sectPr>
<w:headerReference w:type="default" r:id="rId4" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
<w:footerReference w:type="default" r:id="rId5" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
</w:sectPr>
</w:body>
</w:document>`

/** Build the built-in A4 default template: cover page, TOC field, header/footer, and a `{{sections}}` slot. */
export function defaultTemplate(): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s)
  return writeZip([
    { name: '[Content_Types].xml', data: enc(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: enc(ROOT_RELS_XML) },
    { name: 'word/document.xml', data: enc(DOCUMENT_XML) },
    { name: 'word/_rels/document.xml.rels', data: enc(DOCUMENT_RELS_XML) },
    { name: 'word/styles.xml', data: enc(STYLES_XML) },
    { name: 'word/settings.xml', data: enc(SETTINGS_XML) },
    { name: 'word/numbering.xml', data: enc(NUMBERING_XML) },
    { name: 'word/header1.xml', data: enc(HEADER_XML) },
    { name: 'word/footer1.xml', data: enc(FOOTER_XML) },
    { name: 'docProps/core.xml', data: enc(CORE_PROPS_XML) },
    { name: 'docProps/app.xml', data: enc(APP_PROPS_XML) },
  ])
}
