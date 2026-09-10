'use client'
import type { CourseTemplate } from '@/lib/courseTypes'
import type { Service, Branch } from '@/types'

const field = 'w-full min-w-0 rounded-lg border border-[var(--border-light)] bg-white px-3 py-2 text-sm'
export function CourseTemplateFields({ value, onChange, services, branches }: {
  value: CourseTemplate | null; onChange: (value: CourseTemplate | null) => void; services: Service[]; branches: Branch[]
}) {
  return <fieldset className="border-t border-[var(--border-light)] pt-4 space-y-3">
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked ? { paidUnits: 10, bonusUnits: 2, validityDays: null, serviceIds: [], branchIds: [] } : null)} />ขายเป็นคอร์ส / แพ็กเกจ</label>
    {value && <>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs space-y-1 block">จำนวนครั้งที่ซื้อ<input aria-label="จำนวนครั้งที่ซื้อ" className={field} type="number" min={1} max={10000} value={value.paidUnits} onChange={e => onChange({ ...value, paidUnits: Number(e.target.value) })} /></label>
        <label className="text-xs space-y-1 block">จำนวนครั้งแถม<input aria-label="จำนวนครั้งแถม" className={field} type="number" min={0} max={10000} value={value.bonusUnits} onChange={e => onChange({ ...value, bonusUnits: Number(e.target.value) })} /></label>
      </div>
      <label className="block text-xs space-y-1">อายุคอร์ส (วันนับจากยืนยันชำระเงิน)<input aria-label="อายุคอร์ส" className={field} type="number" min={1} max={3650} placeholder="ไม่จำกัดอายุ" value={value.validityDays ?? ''} onChange={e => onChange({ ...value, validityDays: e.target.value ? Number(e.target.value) : null })} /></label>
      <div><p className="text-xs font-medium mb-2">บริการที่ใช้สิทธิ์ได้</p><div className="max-h-40 overflow-auto space-y-2">
        {services.filter(service => !service.course && service.status === 'active').map(service => <label key={service.id} className="flex gap-2 text-sm"><input type="checkbox" checked={value.serviceIds.includes(service.id)} onChange={e => onChange({ ...value, serviceIds: e.target.checked ? [...value.serviceIds, service.id] : value.serviceIds.filter(id => id !== service.id) })} /><span className="break-words">{service.name}</span></label>)}
        {!services.some(service => !service.course && service.status === 'active') && <p className="text-sm text-amber-700">เพิ่มบริการที่จะใช้สิทธิ์ก่อนสร้างคอร์ส</p>}
      </div></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!value.branchIds.length} onChange={e => onChange({ ...value, branchIds: e.target.checked ? [] : branches.map(branch => branch.id) })} />ใช้ได้ทุกสาขา</label>
      {value.branchIds.length > 0 && <div className="space-y-2">{branches.map(branch => <label key={branch.id} className="flex gap-2 text-sm"><input type="checkbox" checked={value.branchIds.includes(branch.id)} onChange={e => { const ids = e.target.checked ? [...value.branchIds, branch.id] : value.branchIds.filter(id => id !== branch.id); if (ids.length) onChange({ ...value, branchIds: ids }) }} />{branch.name}</label>)}</div>}
    </>}
  </fieldset>
}
