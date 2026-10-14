/**
 * Deterministic BOM / cost computation. All money is held as BigInt scaled by
 * 10^4 (4 fractional digits); FX rates are scaled by 10^6. Rounding is
 * half-up and happens only at the documented points:
 *   line amount = qty × unitPrice                       (exact, 4 dp)
 *   currency subtotal = Σ line amounts                  (exact, 4 dp)
 *   base subtotal = Σ round2(subtotal × rate)           (rounded to cents per currency)
 *   contingency = round2(base subtotal × pct / 100)
 *   tax = round2((base subtotal + contingency) × taxPct / 100)
 *   total = base subtotal + contingency + tax
 * A grand total is withheld whenever a used currency lacks an FX rate.
 */
import type { ConfigItem, CostLine, CostSettings } from './v4.ts'

const SCALE = 10_000n
const RATE_SCALE = 1_000_000n

/** Parse a validated non-negative decimal string into a BigInt with `digits` fractional digits. */
export function parseScaled(value: string, digits: number): bigint {
  const [whole = '0', frac = ''] = value.split('.')
  if (frac.length > digits) throw new Error(`Too many fractional digits: ${value}`)
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt((frac + '0'.repeat(digits)).slice(0, digits) || '0')
}

/** Divide with half-up rounding (non-negative operands only). */
function divRound(numerator: bigint, divisor: bigint): bigint {
  return (numerator + divisor / 2n) / divisor
}

/** Round a 4-dp scaled value to cents, keeping 4-dp scale. */
export function round2(value: bigint): bigint { return divRound(value, 100n) * 100n }

