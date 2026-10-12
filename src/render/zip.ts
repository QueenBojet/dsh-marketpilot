import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { MarketPilotError, ensure } from '../domain/common.ts'

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const ZIP64_EOCD_SIG = 0x06064b50
const ZIP64_LOCATOR_SIG = 0x07064b50

const MAX_ENTRY_UNCOMPRESSED = 20 * 1024 * 1024
const MAX_TOTAL_UNCOMPRESSED = 60 * 1024 * 1024

let crcTable: Uint32Array | undefined

function table(): Uint32Array {
  if (crcTable) return crcTable
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  crcTable = t
  return t
}

/** Standard zlib CRC-32 checksum. */
export function crc32(data: Uint8Array): number {
  const t = table()
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = t[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function rejectInvalid(condition: unknown, message: string): asserts condition {
  ensure(condition, 'INVALID_ARCHIVE', message)
}

function isUnsafeName(name: string): boolean {
  const normalized = name.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return true
  return normalized.split('/').some(segment => segment === '..')
}

/**
 * Parse a ZIP archive via the central directory (not local headers alone).
 * Rejects encrypted entries, ZIP64 archives, path-traversal names and
 * oversized/zip-bomb content.
 */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const maxCommentScan = Math.min(buf.length, 65557)
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= buf.length - maxCommentScan && i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break }
  }
  rejectInvalid(eocdOffset >= 0, '未找到有效的 ZIP 目录结束标记。')

  const totalEntries = buf.readUInt16LE(eocdOffset + 10)
  const cdSize = buf.readUInt32LE(eocdOffset + 12)
  const cdOffset = buf.readUInt32LE(eocdOffset + 16)
  rejectInvalid(totalEntries !== 0xffff && cdSize !== 0xffffffff && cdOffset !== 0xffffffff, '不支持 ZIP64 归档。')

  // Guard against a trailing ZIP64 locator even if the 32-bit fields above look normal.
  if (eocdOffset >= 20 && buf.readUInt32LE(eocdOffset - 20) === ZIP64_LOCATOR_SIG) {
    rejectInvalid(false, '不支持 ZIP64 归档。')
  }
  void ZIP64_EOCD_SIG

  const result = new Map<string, Uint8Array>()
  let totalUncompressed = 0
  let pos = cdOffset
  for (let i = 0; i < totalEntries; i++) {
    rejectInvalid(pos + 46 <= buf.length && buf.readUInt32LE(pos) === CENTRAL_SIG, '中央目录条目损坏。')
    const flags = buf.readUInt16LE(pos + 8)
    const method = buf.readUInt16LE(pos + 10)
    const crcExpected = buf.readUInt32LE(pos + 16)
    const compressedSize = buf.readUInt32LE(pos + 20)
    const uncompressedSize = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localHeaderOffset = buf.readUInt32LE(pos + 42)
    const nameBytes = buf.subarray(pos + 46, pos + 46 + nameLen)
    const name = nameBytes.toString('utf-8')

    rejectInvalid((flags & 0x1) === 0, `条目加密，不支持：${name}`)
    rejectInvalid(method === 0 || method === 8, `不支持的压缩方式：${name}`)
    rejectInvalid(compressedSize !== 0xffffffff && uncompressedSize !== 0xffffffff, `不支持 ZIP64 条目：${name}`)
    rejectInvalid(!isUnsafeName(name), `归档包含不安全的路径：${name}`)
    rejectInvalid(uncompressedSize <= MAX_ENTRY_UNCOMPRESSED, `条目超过单文件大小上限：${name}`)

    totalUncompressed += uncompressedSize
    rejectInvalid(totalUncompressed <= MAX_TOTAL_UNCOMPRESSED, '归档展开后总大小超过限制（疑似压缩炸弹）。')

    rejectInvalid(localHeaderOffset + 30 <= buf.length && buf.readUInt32LE(localHeaderOffset) === LOCAL_SIG, `本地文件头损坏：${name}`)
    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26)
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen
    rejectInvalid(dataStart + compressedSize <= buf.length, `条目数据越界：${name}`)
    const compressed = buf.subarray(dataStart, dataStart + compressedSize)

    const data = method === 0 ? Uint8Array.from(compressed) : inflateRawSync(compressed)
    rejectInvalid(data.length === uncompressedSize, `解压后大小与头部不符：${name}`)
    rejectInvalid(crc32(data) === crcExpected, `CRC32 校验失败：${name}`)

    // Only register non-directory entries; directories carry no data of interest.
    if (!name.endsWith('/')) result.set(name, data)
    pos += 46 + nameLen + extraLen + commentLen
  }
  return result
}

function dosDateTime(date: Date): { date: number; time: number } {
  const d = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const t = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  return { date: d & 0xffff, time: t & 0xffff }
}

/**
 * Build a deterministic ZIP archive (deflate, UTF-8 names, fixed DOS
 * timestamp) with local headers, a central directory and an EOCD record.
 * If `[Content_Types].xml` is among the entries it is written first.
 */
export function writeZip(entries: { name: string; data: Uint8Array }[], date: Date = new Date(1980, 0, 1)): Uint8Array {
  const ordered = [...entries].sort((a, b) => {
    const aFirst = a.name === '[Content_Types].xml'
    const bFirst = b.name === '[Content_Types].xml'
    if (aFirst === bFirst) return 0
    return aFirst ? -1 : 1
  })
  const { date: dosDate, time: dosTime } = dosDateTime(date)
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of ordered) {
    const nameBytes = Buffer.from(entry.name, 'utf-8')
    const crc = crc32(entry.data)
    const compressed = deflateRawSync(Buffer.from(entry.data))
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(LOCAL_SIG, 0)
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt16LE(0x0800, 6) // flags: UTF-8 names
    localHeader.writeUInt16LE(8, 8) // method: deflate
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(entry.data.length, 22)
    localHeader.writeUInt16LE(nameBytes.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, nameBytes, compressed)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(CENTRAL_SIG, 0)
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt16LE(0x0800, 8) // flags
    centralHeader.writeUInt16LE(8, 10) // method
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(entry.data.length, 24)
    centralHeader.writeUInt16LE(nameBytes.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra len
    centralHeader.writeUInt16LE(0, 32) // comment len
    centralHeader.writeUInt16LE(0, 34) // disk number start
    centralHeader.writeUInt16LE(0, 36) // internal attrs
    centralHeader.writeUInt32LE(0, 38) // external attrs
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, nameBytes)

    offset += localHeader.length + nameBytes.length + compressed.length
  }

  const localBuf = Buffer.concat(localParts)
  const centralBuf = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIG, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(ordered.length, 8)
  eocd.writeUInt16LE(ordered.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(localBuf.length, 16)
  eocd.writeUInt16LE(0, 20)

  return new Uint8Array(Buffer.concat([localBuf, centralBuf, eocd]))
}
