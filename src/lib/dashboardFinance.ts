import type { Deposit, Sale } from '../types/index'
import { cashbook } from './cashbook'
import { money } from './money'
import { isCountableDeposit, isCountableSale } from './sales'

export interface DashboardFinanceSummary {
  salesTotal: number
  salesCount: number
  saleReceived: number
  depositReceived: number
  depositCount: number
  totalReceived: number
}

const inRange = (value: Date | undefined, start: Date, end: Date) => Boolean(value && value >= start && value <= end)

export function summarizeDashboardFinance(
  sales: Sale[],
  deposits: Deposit[],
  start: Date,
  end: Date,
  branchId?: string,
): DashboardFinanceSummary {
  const branchSales = sales.filter(sale => !branchId || sale.branchId === branchId)
  const branchDeposits = deposits.filter(deposit => !branchId || deposit.branchId === branchId)
  const countableSales = branchSales.filter(isCountableSale)
  const countableDeposits = branchDeposits.filter(isCountableDeposit)
  const salesInPeriod = countableSales.filter(sale => inRange(sale.createdAt, start, end))
  const receivedEntries = cashbook(countableSales, countableDeposits, [])
    .filter(entry => inRange(entry.date, start, end))
  const saleReceived = money(receivedEntries
    .filter(entry => entry.kind === 'sale')
    .reduce((sum, entry) => sum + entry.amount, 0))
  const depositEntries = receivedEntries.filter(entry => entry.kind === 'deposit')
  const depositReceived = money(depositEntries.reduce((sum, entry) => sum + entry.amount, 0))

  return {
    salesTotal: money(salesInPeriod.reduce((sum, sale) => sum + (sale.totalAmount ?? 0), 0)),
    salesCount: salesInPeriod.length,
    saleReceived,
    depositReceived,
    depositCount: new Set(depositEntries.map(entry => entry.reference)).size,
    totalReceived: money(saleReceived + depositReceived),
  }
}
