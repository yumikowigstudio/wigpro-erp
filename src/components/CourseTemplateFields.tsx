'use client'
import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { CourseTemplate } from '@/lib/courseTypes'
import type { Service, Branch } from '@/types'

const field = 'w-full min-w-0 rounded-lg border border-[var(--border-light)] bg-white px-3 py-2 text-sm'
export function CourseTemplateFields({ value, onChange, services, branches }: {
  value: CourseTemplate | null; onChange: (value: CourseTemplate | null) => void; services: Service[]; branches: Branch[]
}) {
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceCategory, setServiceCategory] = useState('all')
  const eligibleServices = useMemo(() => services.filter(service =>
    !service.course && (service.status === 'active' || Boolean(value?.serviceIds.includes(service.id)))
  ), [services, value?.serviceIds])
  const categories = useMemo(() => Array.from(new Set(eligibleServices.map(service => service.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th')), [eligibleServices])
  const filteredServices = useMemo(() => {
    const search = serviceSearch.trim().toLowerCase()
    return eligibleServices.filter(service =>
      (serviceCategory === 'all' || service.category === serviceCategory)
      && (!search || `${service.name} ${service.code || ''} ${service.category || ''}`.toLowerCase().includes(search))
    )
  }, [eligibleServices, serviceCategory, serviceSearch])
  const selectedServices = eligibleServices.filter(service => value?.serviceIds.includes(service.id))
  const selectFiltered = () => {
    if (!value) return
    const ids = filteredServices.filter(service => service.status === 'active').map(service => service.id)
    onChange({ ...value, serviceIds: Array.from(new Set([...value.serviceIds, ...ids])) })
  }

  return <fieldset className="border-t border-[var(--border-light)] pt-4 space-y-3">
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked ? { paidUnits: 10, bonusUnits: 2, validityDays: null, serviceIds: [], branchIds: [] } : null)} />ขายเป็นคอร์ส / แพ็กเกจ</label>
    {value && <>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs space-y-1 block">จำนวนครั้งที่ซื้อ<input aria-label="จำนวนครั้งที่ซื้อ" className={field} type="number" min={1} max={10000} value={value.paidUnits} onChange={e => onChange({ ...value, paidUnits: Number(e.target.value) })} /></label>
        <label className="text-xs space-y-1 block">จำนวนครั้งแถม<input aria-label="จำนวนครั้งแถม" className={field} type="number" min={0} max={10000} value={value.bonusUnits} onChange={e => onChange({ ...value, bonusUnits: Number(e.target.value) })} /></label>
      </div>
      <label className="block text-xs space-y-1">อายุคอร์ส (วันนับจากยืนยันชำระเงิน)<input aria-label="อายุคอร์ส" className={field} type="number" min={1} max={3650} placeholder="ไม่จำกัดอายุ" value={value.validityDays ?? ''} onChange={e => onChange({ ...value, validityDays: e.target.value ? Number(e.target.value) : null })} /></label>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold">บริการที่ใช้สิทธิ์ได้</p>
          <span className="text-[11px] font-semibold text-[var(--pink-600)]">เลือกแล้ว {value.serviceIds.length} รายการ</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <label className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input aria-label="ค้นหาบริการที่ใช้สิทธิ์ได้" value={serviceSearch} onChange={event => setServiceSearch(event.target.value)} placeholder="ค้นหาชื่อ รหัส หรือหมวดบริการ" className={`${field} pl-9`} />
            {serviceSearch && <button type="button" aria-label="ล้างคำค้นหา" onClick={() => setServiceSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)]"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <select aria-label="กรองหมวดบริการที่ใช้สิทธิ์ได้" value={serviceCategory} onChange={event => setServiceCategory(event.target.value)} className={field}>
            <option value="all">ทุกหมวดบริการ</option>
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        {selectedServices.length > 0 && <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[var(--pink-50)] px-2.5 py-2">
          {selectedServices.slice(0, 4).map(service => <span key={service.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--pink-100)] bg-white px-2 py-1 text-[11px] text-[var(--text-secondary)]"><span className="truncate">{service.name}</span><button type="button" aria-label={`นำ ${service.name} ออกจากคอร์ส`} onClick={() => onChange({ ...value, serviceIds: value.serviceIds.filter(id => id !== service.id) })}><X className="h-3 w-3" /></button></span>)}
          {selectedServices.length > 4 && <span className="text-[11px] text-[var(--text-muted)]">และอีก {selectedServices.length - 4} รายการ</span>}
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--text-muted)]">พบ {filteredServices.length} รายการ</span>
          <div className="flex gap-3">
            <button type="button" onClick={selectFiltered} disabled={!filteredServices.some(service => service.status === 'active')} className="font-semibold text-[var(--pink-600)] disabled:opacity-40">เลือกทั้งหมดจากผลค้นหา</button>
            {value.serviceIds.length > 0 && <button type="button" onClick={() => onChange({ ...value, serviceIds: [] })} className="font-semibold text-red-500">ล้างที่เลือก</button>}
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--border-light)] bg-white divide-y divide-[var(--border-light)]">
          {filteredServices.map(service => <label key={service.id} className={`flex cursor-pointer items-start gap-2 px-3 py-2.5 text-sm hover:bg-[var(--pink-50)] ${service.status !== 'active' ? 'opacity-60' : ''}`}><input type="checkbox" disabled={service.status !== 'active' && !value.serviceIds.includes(service.id)} checked={value.serviceIds.includes(service.id)} onChange={event => onChange({ ...value, serviceIds: event.target.checked ? [...value.serviceIds, service.id] : value.serviceIds.filter(id => id !== service.id) })} /><span className="min-w-0"><span className="block break-words">{service.name}</span><span className="block text-[10px] text-[var(--text-muted)]">{[service.code, service.category, service.status !== 'active' ? 'ปิดใช้งาน' : ''].filter(Boolean).join(' · ')}</span></span></label>)}
          {!filteredServices.length && <p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">ไม่พบบริการที่ค้นหา</p>}
          {!eligibleServices.length && <p className="px-3 py-6 text-center text-sm text-amber-700">เพิ่มบริการที่จะใช้สิทธิ์ก่อนสร้างคอร์ส</p>}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!value.branchIds.length} onChange={e => onChange({ ...value, branchIds: e.target.checked ? [] : branches.map(branch => branch.id) })} />ใช้ได้ทุกสาขา</label>
      {value.branchIds.length > 0 && <div className="space-y-2">{branches.map(branch => <label key={branch.id} className="flex gap-2 text-sm"><input type="checkbox" checked={value.branchIds.includes(branch.id)} onChange={e => { const ids = e.target.checked ? [...value.branchIds, branch.id] : value.branchIds.filter(id => id !== branch.id); if (ids.length) onChange({ ...value, branchIds: ids }) }} />{branch.name}</label>)}</div>}
    </>}
  </fieldset>
}
