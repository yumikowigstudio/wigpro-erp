import type { Deposit, DepositPayment, Sale } from '../types/index'

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export const cents = (value: number) => Math.round(value * 100)

// Allocate the final receipt amount in cents, so partial refunds add up exactly.
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  const target = cents(total)
  const exact = weights.map(weight => target * weight / sum)
  const allocated = exact.map(Math.floor)
  let remainder = target - allocated.reduce((a, b) => a + b, 0)
  const order = exact.map((amount, index) => ({ index, remainder: amount - allocated[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const item of order) {
    if (remainder-- <= 0) break
    allocated[item.index] += 1
  }
  return allocated.map(amount => amount / 100)
}

export function saleLineAmounts(sale: Pick<Sale, 'items' | 'totalAmount' | 'subtotal' | 'discountAmount' | 'taxIncluded' | 'taxAmount'>): number[] {
  const net = sale.items.map(item => Math.max(0, item.unitPrice * item.quantity - (item.discountAmount ?? 0)))
  const tax = allocate(Math.max(0, sale.taxAmount ?? 0), sale.items.map((item, index) => item.taxType === 'non_vat' ? 0 : net[index]))
  return allocate(sale.totalAmount, net.map((amount, index) => amount + ((sale.items[index].taxIncluded ?? sale.taxIncluded) ? 0 : (sale.items[index].taxAmount ?? tax[index]))))
}

export function calculateReturn(sale: Sale, quantities: number[], previous: Record<string, number> = {}) {
  const lineAmounts = saleLineAmounts(sale)
  const lineTaxes = allocate(Math.max(0, sale.taxAmount ?? 0), sale.items.map((item, index) => item.taxType === 'non_vat' ? 0 : Math.max(0, item.taxAmount ?? lineAmounts[index])))
  let totalCents = 0
  let vatCents = 0
  quantities.forEach((quantity, index) => {
    const item = sale.items[index]
    if (!Number.isInteger(quantity) || quantity < 0 || !item) throw new Error('จำนวนคืนไม่ถูกต้อง')
    const already = previous[String(index)] ?? 0
    if (quantity + already > item.quantity) throw new Error(`${item.name}: จำนวนคืนเกินจำนวนที่ยังคืนได้`)
    if (quantity === 0) return
    totalCents += Math.round(cents(lineAmounts[index]) * (already + quantity) / item.quantity)
      - Math.round(cents(lineAmounts[index]) * already / item.quantity)
    vatCents += Math.round(cents(lineTaxes[index]) * (already + quantity) / item.quantity)
      - Math.round(cents(lineTaxes[index]) * already / item.quantity)
  })
  const total = totalCents / 100
  const vat = vatCents / 100
  return { total, vat, subtotal: money(total - vat) }
}

export function depositPayments(deposit: Deposit): DepositPayment[] {
  if (deposit.paymentHistory) return deposit.paymentHistory
  const initial = Math.max(0, Math.min(deposit.depositAmount ?? 0, deposit.paidAmount ?? deposit.depositAmount ?? 0))
  const extra = deposit.closedBySaleId ? 0 : Math.max(0, (deposit.paidAmount ?? initial) - initial)
  return [
    ...(initial > 0 ? [{ id: 'legacy-initial', amount: initial, method: deposit.paymentMethod ?? deposit.payMethod ?? 'unknown', receivedAt: deposit.createdAt, confirmed: deposit.paymentStatus !== 'pending' && deposit.paymentStatus !== 'rejected' }] : []),
    ...(extra > 0 ? [{ id: 'legacy-undated', amount: money(extra), method: 'unknown', confirmed: true, dateUnknown: true }] : []),
  ]
}

export const depositPaid = (deposit: Deposit) => money(depositPayments(deposit).filter(payment => payment.confirmed).reduce((sum, payment) => sum + payment.amount, 0))
export const depositCredit = (deposit: Deposit) => deposit.status === 'cancelled' || deposit.closedBySaleId ? 0 : money(Math.max(0, depositPaid(deposit) - (deposit.appliedAmount ?? 0) - (deposit.refundedCreditAmount ?? 0)))

export const depositRemaining = (deposit: Deposit) => deposit.status === 'cancelled' || deposit.closedBySaleId ? 0 : money(Math.max(0, deposit.totalAmount - depositCredit(deposit)))

export function saleCashReceived(sale: Sale): number {
  const recorded = (sale as Sale & { cashReceivedAmount?: number }).cashReceivedAmount
  if (recorded !== undefined) return money(Math.max(0, recorded))
  if (sale.paymentStatus === 'pending' || sale.paymentStatus === 'rejected' && sale.status !== 'cancelled') return 0
  // Cancellation does not itself move money back to the customer.
  if (sale.status === 'cancelled' && sale.refundDue === undefined) return 0
  return money(Math.max(0, sale.totalAmount - (sale.depositDeducted ?? 0)))
}
