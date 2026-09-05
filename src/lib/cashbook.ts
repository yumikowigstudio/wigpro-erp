import type { Deposit, Sale } from '../types/index'
import { depositPayments, money, saleCashReceived } from './money'

export interface RefundRecord {
  id: string; companyId: string; branchId: string; refundTotal: number; method: string;
  createdAt: Date; createdBy?: string; originalSaleId?: string; originalDepositId?: string;
}
export interface CashEntry {
  id: string; branchId: string; kind: 'sale' | 'deposit' | 'refund'; amount: number;
  method: string; date?: Date; userId?: string; reference: string;
}
export function cashbook(sales: Sale[], deposits: Deposit[], refunds: RefundRecord[]): CashEntry[] {
  const entries: CashEntry[] = []
  for (const sale of sales) {
    const received = saleCashReceived(sale)
    if (!received) continue
    const method = sale.payments?.[0]?.method ?? 'unknown'
    entries.push({ id: `sale-${sale.id}`, branchId: sale.branchId, kind: 'sale', amount: received, method,
      date: sale.paymentConfirmedAt ?? sale.createdAt, userId: sale.receivedBy ?? sale.createdBy, reference: sale.receiptNo })
  }
  for (const deposit of deposits) {
    if (deposit.status === 'cancelled' && deposit.refundDue === undefined) continue
    for (const payment of depositPayments(deposit)) {
      if (!payment.confirmed) continue
      entries.push({ id: `deposit-${deposit.id}-${payment.id}`, branchId: deposit.branchId, kind: 'deposit', amount: money(payment.amount), method: payment.method,
        date: payment.dateUnknown ? undefined : payment.receivedAt, userId: payment.receivedBy ?? deposit.createdBy, reference: deposit.depositNo })
    }
  }
  for (const refund of refunds) entries.push({ id: `refund-${refund.id}`, branchId: refund.branchId, kind: 'refund', amount: -money(refund.refundTotal), method: refund.method,
    date: refund.createdAt, userId: refund.createdBy, reference: refund.id })
  return entries
}
