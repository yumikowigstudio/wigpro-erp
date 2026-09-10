import { money } from './money'

// Allocate integer satang across work orders and any unassigned bill items.
export function allocateOrderPayments(totals: number[], billTotal: number, paid: number): number[] {
  const weights = totals.map(value => Math.max(0, Math.round(value * 100)))
  weights.push(Math.max(0, Math.round(billTotal * 100) - weights.reduce((sum, value) => sum + value, 0)))
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!sum) return totals.map(() => 0)
  const cents = Math.min(sum, Math.max(0, Math.round(paid * 100)))
  const raw = weights.map(value => cents * value / sum)
  const parts = raw.map(Math.floor)
  let remainder = cents - parts.reduce((a, b) => a + b, 0)
  for (const index of raw.map((value, index) => ({ index, fraction: value - parts[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index)) {
    if (!remainder) break
    parts[index.index]++; remainder--
  }
  return parts.slice(0, totals.length).map(value => money(value / 100))
}
