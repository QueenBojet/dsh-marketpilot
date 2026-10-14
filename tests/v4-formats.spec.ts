import { createRequire } from 'node:module'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

// jsdom ships no bundled type declarations for this package version; load it
// via createRequire (whose return type is `any`) to avoid an untyped static
// import under noImplicitAny. jsdom only exports the `JSDOM` class — the
// `DOMParser` constructor lives on a JSDOM instance's `window`.
const require = createRequire(import.meta.url)
const { JSDOM }: { JSDOM: new () => { window: { DOMParser: new () => { parseFromString(source: string, mimeType: string): { getElementsByTagName(tag: string): { length: number } } } } } } = require('jsdom')
const DOMParser = new JSDOM().window.DOMParser
import { crc32, readZip, writeZip } from '../src/render/zip.ts'
import { extractDocument } from '../src/adapters/extract.ts'
import { defaultTemplate, inspectTemplate, renderDocx } from '../src/render/docx.ts'
import type { DocSection } from '../src/render/docx.ts'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const dec = (b: Uint8Array): string => new TextDecoder('utf-8').decode(b)

function assertWellFormedXml(xmlText: string, label: string) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const errors = doc.getElementsByTagName('parsererror')
  expect(errors.length, `${label} should be well-formed XML`).toBe(0)
}

// ---- minimal DOCX builder (no [Content_Types].xml needed: extractDocx/docx.ts only read word/document.xml) ----
function buildMiniDocx(bodyXml: string): Uint8Array {
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${bodyXml}</w:body></w:document>`
  return writeZip([{ name: 'word/document.xml', data: enc(documentXml) }])
}
// ---- minimal XLSX builder ----
function buildMiniXlsx(sheetXml: string, sharedStrings: string[] = []): Uint8Array {
  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets>` +
    `<sheet name="Sheet1" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `</sheets></workbook>`
  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`
  const sheetFull = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetXml}</sheetData></worksheet>`
  const entries = [
    { name: 'xl/workbook.xml', data: enc(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc(relsXml) },
    { name: 'xl/worksheets/sheet1.xml', data: enc(sheetFull) },
  ]
  if (sharedStrings.length) {
    const sstXml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      sharedStrings.map(s => `<si><t>${s}</t></si>`).join('') + `</sst>`
    entries.push({ name: 'xl/sharedStrings.xml', data: enc(sstXml) })
  }
  return writeZip(entries)
}

// ---- minimal PDF builders (hand-rolled, no deps) ----
function buildPlainPdf(contentStream: string): Uint8Array {
  const parts: string[] = []
  const offsets: number[] = []
  let body = '%PDF-1.4\n'
  const push = (s: string) => { offsets.push(Buffer.byteLength(body, 'latin1')); body += s }
  push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n')
  push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n')
  push('3 0 obj<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>endobj\n')
  push(`4 0 obj<< /Length ${String(Buffer.byteLength(contentStream, 'latin1'))} >>stream\n${contentStream}\nendstream\nendobj\n`)
  push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n')
  const xrefOffset = Buffer.byteLength(body, 'latin1')
  let xref = `xref\n0 ${String(offsets.length + 1)}\n0000000000 65535 f \n`
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`
  body += xref
  body += `trailer<< /Size ${String(offsets.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF`
  void parts
  return new Uint8Array(Buffer.from(body, 'latin1'))
}

