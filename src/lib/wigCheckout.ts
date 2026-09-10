import { generateWigOrderNo } from './firestore'
import { allocateOrderPayments } from './workOrderAmounts'
import type { DepositItem } from '@/types'

export interface WigCartLine {
  id: string; type: 'product' | 'service'; name: string; quantity: number; price: number
  isWigProduct?: boolean; wigType?: string; note?: string; workGroupId?: string
}
export interface WigGroupConfig { caseId?: string; title?: string; color?: string; length?: string; notes?: string }
export function wigGroups(cart: WigCartLine[], fallback = false) {
  const groups = cart.filter(item => item.isWigProduct && item.type === 'product').flatMap(item =>
    Array.from({ length: item.quantity }, (_, index) => ({ id: `${item.id}:${index + 1}`, name: `${item.name} #${index + 1}`, item })))
  return groups.length || !fallback ? groups : [{ id: 'custom', name: 'งานวิกสั่งทำ', item: null }]
}

export async function prepareWigOrders(input: {
  id: string; mode: 'sale' | 'deposit'; no: string; cart: WigCartLine[]; total: number
  groups: Record<string, WigGroupConfig>; base: Record<string, unknown>; fallback?: boolean
}) {
  const groups = wigGroups(input.cart, input.fallback)
  if (groups.length > 20) throw new Error('สร้างงานวิกได้ไม่เกิน 20 ชิ้นต่อบิล กรุณาแบ่งบิล')
  for (const line of input.cart) if (line.workGroupId && !groups.some(group => group.id === line.workGroupId)) throw new Error(`กรุณาเลือกชิ้นงานของ ${line.name} ใหม่`)
  const rawTotals = groups.map(group => (group.item?.price ?? 0) + input.cart.filter(item => item.type === 'service' && (item.workGroupId === group.id || (!group.item && !item.workGroupId))).reduce((sum, item) => sum + item.price * item.quantity, 0))
  const subtotal = input.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const totals = allocateOrderPayments(rawTotals, subtotal, input.total)
  return Promise.all(groups.map(async (group, index) => {
    const config = input.groups[group.id] ?? {}
    const items: DepositItem[] = [
      ...(group.item ? [{ productId: group.item.id, name: group.item.name, quantity: 1, unitPrice: group.item.price, total: group.item.price, note: group.item.note || '' }] : []),
      ...input.cart.filter(item => item.type === 'service' && (item.workGroupId === group.id || (!group.item && !item.workGroupId))).map(item => ({ serviceId: item.id, name: item.name, quantity: item.quantity, unitPrice: item.price, total: item.price * item.quantity, note: item.note || '' })),
    ]
    return { id: `${input.id}_wig_${index + 1}`, data: {
      ...input.base, orderNo: await generateWigOrderNo(String(input.base.companyId), String(input.base.branchId)),
      sourceType: input.mode, sourceNo: input.no, saleOrderId: input.mode === 'sale' ? input.id : input.no,
      ...(input.mode === 'sale' ? { saleReceiptNo: input.no } : { depositId: input.id }),
      sourceItemId: group.item?.id || '', sourceItemName: config.title?.trim() || group.name, sourceItemQty: 1,
      workGroupId: group.id, ...(config.caseId ? { workCaseId: config.caseId } : {}), items,
      wigColor: config.color?.trim() || input.base.wigColor || '', wigLength: config.length?.trim() || input.base.wigLength || '',
      notes: config.notes?.trim() || input.base.notes || '', totalAmount: totals[index], depositAmount: 0, remainingAmount: totals[index],
      status: 'waiting', progressImages: [], completedImages: [], orderDate: new Date(),
    } }
  }))
}
