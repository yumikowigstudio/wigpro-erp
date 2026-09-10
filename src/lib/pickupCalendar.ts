import type { Deposit, DepositItem, WorkOrder } from '@/types'
import { depositPaid, depositRemaining } from './money'

export type PickupState = 'scheduled' | 'picked_up' | 'cancelled'

export interface PickupGroup {
  id: string
  customerId: string
  customerName: string
  customerPhone?: string
  sourceNo?: string
  depositId?: string
  deposit?: Deposit
  orders: WorkOrder[]
  items: DepositItem[]
  pickupDate: Date | null
  pickupDateKey: string
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  state: PickupState
}

export function dateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parsePickupDate(value?: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function groupState(orders: WorkOrder[], deposit?: Deposit): PickupState {
  if (deposit?.pickedUpAt) return 'picked_up'
  const liveOrders = orders.filter(order => order.status !== 'cancelled')
  if (liveOrders.length === 0) return 'cancelled'
  return liveOrders.every(order => order.status === 'delivered') ? 'picked_up' : 'scheduled'
}

function earliestExpectedDate(orders: WorkOrder[]) {
  return orders
    .map(order => parsePickupDate(order.expectedDate))
    .filter((value): value is Date => !!value)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
}

function groupKey(order: WorkOrder) {
  if (order.depositId) return `deposit:${order.depositId}`
  if (order.sourceType === 'sale' && (order.saleOrderId || order.sourceNo)) {
    return `sale:${order.saleOrderId || order.sourceNo}`
  }
  return `work-order:${order.id}`
}

export function buildPickupGroups(orders: WorkOrder[], deposits: Deposit[]): PickupGroup[] {
  const depositById = new Map(deposits.map(deposit => [deposit.id, deposit]))
  const grouped = new Map<string, WorkOrder[]>()

  for (const order of orders) {
    const key = groupKey(order)
    grouped.set(key, [...(grouped.get(key) ?? []), order])
  }

  return Array.from(grouped.entries()).map(([id, groupedOrders]) => {
    const first = groupedOrders[0]
    const deposit = first.depositId ? depositById.get(first.depositId) : undefined
    const pickupDate = parsePickupDate(deposit?.pickupDate) ?? earliestExpectedDate(groupedOrders)
    const items = deposit?.items?.length
      ? deposit.items
      : groupedOrders.flatMap(order => order.items?.length ? order.items : [{
          name: order.sourceItemName || order.wigType || 'งานวิก',
          quantity: order.sourceItemQty || 1,
          unitPrice: order.totalAmount,
          total: order.totalAmount,
        }])
    const totalAmount = deposit?.totalAmount ?? groupedOrders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0)
    const paidAmount = deposit ? depositPaid(deposit) : groupedOrders.reduce((sum, order) => sum + Number(order.depositAmount ?? 0), 0)
    const remainingAmount = deposit ? depositRemaining(deposit) : Math.max(0, totalAmount - paidAmount)

    return {
      id,
      customerId: deposit?.customerId || first.customerId,
      customerName: deposit?.customerName || first.customerName,
      customerPhone: deposit?.customerPhone || first.customerPhone,
      sourceNo: deposit?.depositNo || first.sourceNo || first.saleReceiptNo || first.orderNo,
      depositId: deposit?.id || first.depositId,
      deposit,
      orders: groupedOrders,
      items,
      pickupDate,
      pickupDateKey: pickupDate ? dateKey(pickupDate) : '',
      totalAmount,
      paidAmount,
      remainingAmount,
      state: groupState(groupedOrders, deposit),
    }
  }).sort((a, b) => {
    if (!a.pickupDate && !b.pickupDate) return a.customerName.localeCompare(b.customerName, 'th')
    if (!a.pickupDate) return 1
    if (!b.pickupDate) return -1
    return a.pickupDate.getTime() - b.pickupDate.getTime()
  })
}

export function monthCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}