function buildFlatePdf(contentStream: string): Uint8Array {
  const compressed = deflateSync(Buffer.from(contentStream, 'latin1'))
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  const push = (s: string | Buffer) => {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += typeof s === 'string' ? s : s.toString('latin1')
  }
  push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n')
  push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n')
  push('3 0 obj<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>endobj\n')
  push(Buffer.concat([
    Buffer.from(`4 0 obj<< /Length ${String(compressed.length)} /Filter /FlateDecode >>stream\n`, 'latin1'),
    compressed,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]))
  push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n')
  const xrefOffset = Buffer.byteLength(body, 'latin1')
  let xref = `xref\n0 ${String(offsets.length + 1)}\n0000000000 65535 f \n`
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`
  body += xref
  body += `trailer<< /Size ${String(offsets.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF`
  return new Uint8Array(Buffer.from(body, 'latin1'))
}

/** A PDF with a 2-byte-code font + ToUnicode CMap mapping codes 0x0001/0x0002 to CJK chars "你"/"好". */
function buildCjkPdf(): Uint8Array {
  const toUnicode = 'BX\nbegincmap\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n' +
    '2 beginbfchar\n<0001> <4F60>\n<0002> <597D>\nendbfchar\nendcmap\nEX'
  const content = 'BT /F1 12 Tf (\\000\\001\\000\\002) Tj ET'
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  const push = (s: string) => { offsets.push(Buffer.byteLength(body, 'latin1')); body += s }
  push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n')
  push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n')
  push('3 0 obj<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>endobj\n')
  push(`4 0 obj<< /Length ${String(Buffer.byteLength(content, 'latin1'))} >>stream\n${content}\nendstream\nendobj\n`)
  push('5 0 obj<< /Type /Font /Subtype /Type0 /BaseFont /Custom /ToUnicode 6 0 R >>endobj\n')
  push(`6 0 obj<< /Length ${String(Buffer.byteLength(toUnicode, 'latin1'))} >>stream\n${toUnicode}\nendstream\nendobj\n`)
  const xrefOffset = Buffer.byteLength(body, 'latin1')
  let xref = `xref\n0 ${String(offsets.length + 1)}\n0000000000 65535 f \n`
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`
  body += xref
  body += `trailer<< /Size ${String(offsets.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF`
  return new Uint8Array(Buffer.from(body, 'latin1'))
}
/** Hand-rolled minimal ZIP with a single STORED, encrypted (flag bit 0) entry. */
function buildEncryptedZip(): Uint8Array {
  const name = Buffer.from('secret.txt', 'utf-8')
  const data = Buffer.from('hello', 'utf-8')
  const crc = crc32(new Uint8Array(data))
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0001, 6) // encrypted flag
  local.writeUInt16LE(0, 8) // method: stored
  local.writeUInt16LE(0, 10)
  local.writeUInt16LE(0, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  local.writeUInt16LE(0, 28)
  const localBuf = Buffer.concat([local, name, data])

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0001, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(0, 42)
  const centralBuf = Buffer.concat([central, name])

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(localBuf.length, 16)
  return new Uint8Array(Buffer.concat([localBuf, centralBuf, eocd]))
}

/** A bare 22-byte EOCD record with ZIP64 sentinel fields, to exercise the ZIP64-rejection path directly. */
function buildZip64Eocd(): Uint8Array {
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0xffff, 10) // total entries sentinel
  eocd.writeUInt32LE(0xffffffff, 12) // cd size sentinel
  eocd.writeUInt32LE(0xffffffff, 16) // cd offset sentinel
  return new Uint8Array(eocd)
}

describe('zip.ts', () => {
  it('round-trips entries through writeZip/readZip with correct bytes', () => {
    const files = [
      { name: 'a.txt', data: enc('hello world') },
      { name: 'dir/b.json', data: enc('{"x":1}') },
      { name: '[Content_Types].xml', data: enc('<Types/>') },
    ]
    const zipped = writeZip(files)
    const read = readZip(zipped)
    expect(read.size).toBe(3)
    for (const f of files) expect(dec(read.get(f.name)!)).toBe(dec(f.data))
  })

  it('computes CRC32 consistently with what writeZip/readZip embed', () => {
    const data = enc('the quick brown fox')
    const zipped = writeZip([{ name: 'f.txt', data }])
    const read = readZip(zipped)
    expect(crc32(read.get('f.txt')!)).toBe(crc32(data))
  })

  it('rejects path-traversal entry names on read', () => {
    const zipped = writeZip([{ name: '../evil.txt', data: enc('x') }])
    expect(() => readZip(zipped)).toThrow(/不安全的路径/)
  })

  it('rejects absolute/drive-letter entry names on read', () => {
    const zipped = writeZip([{ name: 'C:/evil.txt', data: enc('x') }])
    expect(() => readZip(zipped)).toThrow(/不安全的路径/)
  })

  it('rejects an encrypted entry', () => {
    expect(() => readZip(buildEncryptedZip())).toThrow(/加密/)
  })

  it('rejects ZIP64 archives', () => {
    expect(() => readZip(buildZip64Eocd())).toThrow(/ZIP64/)
  })

  it('rejects a single entry exceeding the per-entry size cap (zip-bomb guard)', () => {
    const big = new Uint8Array(21 * 1024 * 1024) // zero-filled, compresses almost instantly
    const zipped = writeZip([{ name: 'big.bin', data: big }])
    expect(() => readZip(zipped)).toThrow(/大小上限/)
  })

  it('rejects multiple entries whose total exceeds the aggregate size cap', () => {
    const chunk = new Uint8Array(16 * 1024 * 1024) // each under the 20MB per-entry cap
    const zipped = writeZip([
      { name: 'a.bin', data: chunk },
      { name: 'b.bin', data: chunk },
      { name: 'c.bin', data: chunk },
      { name: 'd.bin', data: chunk },
    ])
    expect(() => readZip(zipped)).toThrow(/压缩炸弹/)
  })

  it('throws INVALID_ARCHIVE (via MarketPilotError-shaped error) on garbage input', () => {
    expect(() => readZip(enc('not a zip'))).toThrow(/ZIP/)
  })
})

describe('extract.ts: md/txt/csv', () => {
  it('extracts markdown paragraphs with 段落 N locators', () => {
    const doc = extractDocument('notes.md', enc('# Title\n\nFirst para.\n\nSecond para.'))
    expect(doc.format).toBe('md')
    expect(doc.segments.map(s => s.locator)).toEqual(['段落 1', '段落 2', '段落 3'])
    expect(doc.text).toContain('First para.')
  })

  it('extracts plain text paragraphs', () => {
    const doc = extractDocument('notes.txt', enc('line one\n\nline two'))
    expect(doc.format).toBe('txt')
    expect(doc.segments).toHaveLength(2)
  })

  it('extracts csv rows with 第 N 行 locators, honoring quoted fields', () => {
    const csv = 'a,b,c\n"x,y",2,"line1\nline2"\n'
    const doc = extractDocument('data.csv', enc(csv))
    expect(doc.format).toBe('csv')
    expect(doc.segments.map(s => s.locator)).toEqual(['第 1 行', '第 2 行'])
    expect(doc.segments[1]!.text).toContain('line1\nline2')
  })

  it('rejects unsupported extensions', () => {
    expect(() => extractDocument('file.xyz', enc('x'))).toThrow(/不支持的文件格式/)
  })

  it('rejects empty extracted content', () => {
    expect(() => extractDocument('empty.txt', enc('   \n\n  '))).toThrow()
  })
})

describe('extract.ts: docx', () => {
  it('extracts paragraphs, headings, and split-run text with 段落 N locators', () => {
    const body = `
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>My Title</w:t></w:r></w:p>
      <w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>World</w:t></w:r></w:p>
    `
    const doc = extractDocument('x.docx', buildMiniDocx(body))
    expect(doc.format).toBe('docx')
    expect(doc.segments[0]!.locator).toBe('段落 1')
    expect(doc.segments[0]!.text).toBe('# My Title')
    expect(doc.segments[1]!.text).toBe('Hello World')
  })

  it('extracts table rows with 表 N 第 M 行 locators', () => {
    const body = `
      <w:tbl>
        <w:tr><w:tc><w:p><w:r><w:t>H1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>H2</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>v1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>v2</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl>
    `
    const doc = extractDocument('t.docx', buildMiniDocx(body))
    expect(doc.segments.map(s => s.locator)).toEqual(['表 1 第 1 行', '表 1 第 2 行'])
    expect(doc.segments[1]!.text).toBe('v1 | v2')
  })

  it('rejects a .docx whose content is not a ZIP (magic byte mismatch)', () => {
    expect(() => extractDocument('fake.docx', enc('not a zip'))).toThrow(/不是有效的 ZIP/)
  })
})

describe('extract.ts: xlsx', () => {
  it('extracts rows via shared strings, inline strings, numbers, with gap columns', () => {
    const sheetXml = `
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="n"><v>42</v></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>Inline</t></is></c></row>
    `
    const xlsx = buildMiniXlsx(sheetXml, ['Shared'])
    const doc = extractDocument('book.xlsx', xlsx)
    expect(doc.format).toBe('xlsx')
    expect(doc.segments.map(s => s.locator)).toEqual(['工作表 Sheet1 第 1 行', '工作表 Sheet1 第 2 行'])
    expect(doc.segments[0]!.text).toBe('Shared |  | 42')
    expect(doc.segments[1]!.text).toBe('Inline')
  })

  it('rejects a .xlsx whose content is not a ZIP (magic byte mismatch)', () => {
    expect(() => extractDocument('fake.xlsx', enc('not a zip'))).toThrow(/不是有效的 ZIP/)
  })
})

describe('extract.ts: pdf', () => {
  it('extracts plain ASCII text from an uncompressed content stream', () => {
    const pdf = buildPlainPdf('BT /F1 12 Tf (Hello World) Tj ET')
    const doc = extractDocument('a.pdf', pdf)
    expect(doc.format).toBe('pdf')
    expect(doc.segments[0]!.locator).toBe('第 1 页')
    expect(doc.segments[0]!.text).toBe('Hello World')
    expect(doc.warnings[0]).toContain('版式与表格结构未被保留')
  })

  it('extracts text from a FlateDecode-compressed content stream', () => {
    const pdf = buildFlatePdf('BT /F1 12 Tf (Flate Content) Tj ET')
    const doc = extractDocument('b.pdf', pdf)
    expect(doc.segments[0]!.text).toBe('Flate Content')
  })

  it('decodes CJK text via a ToUnicode CMap', () => {
    const pdf = buildCjkPdf()
    const doc = extractDocument('c.pdf', pdf)
    expect(doc.segments[0]!.text).toBe('你好')
  })

  it('rejects a PDF with no extractable text (scanned/empty)', () => {
    const pdf = buildPlainPdf('BT /F1 12 Tf () Tj ET')
    expect(() => extractDocument('empty.pdf', pdf)).toThrow(/扫描件/)
  })

  it('rejects a .pdf whose content lacks the %PDF- header', () => {
    expect(() => extractDocument('fake.pdf', enc('not a pdf'))).toThrow(/不是有效的 PDF/)
  })
})

describe('docx.ts: defaultTemplate + inspectTemplate', () => {
  it('produces a well-formed OOXML package with all XML parts parseable', () => {
    const bytes = defaultTemplate()
    const zip = readZip(bytes)
    for (const [name, data] of zip) {
      if (name.endsWith('.xml') || name.endsWith('.rels')) assertWellFormedXml(dec(data), name)
    }
  })

  it('reports doc.title/project.name placeholders and a sections slot', () => {
    const info = inspectTemplate(defaultTemplate())
    expect(info.placeholders).toEqual(expect.arrayContaining(['doc.title', 'project.name']))
    expect(info.hasSectionsSlot).toBe(true)
    expect(info.sectionSlots).toEqual([])
    expect(info.warnings).toEqual([])
  })
})

describe('docx.ts: renderDocx', () => {
  it('exports a readable contents list without requiring Word to update fields', () => {
    const out = renderDocx(defaultTemplate(), { values: { 'doc.title': 'T', 'project.name': 'P' },
      sections: [{ key: 'requirements', title: '需求概述', blocks: [] }, { key: 'cost', title: '成本估算', blocks: [] }] })
    const xml = dec(readZip(out).get('word/document.xml')!)
    const pages = xml.split('<w:br w:type="page"/>')
    expect(pages[1]).toContain('需求概述')
    expect(pages[1]).toContain('成本估算')
    expect(xml).not.toContain(' TOC ')
    expect(xml).not.toContain('{{contents}}')
  })
  const sections: DocSection[] = [
    {
      key: 'overview',
      title: 'Overview',
      blocks: [
        { kind: 'paragraph', text: 'Plain text with <script>&"' },
        { kind: 'bullets', items: ['one', 'two'] },
        { kind: 'table', header: ['Col A', 'Col B'], rows: [['1', '2']] },
      ],
    },
  ]

  it('substitutes placeholders in the body and in header/footer parts', () => {
    const out = renderDocx(defaultTemplate(), {
      values: { 'doc.title': 'My Report', 'project.name': 'Project Zeta' },
      sections,
    })
    const zip = readZip(out)
    const documentXml = dec(zip.get('word/document.xml')!)
    const headerXml = dec(zip.get('word/header1.xml')!)
    expect(documentXml).toContain('My Report')
    expect(documentXml).toContain('Project Zeta')
    expect(documentXml).not.toContain('{{doc.title}}')
    expect(headerXml).toContain('Project Zeta')
    expect(headerXml).not.toContain('{{project.name}}')
  })

  it('escapes untrusted text content in rendered XML', () => {
    const out = renderDocx(defaultTemplate(), { values: { 'doc.title': 'T', 'project.name': 'P' }, sections })
    const zip = readZip(out)
    const documentXml = dec(zip.get('word/document.xml')!)
    expect(documentXml).toContain('&lt;script&gt;&amp;"')
    expect(documentXml).not.toContain('<script>')
  })

  it('renders headings, bullet lists, and a shaded header row for tables', () => {
    const out = renderDocx(defaultTemplate(), { values: { 'doc.title': 'T', 'project.name': 'P' }, sections })
    const zip = readZip(out)
    const documentXml = dec(zip.get('word/document.xml')!)
    expect(documentXml).toContain('w:val="Heading2"')
    expect(documentXml).toContain('w:val="MPListBullet"')
    expect(documentXml).toContain('w:fill="D9E2F3"')
    expect(documentXml).toContain('Col A')
  })

  it('places {{sections}} content at the slot rather than appending at the body end', () => {
    const out = renderDocx(defaultTemplate(), { values: { 'doc.title': 'T', 'project.name': 'P' }, sections })
    const zip = readZip(out)
    const documentXml = dec(zip.get('word/document.xml')!)
    const sectPrIndex = documentXml.indexOf('<w:sectPr')
    const overviewIndex = documentXml.indexOf('Overview')
    expect(overviewIndex).toBeGreaterThan(-1)
    expect(overviewIndex).toBeLessThan(sectPrIndex)
  })

  it('routes a {{section:KEY}} slot to its exact placement instead of appending', () => {
    const body = `
      <w:p><w:r><w:t>Before</w:t></w:r></w:p>
      <w:p><w:r><w:t xml:space="preserve">{{section:cost}}</w:t></w:r></w:p>
      <w:p><w:r><w:t>After</w:t></w:r></w:p>
    `
    const template = buildMiniDocx(body)
    const costSection: DocSection = { key: 'cost', title: 'Cost', blocks: [{ kind: 'paragraph', text: 'Cost details' }] }
    const out = renderDocx(template, { values: {}, sections: [costSection] })
    const zip = readZip(out)
    const documentXml = dec(zip.get('word/document.xml')!)
    const beforeIdx = documentXml.indexOf('Before')
    const costIdx = documentXml.indexOf('Cost details')
    const afterIdx = documentXml.indexOf('After')
    expect(beforeIdx).toBeLessThan(costIdx)
    expect(costIdx).toBeLessThan(afterIdx)
  })

  it('merges a placeholder split across multiple <w:r><w:t> runs', () => {
    const body = `<w:p><w:r><w:t>{{do</w:t></w:r><w:r><w:t>c.title}}</w:t></w:r></w:p>`
    const template = buildMiniDocx(body)
    const out = renderDocx(template, { values: { 'doc.title': 'Merged Value' }, sections: [] })
    const zip = readZip(out)
    const documentXml = dec(zip.get('word/document.xml')!)
    expect(documentXml).toContain('Merged Value')
  })

  it('appends sections before sectPr when the template declares no slot', () => {
    const body = `<w:p><w:r><w:t>Intro</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`
    const template = buildMiniDocx(body)
    const out = renderDocx(template, { values: {}, sections })
    const zip = readZip(out)
    const documentXml = dec(zip.get('word/document.xml')!)
    const overviewIdx = documentXml.indexOf('Overview')
    const sectPrIdx = documentXml.indexOf('<w:sectPr')
    expect(overviewIdx).toBeGreaterThan(-1)
    expect(overviewIdx).toBeLessThan(sectPrIdx)
  })

  it('produces well-formed XML for every rendered part', () => {
    const out = renderDocx(defaultTemplate(), { values: { 'doc.title': 'T<&>"', 'project.name': 'P' }, sections })
    const zip = readZip(out)
    for (const [name, data] of zip) {
      if (name.endsWith('.xml') || name.endsWith('.rels')) assertWellFormedXml(dec(data), name)
    }
  })

  it('rejects a non-ZIP template', () => {
    expect(() => renderDocx(enc('not a zip'), { values: {}, sections: [] })).toThrow(/不是有效的 ZIP/)
  })

  it('rejects a ZIP template missing word/document.xml', () => {
    const bogus = writeZip([{ name: 'other.xml', data: enc('<x/>') }])
    expect(() => renderDocx(bogus, { values: {}, sections: [] })).toThrow(/缺少必需部件/)
  })
})
