'use client'
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { wigGroups, type WigCartLine, type WigGroupConfig } from '@/lib/wigCheckout'
import type { CustomerWorkCase } from '@/types'

const field = 'w-full min-w-0 rounded-lg border border-[var(--border-light)] bg-white p-2 text-sm'
export function WigOrderFields({ cart, fallback, configs, onChange, onAssign, companyId, customerId }: {
  cart: WigCartLine[]; fallback: boolean; configs: Record<string, WigGroupConfig>
  onChange: (value: Record<string, WigGroupConfig>) => void; onAssign: (id: string, groupId: string) => void
  companyId: string; customerId: string
}) {
  const [cases, setCases] = useState<CustomerWorkCase[]>([])
  useEffect(() => {
    if (!companyId || !customerId) return
    return onSnapshot(query(collection(db, COLLECTIONS.CUSTOMER_WORK_CASES), where('companyId', '==', companyId), where('customerId', '==', customerId)), snap => setCases(snap.docs.map(item => ({ id: item.id, ...convertTimestamps(item.data()) }) as CustomerWorkCase)))
  }, [companyId, customerId])
  const groups = wigGroups(cart, fallback)
  if (!groups.length) return null
  return <section aria-label="ชิ้นงานวิก" className="border-t border-[var(--border-light)] py-3 space-y-3">
    <h3 className="text-sm font-semibold">ชิ้นงานวิก ({groups.length})</h3>
    {groups.map(group => {
      const config = configs[group.id] || {}
      const update = (value: Partial<WigGroupConfig>) => onChange({ ...configs, [group.id]: { ...config, ...value } })
      return <details key={group.id} className="border-b border-[var(--border-light)] pb-3" open={groups.length === 1 ? true : undefined}>
        <summary className="text-sm cursor-pointer font-medium py-2 break-words">{config.title || group.name}</summary>
        <div className="space-y-2 pt-2">
          <label className="block text-xs">ชื่อชิ้นงาน<input className={field} value={config.title ?? ''} placeholder={group.name} onChange={e => update({ title: e.target.value })} /></label>
          <label className="block text-xs">เคส / อัลบั้ม<select className={field} value={config.caseId ?? ''} onChange={e => update({ caseId: e.target.value })}><option value="">สร้างเคสและอัลบั้มใหม่</option>{cases.filter(item => item.customerId === customerId && item.status === 'active' && !item.workOrderId).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2"><label className="text-xs">สี<input className={field} value={config.color ?? ''} onChange={e => update({ color: e.target.value })} /></label><label className="text-xs">ความยาว<input className={field} value={config.length ?? ''} onChange={e => update({ length: e.target.value })} /></label></div>
          <label className="block text-xs">รายละเอียดชิ้นงาน<textarea className={field} rows={2} value={config.notes ?? ''} onChange={e => update({ notes: e.target.value })} /></label>
        </div>
      </details>
    })}
    {cart.filter(item => item.type === 'service').map(item => <label className="block text-xs" key={item.id}>{item.name} · {item.quantity} รายการ<select aria-label={`ชิ้นงานสำหรับ ${item.name}`} className={field} value={item.workGroupId ?? ''} onChange={e => onAssign(item.id, e.target.value)}><option value="">{fallback && groups[0]?.id === 'custom' ? 'งานวิกสั่งทำ' : 'บริการแยกจากงานวิก'}</option>{groups.map(group => <option key={group.id} value={group.id}>{configs[group.id]?.title || group.name}</option>)}</select></label>)}
  </section>
}