/** Format a 4-dp scaled amount with 2 (or 4) fractional digits and thousands separators. */
export function formatMoney(value: bigint, digits = 2): string {
  const rounded = digits === 2 ? round2(value) : value
  const whole = rounded / SCALE
  const frac = (rounded % SCALE).toString().padStart(4, '0').slice(0, digits)
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${digits ? `.${frac}` : ''}`
}

/** Plain machine-readable decimal (4 dp) for snapshots and diffs. */
export function plainMoney(value: bigint): string {
  return `${value / SCALE}.${(value % SCALE).toString().padStart(4, '0')}`
}

export type PriceState = 'quoted' | 'estimate' | 'test' | 'missing'

export interface CostLineResult {
  readonly id: string
  readonly name: string
  readonly category: CostLine['category']
  readonly quantity: number
  readonly currency: string
  readonly unitPrice?: string
  readonly amount?: string
  readonly amountDisplay?: string
  readonly priceState: PriceState
  readonly warnings: readonly string[]
}

export interface CostResult {
  readonly lines: readonly CostLineResult[]
  readonly subtotals: readonly { currency: string; amount: string; display: string; rate?: string }[]
  readonly baseCurrency: string
  readonly baseSubtotal?: string
  readonly contingency?: string
  readonly tax?: string
  readonly total?: string
  readonly totalDisplay?: string
  readonly categories: readonly { category: CostLine['category']; amount: string; display: string; share: number }[]
  readonly missingPrices: number
  readonly estimates: number
  readonly testData: number
  readonly expiredQuotes: number
  readonly missingFx: readonly string[]
  readonly blockers: readonly string[]
}

export function priceStateOf(line: CostLine): PriceState {
  if (line.unitPrice === undefined) return 'missing'
  if (line.sourceType === 'test_data') return 'test'
  if (line.sourceType === 'supplier_quote') return 'quoted'
  return 'estimate'
}

/** Effective quantity: manual quantity, or Σ active linked config quantities × factor. */
export function lineQuantity(line: CostLine, configItems: readonly ConfigItem[]): number {
  if (line.quantityMode === 'manual') return line.quantity
  const linked = configItems.filter(item => item.status === 'active' && line.configItemIds.includes(item.id))
  return linked.reduce((sum, item) => sum + item.quantity, 0) * line.factor
}

/** Compute the full cost picture; `today` (YYYY-MM-DD) decides quote validity. */
export function computeCost(lines: readonly CostLine[], configItems: readonly ConfigItem[], settings: CostSettings, today: string): CostResult {
  const perCurrency = new Map<string, bigint>()
  const perCategory = new Map<CostLine['category'], bigint>()
  const results: CostLineResult[] = []
  let missingPrices = 0, estimates = 0, testData = 0, expiredQuotes = 0
  for (const line of lines) {
    const quantity = lineQuantity(line, configItems)
    const priceState = priceStateOf(line)
    const warnings: string[] = []
    if (line.quantityMode === 'follow_config' && !configItems.some(i => i.status === 'active' && line.configItemIds.includes(i.id)))
      warnings.push('关联配置项均已移除')
    if (line.validUntil !== undefined && line.validUntil < today) { warnings.push('报价已过有效期'); expiredQuotes++ }
    if (priceState === 'missing') { missingPrices++; warnings.push('待询价') }
    if (priceState === 'estimate') estimates++
    if (priceState === 'test') { testData++; warnings.push('测试数据，不可对外') }
    let amount: bigint | undefined
    if (line.unitPrice !== undefined) {
      amount = BigInt(quantity) * parseScaled(line.unitPrice, 4)
      perCurrency.set(line.currency, (perCurrency.get(line.currency) ?? 0n) + amount)
    }
    results.push({ id: line.id, name: line.name, category: line.category, quantity, currency: line.currency,
      ...line.unitPrice === undefined ? {} : { unitPrice: line.unitPrice },
      ...amount === undefined ? {} : { amount: plainMoney(amount), amountDisplay: formatMoney(amount) },
      priceState, warnings })
  }
  const missingFx: string[] = []
  const rates = new Map<string, bigint>()
  for (const [code] of perCurrency) {
    if (code === settings.baseCurrency) { rates.set(code, RATE_SCALE); continue }
    const rate = settings.fxRates.find(r => r.currency === code)
    if (rate) rates.set(code, parseScaled(rate.rate, 6)); else missingFx.push(code)
  }
  const subtotals = [...perCurrency].sort(([a], [b]) => a.localeCompare(b)).map(([code, amount]) => {
    const rate = settings.fxRates.find(r => r.currency === code)?.rate
    return { currency: code, amount: plainMoney(amount), display: formatMoney(amount), ...code !== settings.baseCurrency && rate ? { rate } : {} }
  })
  const blockers: string[] = []
  if (missingFx.length) blockers.push(`缺少汇率：${missingFx.join('、')}，不输出合计`)
  let base: bigint | undefined, contingency: bigint | undefined, tax: bigint | undefined, total: bigint | undefined
  if (!missingFx.length) {
    base = 0n
    for (const [code, amount] of perCurrency) base += round2(divRound(amount * (rates.get(code) ?? RATE_SCALE), RATE_SCALE))
    for (const line of lines) {
      if (line.unitPrice === undefined) continue
      const qty = BigInt(lineQuantity(line, configItems))
      const converted = round2(divRound(qty * parseScaled(line.unitPrice, 4) * (rates.get(line.currency) ?? RATE_SCALE), RATE_SCALE))
      perCategory.set(line.category, (perCategory.get(line.category) ?? 0n) + converted)
    }
    contingency = round2(divRound(base * parseScaled(settings.contingencyPct, 4), 100n * SCALE))
    tax = settings.taxPct === undefined ? 0n : round2(divRound((base + contingency) * parseScaled(settings.taxPct, 4), 100n * SCALE))
    total = base + contingency + tax
  }
  const categoryTotal = [...perCategory.values()].reduce((a, b) => a + b, 0n)
  const categories = [...perCategory].map(([category, amount]) => ({ category, amount: plainMoney(amount), display: formatMoney(amount),
    share: categoryTotal === 0n ? 0 : Number((amount * 10_000n) / categoryTotal) / 100 }))
  if (missingPrices) blockers.push(`${missingPrices} 项待询价`)
  if (settings.taxPct === undefined) blockers.push('未配置税率，合计不含税费')
  return { lines: results, subtotals, baseCurrency: settings.baseCurrency,
    ...base === undefined ? {} : { baseSubtotal: plainMoney(base) },
    ...contingency === undefined ? {} : { contingency: plainMoney(contingency) },
    ...tax === undefined ? {} : { tax: plainMoney(tax) },
    ...total === undefined ? {} : { total: plainMoney(total), totalDisplay: formatMoney(total) },
    categories, missingPrices, estimates, testData, expiredQuotes, missingFx, blockers }
}
