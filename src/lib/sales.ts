import { Deposit, Sale } from '@/types'

type SaleForRevenue = Pick<Sale, 'status' | 'paymentStatus'>
type DepositForRevenue = Pick<Deposit, 'status'>

export function isCountableSale(sale: SaleForRevenue): boolean {
  return sale.status !== 'cancelled' && sale.paymentStatus !== 'rejected'
}

export function isCountableDeposit(deposit: DepositForRevenue): boolean {
  return deposit.status !== 'cancelled'
}
