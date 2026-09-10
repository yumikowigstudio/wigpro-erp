'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Check, ChevronLeft, ChevronRight, History, Loader2, Search, Undo2, X, Ban } from 'lucide-react'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'
import { cancelCourseRights, redeemCourse, reverseCourseUse } from '@/lib/courses'
import type { CourseEvent, CustomerCourse } from '@/lib/courseTypes'
import type { Employee, Service } from '@/types'

const inputClass = 'w-full min-w-0 border border-[var(--border-light)] rounded-lg bg-white p-2.5 text-sm'
const actionClass = 'inline-flex items-center justify-center gap-2 border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm disabled:opacity-40'
const labels = { purchase: 'ซื้อคอร์ส', activate: 'เปิดใช้สิทธิ์', use: 'ใช้สิทธิ์', reverse: 'คืนสิทธิ์', cancel: 'ยุติสิทธิ์' }
const date = (value: Date | null) => value ? value.toLocaleDateString('th-TH') : 'ไม่จำกัด'
const timestamp = (value: Date | null) => value instanceof Date ? value.getTime() : 0

export function CustomerCourses({ customerId }: { customerId?: string }) {
  const { companyId, branchId, userId, user, branches } = useAuth()
  const manager = ['super_admin', 'owner', 'branch_manager'].includes(user?.role || '')
  const [courses, setCourses] = useState<CustomerCourse[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [staff, setStaff] = useState<Employee[]>([])
  const [events, setEvents] = useState<CourseEvent[]>([])
  const [expanded, setExpanded] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<{ kind: 'use' | 'reverse' | 'cancel'; course: CustomerCourse; event?: CourseEvent; id: string } | null>(null)
  const [form, setForm] = useState({ serviceId: '', units: 1, staffId: '', note: '' })
  useEffect(() => {
    if (!companyId) return
    const fail = (error: Error) => { setError(error.message); setLoading(false) }
    const constraints = [where('companyId', '==', companyId), ...(customerId ? [where('customerId', '==', customerId)] : [])]
    const unsub = onSnapshot(query(collection(db, COLLECTIONS.CUSTOMER_COURSES), ...constraints), snap => {
      setCourses(snap.docs.map(item => ({ id: item.id, ...convertTimestamps(item.data()) }) as CustomerCourse).sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt))); setLoading(false)
    }, fail)
    const unsubService = onSnapshot(query(collection(db, COLLECTIONS.SERVICES), where('companyId', '==', companyId)), snap => setServices(snap.docs.map(item => ({ id: item.id, ...item.data() }) as Service)), fail)
    const unsubStaff = onSnapshot(query(collection(db, COLLECTIONS.EMPLOYEES), where('companyId', '==', companyId), where('status', '==', 'active')), snap => setStaff(snap.docs.map(item => ({ id: item.id, ...item.data() }) as Employee)), fail)
    return () => { unsub(); unsubService(); unsubStaff() }
  }, [companyId, customerId])
  useEffect(() => {
    if (!expanded || !companyId) return
    return onSnapshot(query(collection(db, COLLECTIONS.COURSE_EVENTS), where('companyId', '==', companyId), where('courseId', '==', expanded)), snap => setEvents(snap.docs.map(item => ({ id: item.id, ...convertTimestamps(item.data()) }) as CourseEvent).sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt))), error => setError(error.message))
  }, [expanded, companyId])
  const now = new Date()
  const isExpired = (course: CustomerCourse) => Boolean(course.expiresAt && course.expiresAt <= now)
  const isExpiring = (course: CustomerCourse) => course.status === 'active' && course.remainingUnits > 0 && course.expiresAt && course.expiresAt > now && course.expiresAt.getTime() - now.getTime() <= 30 * 86400000
  const filtered = courses.filter(course => `${course.name} ${course.customerName} ${course.receiptNo}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || (filter === 'expiring' ? isExpiring(course) : filter === 'expired' ? isExpired(course) : course.status === filter)))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 15) - 1))
  const open = (kind: 'use' | 'reverse' | 'cancel', course: CustomerCourse, event?: CourseEvent) => {
    setForm({ serviceId: course.template.serviceIds[0] || '', units: 1, staffId: '', note: '' }); setError(''); setSuccess('')
    setDialog({ kind, course, event, id: crypto.randomUUID() })
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!dialog || busy) return
    setBusy(true); setError('')
    const actor = { userId, userName: user?.displayName || user?.email || userId, branchId }
    try {
      if (dialog.kind === 'use') await redeemCourse({ id: dialog.id, course: dialog.course, ...form, actor })
      else if (dialog.kind === 'reverse' && dialog.event) await reverseCourseUse(dialog.course, dialog.event, actor, form.note)
      else await cancelCourseRights(dialog.course, actor, form.note)
      setExpanded(dialog.course.id); setSuccess('บันทึกรายการแล้ว'); setDialog(null)
    } catch (error) { setError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-[var(--border-light)] pb-4 text-sm">
      <span>คอร์สทั้งหมด <strong>{courses.length}</strong></span>
      <span>สิทธิ์พร้อมใช้ <strong>{courses.filter(course => course.status === 'active' && !isExpired(course)).reduce((sum, course) => sum + course.remainingUnits, 0)}</strong> ครั้ง</span>
      <span className="text-amber-700">หมดอายุใน 30 วัน <strong>{courses.filter(isExpiring).length}</strong> คอร์ส</span>
    </div>
    <div className="flex flex-wrap gap-3"><label className="relative flex-1 min-w-48"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input aria-label="ค้นหาคอร์ส" className={`${inputClass} pl-9`} placeholder="ชื่อคอร์ส ลูกค้า เลขบิล" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></label><select aria-label="สถานะคอร์ส" value={filter} className={`${inputClass} sm:!w-44`} onChange={e => { setFilter(e.target.value); setPage(0) }}><option value="all">สถานะทั้งหมด</option><option value="active">เปิดใช้แล้ว</option><option value="pending">รอยืนยันชำระ</option><option value="expiring">ใกล้หมดอายุ</option><option value="expired">หมดอายุ</option><option value="cancelled">ยกเลิก</option></select></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
    {loading ? <div className="py-8 flex justify-center"><Loader2 className="animate-spin w-5 h-5" /></div> : !filtered.length ? <p className="py-8 text-center text-sm text-gray-500">ยังไม่มีคอร์สในรายการนี้</p> : <div className="divide-y divide-[var(--border-light)]">
      {filtered.slice(currentPage * 15, currentPage * 15 + 15).map(course => <article key={course.id} className="py-4">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
          <div className="min-w-0 flex-1"><h3 className="font-semibold text-base break-words">{course.name}</h3>
            {!customerId && <Link className="text-sm text-[var(--pink-600)]" href={`/customers/${course.customerId}?tab=courses`}>{course.customerName || 'เปิดข้อมูลลูกค้า'}</Link>}
            <p className="text-xs text-gray-500 mt-1 break-words">{course.receiptNo} · สาขาที่ขาย {branches.find(branch => branch.id === course.branchId)?.name || course.branchId}</p>
            <p className="text-xs text-gray-500 mt-1">ซื้อ {course.template.paidUnits} + แถม {course.template.bonusUnits} ครั้ง · หมดอายุ {date(course.expiresAt)}</p>
          </div>
          <div className="sm:text-right shrink-0"><p className="text-sm">คงเหลือ <strong className="text-xl text-emerald-700">{course.remainingUnits}</strong> / {course.totalUnits} ครั้ง</p><p className="text-xs mt-1 text-gray-500">ใช้แล้ว {course.usedUnits} · {course.status === 'pending' ? 'รอยืนยันชำระ' : course.status === 'cancelled' ? 'ยกเลิก' : isExpired(course) ? 'หมดอายุ' : course.remainingUnits === 0 ? 'ใช้ครบแล้ว' : 'พร้อมใช้'}</p></div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button className={`${actionClass} bg-emerald-50 text-emerald-800`} disabled={course.status !== 'active' || isExpired(course) || course.remainingUnits < 1} onClick={() => open('use', course)}><Check className="w-4 h-4" />ใช้สิทธิ์</button>
          <button className={actionClass} onClick={() => { setEvents([]); setExpanded(expanded === course.id ? '' : course.id) }}><History className="w-4 h-4" />ประวัติ</button>
          <Link className={actionClass} href={`/documents?q=${encodeURIComponent(course.receiptNo)}`}>บิลต้นทาง</Link>
          {manager && course.status !== 'cancelled' && <button title="ยุติสิทธิ์คงเหลือ" aria-label={`ยุติสิทธิ์ ${course.name}`} className={`${actionClass} text-red-600`} onClick={() => open('cancel', course)}><Ban className="w-4 h-4" /></button>}
        </div>
        {expanded === course.id && <div className="mt-4 border-l-2 border-[var(--border-light)] pl-3 space-y-3">
          {events.filter(event => event.courseId === course.id).map(event => <div key={event.id} className="text-sm flex gap-3 justify-between"><div className="min-w-0"><p>{labels[event.kind]} · {event.units} ครั้ง · คงเหลือ {event.balance}</p><p className="text-xs text-gray-500">{date(event.createdAt)} · {event.userName} · {branches.find(branch => branch.id === event.branchId)?.name || event.branchId}</p>{event.serviceName && <p className="text-xs">{event.serviceName} · {event.staffName}</p>}{event.note && <p className="text-xs whitespace-pre-wrap break-words mt-1">{event.note}</p>}</div>{manager && course.status === 'active' && event.kind === 'use' && !events.some(other => other.reverseOf === event.id) && <button title="คืนสิทธิ์รายการนี้" aria-label="คืนสิทธิ์รายการนี้" className={`${actionClass} self-start`} onClick={() => open('reverse', course, event)}><Undo2 className="w-4 h-4" /></button>}</div>)}
        </div>}
      </article>)}
    </div>}
    {filtered.length > 15 && <div className="flex items-center justify-end gap-3 text-sm"><span>{currentPage + 1} / {Math.ceil(filtered.length / 15)}</span><button className={actionClass} title="หน้าก่อน" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="w-4 h-4" /></button><button className={actionClass} title="หน้าถัดไป" disabled={(currentPage + 1) * 15 >= filtered.length} onClick={() => setPage(currentPage + 1)}><ChevronRight className="w-4 h-4" /></button></div>}
    {dialog && <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"><form role="dialog" aria-modal="true" aria-label={dialog.kind === 'use' ? 'ใช้สิทธิ์คอร์ส' : 'ปรับสิทธิ์คอร์ส'} onSubmit={submit} className="w-full max-w-lg max-h-[90dvh] overflow-auto rounded-lg bg-white shadow-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{dialog.kind === 'use' ? 'ใช้สิทธิ์คอร์ส' : dialog.kind === 'reverse' ? 'คืนสิทธิ์' : 'ยุติสิทธิ์คงเหลือ'}</h2><button type="button" title="ปิด" disabled={busy} onClick={() => setDialog(null)}><X className="w-5 h-5" /></button></div>
      <p className="text-sm break-words">{dialog.course.name}</p>
      {dialog.kind === 'use' ? <>
        <label className="block text-sm">บริการ<select required className={inputClass} value={form.serviceId} onChange={e => setForm({ ...form, serviceId: e.target.value })}>{dialog.course.template.serviceIds.map(id => <option key={id} value={id}>{services.find(service => service.id === id)?.name || id}</option>)}</select></label>
        <label className="block text-sm">จำนวนครั้ง<input required className={inputClass} type="number" min={1} max={dialog.course.remainingUnits} value={form.units} onChange={e => setForm({ ...form, units: Number(e.target.value) })} /></label>
        <label className="block text-sm">พนักงานผู้ให้บริการ<select required className={inputClass} value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })}><option value="">เลือกพนักงาน</option>{staff.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</select></label>
        <p className="text-sm text-gray-600">สาขาที่ใช้สิทธิ์: {branches.find(branch => branch.id === branchId)?.name || branchId}</p>
      </> : dialog.kind === 'cancel' && <p className="text-sm text-amber-800 bg-amber-50 p-3 rounded-lg">ยุติสิทธิ์ที่เหลือ โดยไม่คืนเงินอัตโนมัติ หากยังไม่เคยใช้และต้องการยกเลิกยอดขาย ให้ยกเลิกที่บิลต้นทาง</p>}
      <label className="block text-sm">{dialog.kind === 'use' ? 'หมายเหตุ' : 'เหตุผล (จำเป็น)'}<textarea required={dialog.kind !== 'use'} className={inputClass} rows={3} maxLength={1000} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className={`${actionClass} bg-[var(--pink-500)] text-white w-full`} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}ยืนยันบันทึก</button>
    </form></div>}
  </div>
}
