'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Images,
  List,
  Loader2,
  Package,
  Plus,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps, generateWigOrderNo } from '@/lib/firestore'
import { createManualWorkOrder } from '@/lib/workOrderAlbums'
import { buildPickupGroups, dateKey, monthCalendarDays, type PickupGroup, type PickupState } from '@/lib/pickupCalendar'
import { printDepositReceipt } from '@/lib/depositReceipt'
import { formatCurrency, formatDate } from '@/lib/utils'
import { writeActivityLog } from '@/lib/activityLog'
import { useAuth } from '@/hooks/useAuth'
import { usePermissionAction } from '@/hooks/usePermissionAction'
import { CustomerSearchInput } from '@/components/CustomerSearchInput'
import { DateInputDMY } from '@/components/DateInputDMY'
import type { Deposit, WorkOrder } from '@/types'

type ViewMode = 'calendar' | 'list'
type PickupFilter = 'scheduled' | 'picked_up' | 'cancelled' | 'undated' | 'all'

const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'
const WIG_TYPE_OPTIONS = ['ฮาฟวิก', 'ฟูวิก', 'วิกกึ่งฟู', 'ฟูวิกญี่ปุ่น', 'อื่นๆ']
const THAI_WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

const stateConfig: Record<PickupState, { label: string; className: string }> = {
  scheduled: { label: 'รอนัดรับ', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  picked_up: { label: 'รับวิกแล้ว', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'ยกเลิก', className: 'bg-red-50 text-red-700 border-red-200' },
}

function startOfToday() {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  return value
}

function isWithinNextSevenDays(group: PickupGroup) {
  if (group.state !== 'scheduled' || !group.pickupDate) return false
  const today = startOfToday()
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)
  return group.pickupDate >= today && group.pickupDate <= nextWeek
}

function isOverdue(group: PickupGroup) {
  return group.state === 'scheduled' && !!group.pickupDate && group.pickupDate < startOfToday()
}

function groupMatches(group: PickupGroup, search: string) {
  const normalized = search.trim().toLocaleLowerCase('th')
  if (!normalized) return true
  return [
    group.customerName,
    group.customerPhone,
    group.sourceNo,
    ...group.orders.flatMap(order => [order.orderNo, order.manufacturer, order.bagNumber, order.sourceItemName]),
    ...group.items.map(item => item.name),
  ].some(value => value?.toLocaleLowerCase('th').includes(normalized))
}

function PickupStatus({ group }: { group: PickupGroup }) {
  const config = stateConfig[group.state]
  const overdue = isOverdue(group)
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${overdue ? 'border-red-200 bg-red-50 text-red-700' : config.className}`}>
      {overdue ? 'เลยวันนัด' : config.label}
    </span>
  )
}

function PickupListRow({ group, onOpen }: { group: PickupGroup; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full gap-3 border-b border-[var(--border-light)] px-4 py-4 text-left transition-colors last:border-0 hover:bg-[var(--pink-50)]/40 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-center"
    >
      <div>
        <p className="text-xs font-semibold text-[var(--text-muted)]">{group.pickupDate ? formatDate(group.pickupDate) : 'ยังไม่กำหนดวัน'}</p>
        <PickupStatus group={group} />
      </div>
      <div className="min-w-0">
        <p className="break-words text-sm font-bold text-[var(--text-primary)]">{group.customerName}</p>
        <p className="mt-0.5 break-words text-xs text-[var(--text-muted)]">
          {group.orders.length} ชิ้นงาน{group.sourceNo ? ` · ${group.sourceNo}` : ''}
        </p>
      </div>
      <div className="text-left sm:text-right">
        {group.remainingAmount > 0
          ? <p className="text-xs font-semibold text-red-600">คงเหลือ {formatCurrency(group.remainingAmount)}</p>
          : <p className="text-xs font-semibold text-emerald-700">ชำระครบแล้ว</p>}
        <p className="mt-1 text-[11px] text-[var(--pink-600)]">ดูรายละเอียด</p>
      </div>
    </button>
  )
}

export default function ProductionPage() {
  const { companyId, branchId, userId, userName, currentBranch } = useAuth()
  const { ensurePermission } = usePermissionAction()
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PickupFilter>('scheduled')
  const [view, setView] = useState<ViewMode>('calendar')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [pickupDateDraft, setPickupDateDraft] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [form, setForm] = useState({
    customerName: '', customerPhone: '', wigType: '', wigColor: '', wigLength: '',
    wigModel: '', manufacturer: '', bagNumber: '', totalAmount: '', depositAmount: '', expectedDate: '', notes: '',
  })

  useEffect(() => {
    setSearch(searchParams.get('q') ?? '')
    if (searchParams.get('q')) setFilter('all')
  }, [searchParams])

  useEffect(() => {
    if (!companyId || !branchId) return
    setLoading(true)
    const orderQuery = query(
      collection(db, COLLECTIONS.WORK_ORDERS),
      where('companyId', '==', companyId),
      where('branchId', '==', branchId),
    )
    const depositQuery = query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', companyId))
    let orderReady = false
    let depositReady = false
    const finishLoading = () => {
      if (orderReady && depositReady) setLoading(false)
    }
    const unsubscribeOrders = onSnapshot(orderQuery, snapshot => {
      setOrders(snapshot.docs.map(item => ({ id: item.id, ...convertTimestamps(item.data()) })) as WorkOrder[])
      orderReady = true
      finishLoading()
    }, () => { orderReady = true; finishLoading() })
    const unsubscribeDeposits = onSnapshot(depositQuery, snapshot => {
      setDeposits(snapshot.docs.map(item => ({ id: item.id, ...convertTimestamps(item.data()) })) as Deposit[])
      depositReady = true
      finishLoading()
    }, () => { depositReady = true; finishLoading() })
    return () => { unsubscribeOrders(); unsubscribeDeposits() }
  }, [branchId, companyId])

  const groups = useMemo(() => buildPickupGroups(orders, deposits), [deposits, orders])
  const selectedGroup = groups.find(group => group.id === selectedGroupId) ?? null

  useEffect(() => {
    if (selectedGroup) setPickupDateDraft(selectedGroup.pickupDateKey)
  }, [selectedGroup])

  useEffect(() => {
    const requested = searchParams.get('pickup')
    if (!requested || selectedGroupId || groups.length === 0) return
    const group = groups.find(item => item.id === requested)
    if (!group) return
    setSelectedGroupId(group.id)
    if (group.pickupDate) {
      setCalendarMonth(new Date(group.pickupDate.getFullYear(), group.pickupDate.getMonth(), 1))
      setSelectedDate(group.pickupDateKey)
    }
  }, [groups, searchParams, selectedGroupId])

  const filteredGroups = groups.filter(group => {
    if (!groupMatches(group, search)) return false
    if (filter === 'all') return true
    if (filter === 'undated') return group.state === 'scheduled' && !group.pickupDate
    return group.state === filter
  })
  const datedGroups = filteredGroups.filter(group => group.pickupDate)
  const undatedGroups = filteredGroups.filter(group => !group.pickupDate)
  const calendarDays = monthCalendarDays(calendarMonth)
  const selectedDayGroups = datedGroups.filter(group => group.pickupDateKey === selectedDate)
  const scheduledCount = groups.filter(group => group.state === 'scheduled').length
  const dueSoonCount = groups.filter(isWithinNextSevenDays).length
  const overdueCount = groups.filter(isOverdue).length
  const undatedCount = groups.filter(group => group.state === 'scheduled' && !group.pickupDate).length

  const changeMonth = (offset: number) => {
    setCalendarMonth(current => {
      const next = new Date(current.getFullYear(), current.getMonth() + offset, 1)
      setSelectedDate(dateKey(next))
      return next
    })
  }

  const savePickupDate = async (group: PickupGroup, nextDate: string) => {
    if (!companyId || !nextDate || saving) return
    setSaving(true)
    setMessage('')
    try {
      const date = new Date(`${nextDate}T12:00:00`)
      const batch = writeBatch(db)
      group.orders.forEach(order => batch.update(doc(db, COLLECTIONS.WORK_ORDERS, order.id), {
        expectedDate: date,
        updatedAt: serverTimestamp(),
      }))
      if (group.deposit) {
        batch.update(doc(db, COLLECTIONS.DEPOSITS, group.deposit.id), {
          pickupDate: nextDate,
          updatedAt: serverTimestamp(),
        })
      }
      await batch.commit()
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        userName,
        action: 'update',
        module: 'นัดรับวิก',
        description: `เปลี่ยนวันนัดรับ ${group.sourceNo || group.customerName} เป็น ${nextDate}`,
        recordId: group.depositId || group.orders[0].id,
        recordType: group.depositId ? 'deposit' : 'work_order',
        metadata: { pickupDate: nextDate, workOrderIds: group.orders.map(order => order.id) },
      })
      setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1))
      setSelectedDate(nextDate)
      setMessage('บันทึกวันนัดรับแล้ว ปฏิทินและแจ้งเตือนจะเปลี่ยนตามอัตโนมัติ')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกวันนัดรับไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const clearPickupDate = async (group: PickupGroup) => {
    if (!companyId || saving || !window.confirm('ยืนยันนำวันนัดรับออก รายการจะย้ายไปอยู่ในกลุ่มยังไม่กำหนดวันรับ')) return
    setSaving(true)
    setMessage('')
    try {
      const batch = writeBatch(db)
      group.orders.forEach(order => batch.update(doc(db, COLLECTIONS.WORK_ORDERS, order.id), {
        expectedDate: deleteField(),
        updatedAt: serverTimestamp(),
      }))
      if (group.deposit) {
        batch.update(doc(db, COLLECTIONS.DEPOSITS, group.deposit.id), {
          pickupDate: deleteField(),
          updatedAt: serverTimestamp(),
        })
      }
      await batch.commit()
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        userName,
        action: 'update',
        module: 'นัดรับวิก',
        description: `นำวันนัดรับออกจาก ${group.sourceNo || group.customerName}`,
        recordId: group.depositId || group.orders[0].id,
        recordType: group.depositId ? 'deposit' : 'work_order',
        metadata: { workOrderIds: group.orders.map(order => order.id) },
      })
      setPickupDateDraft('')
      setMessage('นำวันนัดรับออกแล้ว รายการอยู่ในกลุ่มยังไม่กำหนดวันรับ')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'นำวันนัดรับออกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const markPickedUp = async (group: PickupGroup) => {
    if (group.remainingAmount > 0) {
      setMessage(`ยังยืนยันรับวิกไม่ได้ เนื่องจากมียอดคงเหลือ ${formatCurrency(group.remainingAmount)}`)
      return
    }
    if (!await ensurePermission('page.production', 'ยืนยันรับวิก')) return
    if (!window.confirm(`ยืนยันว่าคุณ${group.customerName} รับวิกแล้ว?`)) return
    setSaving(true)
    setMessage('')
    try {
      const batch = writeBatch(db)
      group.orders.filter(order => order.status !== 'cancelled').forEach(order => batch.update(doc(db, COLLECTIONS.WORK_ORDERS, order.id), {
        status: 'delivered',
        deliveredDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }))
      if (group.deposit) {
        batch.update(doc(db, COLLECTIONS.DEPOSITS, group.deposit.id), {
          pickedUpAt: serverTimestamp(),
          pickedUpBy: userId,
          pickedUpByName: userName,
          updatedAt: serverTimestamp(),
        })
      }
      await batch.commit()
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        userName,
        action: 'complete',
        module: 'นัดรับวิก',
        description: `ยืนยันรับวิก ${group.sourceNo || group.customerName}`,
        recordId: group.depositId || group.orders[0].id,
        recordType: group.depositId ? 'deposit' : 'work_order',
        metadata: { customerId: group.customerId, workOrderIds: group.orders.map(order => order.id) },
      })
      setMessage(`ยืนยันว่าคุณ${group.customerName} รับวิกแล้ว`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ยืนยันรับวิกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const cancelWorkOrder = async (order: WorkOrder) => {
    if (order.status === 'cancelled') return
    const reason = window.prompt(`ระบุเหตุผลการยกเลิกชิ้นงาน ${order.orderNo}`)?.trim()
    if (!reason) return
    if (!await ensurePermission('action.sales.cancelBill', 'ยกเลิกชิ้นงานวิก')) return
    setSaving(true)
    setMessage('')
    try {
      await updateDoc(doc(db, COLLECTIONS.WORK_ORDERS, order.id), {
        status: 'cancelled',
        cancelReason: reason,
        cancelledBy: userId,
        cancelledByName: userName || null,
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await writeActivityLog({
        companyId,
        branchId: order.branchId || branchId,
        userId,
        userName,
        action: 'cancel',
        module: 'งานวิก',
        description: `ยกเลิกชิ้นงาน ${order.orderNo}`,
        recordId: order.id,
        recordType: 'work_order',
        metadata: { orderNo: order.orderNo, reason },
      })
      setMessage(`ยกเลิกชิ้นงาน ${order.orderNo} แล้ว โดยไม่ยกเลิกใบมัดจำหรือรายการอื่นในออเดอร์`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ยกเลิกชิ้นงานไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedCustomerId) { setMessage('กรุณาเลือกลูกค้าจากรายชื่อ เพื่อให้ชิ้นงานเชื่อมกับโปรไฟล์และอัลบั้ม'); return }
    const totalAmount = Number(form.totalAmount || 0)
    const depositAmount = Number(form.depositAmount || 0)
    if (totalAmount < 0 || depositAmount < 0 || depositAmount > totalAmount) { setMessage('กรุณาตรวจสอบยอดรวมและยอดที่รับไว้'); return }
    setSaving(true)
    setMessage('')
    try {
      const orderNo = await generateWigOrderNo(companyId, branchId)
      const data: Record<string, unknown> = {
        companyId,
        branchId,
        branchName: currentBranch?.name ?? '',
        branchCode: currentBranch?.code ?? '',
        orderNo,
        customerId: selectedCustomerId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        saleOrderId: '',
        sourceType: 'manual',
        totalAmount,
        depositAmount,
        remainingAmount: totalAmount - depositAmount,
        status: 'waiting',
        progressImages: [],
        completedImages: [],
        performedBy: userId,
        orderDate: new Date(),
        ...(form.expectedDate ? { expectedDate: new Date(`${form.expectedDate}T12:00:00`) } : {}),
        ...(form.wigType ? { wigType: form.wigType } : {}),
        ...(form.wigColor ? { wigColor: form.wigColor } : {}),
        ...(form.wigLength ? { wigLength: form.wigLength } : {}),
        ...(form.wigModel ? { wigModel: form.wigModel } : {}),
        ...(form.manufacturer ? { manufacturer: form.manufacturer } : {}),
        ...(form.bagNumber ? { bagNumber: form.bagNumber } : {}),
        ...(form.notes ? { notes: form.notes } : {}),
      }
      const workOrderId = await createManualWorkOrder(data)
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        userName,
        action: 'create',
        module: 'งานวิก',
        description: `เพิ่มชิ้นงาน ${orderNo}`,
        recordId: workOrderId,
        recordType: 'work_order',
        metadata: { orderNo, customerId: selectedCustomerId, pickupDate: form.expectedDate || null },
      })
      setShowCreateModal(false)
      setSelectedCustomerId('')
      setForm({ customerName: '', customerPhone: '', wigType: '', wigColor: '', wigLength: '', wigModel: '', manufacturer: '', bagNumber: '', totalAmount: '', depositAmount: '', expectedDate: '', notes: '' })
      setMessage('เพิ่มชิ้นงานและสร้างอัลบั้มให้ลูกค้าแล้ว')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เพิ่มชิ้นงานไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">นัดรับวิกและอัลบั้ม</h1>
          <p className="text-sm text-[var(--text-muted)]">ดูวันนัดรับ ยอดคงเหลือ และอัลบั้มแต่ละชิ้นงานจากหน้าเดียว</p>
        </div>
        <button type="button" onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 self-start rounded-xl bg-[var(--pink-600)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--pink-700)]">
          <Plus className="h-4 w-4" /> เพิ่มชิ้นงาน
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'รอนัดรับ', value: scheduledCount, icon: CalendarDays, tone: 'text-blue-700 bg-blue-50' },
          { label: 'ภายใน 7 วัน', value: dueSoonCount, icon: Package, tone: 'text-emerald-700 bg-emerald-50' },
          { label: 'เลยวันนัด', value: overdueCount, icon: AlertTriangle, tone: 'text-red-700 bg-red-50' },
          { label: 'ยังไม่กำหนดวัน', value: undatedCount, icon: CalendarX2, tone: 'text-amber-700 bg-amber-50' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3 rounded-xl border border-[var(--border-light)] bg-white p-4">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.tone}`}><item.icon className="h-4 w-4" /></div>
            <div><p className="text-xl font-bold text-[var(--text-primary)]">{item.value}</p><p className="text-xs text-[var(--text-muted)]">{item.label}</p></div>
          </div>
        ))}
      </div>

      {message && <div className="rounded-xl border border-[var(--pink-200)] bg-[var(--pink-50)] px-4 py-3 text-sm text-[var(--pink-700)]">{message}</div>}

      <div className="flex flex-col gap-3 border-y border-[var(--border-light)] bg-white px-4 py-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาชื่อลูกค้า เลขออเดอร์ หรือรายการ..." className={`${inputClass} pl-10`} />
        </div>
        <div className="grid min-w-0 grid-cols-3 gap-1 rounded-xl border border-[var(--border-light)] bg-[var(--bg-base)] p-1 sm:flex">
          {([
            ['scheduled', 'รอนัดรับ'], ['undated', 'ยังไม่มีวัน'], ['picked_up', 'รับแล้ว'], ['cancelled', 'ยกเลิก'], ['all', 'ทั้งหมด'],
          ] as Array<[PickupFilter, string]>).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`min-w-0 rounded-lg px-2 py-1.5 text-xs font-semibold sm:shrink-0 sm:px-3 ${filter === key ? 'bg-white text-[var(--pink-700)] shadow-sm' : 'text-[var(--text-secondary)]'}`}>{label}</button>
          ))}
        </div>
        <div className="flex rounded-xl border border-[var(--border-light)] bg-[var(--bg-base)] p-1">
          <button type="button" title="ปฏิทิน" onClick={() => setView('calendar')} className={`rounded-lg p-2 ${view === 'calendar' ? 'bg-white text-[var(--pink-700)] shadow-sm' : 'text-[var(--text-muted)]'}`}><CalendarDays className="h-4 w-4" /></button>
          <button type="button" title="รายการ" onClick={() => setView('list')} className={`rounded-lg p-2 ${view === 'list' ? 'bg-white text-[var(--pink-700)] shadow-sm' : 'text-[var(--text-muted)]'}`}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--pink-400)]" /></div>
      ) : view === 'calendar' ? (
        <div className="space-y-4">
          <section className="overflow-hidden border-y border-[var(--border-light)] bg-white sm:rounded-xl sm:border">
            <div className="flex items-center justify-between border-b border-[var(--border-light)] px-4 py-3">
              <button type="button" title="เดือนก่อน" onClick={() => changeMonth(-1)} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-base)]"><ChevronLeft className="h-4 w-4" /></button>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">{calendarMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</h2>
              <button type="button" title="เดือนถัดไป" onClick={() => changeMonth(1)} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-base)]"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 border-b border-[var(--border-light)] bg-[var(--bg-base)]">
              {THAI_WEEKDAYS.map(day => <div key={day} className="py-2 text-center text-[11px] font-semibold text-[var(--text-muted)]">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map(day => {
                const key = dateKey(day)
                const dayGroups = datedGroups.filter(group => group.pickupDateKey === key)
                const currentMonth = day.getMonth() === calendarMonth.getMonth()
                const today = key === dateKey(new Date())
                const active = key === selectedDate
                return (
                  <div key={key} className={`min-h-14 border-b border-r border-[var(--border-light)] p-1 sm:min-h-28 sm:p-1.5 ${currentMonth ? 'bg-white' : 'bg-[var(--bg-base)]/60'} ${active ? 'ring-2 ring-inset ring-[var(--pink-300)]' : ''}`}>
                    <button type="button" onClick={() => setSelectedDate(key)} className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${today ? 'bg-[var(--pink-600)] text-white' : currentMonth ? 'text-[var(--text-primary)]' : 'text-[var(--text-light)]'}`}>{day.getDate()}</button>
                    <div className="mt-1 hidden space-y-1 sm:block">
                      {dayGroups.slice(0, 3).map(group => (
                        <button key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)} className={`w-full rounded-md border px-1.5 py-1 text-left text-[10px] leading-snug ${isOverdue(group) ? 'border-red-200 bg-red-50 text-red-700' : stateConfig[group.state].className}`}>
                          <span className="block break-words font-semibold">{group.customerName}</span>
                          {group.orders.length > 1 && <span className="block opacity-80">{group.orders.length} ชิ้นงาน</span>}
                        </button>
                      ))}
                      {dayGroups.length > 3 && <button type="button" onClick={() => setSelectedDate(key)} className="px-1 text-[10px] font-semibold text-[var(--pink-600)]">อีก {dayGroups.length - 3} รายการ</button>}
                    </div>
                    {dayGroups.length > 0 && <button type="button" onClick={() => setSelectedDate(key)} className="mt-1 flex w-full items-center justify-center sm:hidden"><span className="rounded-full bg-[var(--pink-100)] px-1.5 text-[10px] font-bold text-[var(--pink-700)]">{dayGroups.length}</span></button>}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--border-light)] bg-white">
            <div className="border-b border-[var(--border-light)] px-4 py-3">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">นัดรับวันที่ {formatDate(new Date(`${selectedDate}T12:00:00`))}</h2>
              <p className="text-xs text-[var(--text-muted)]">{selectedDayGroups.length} นัด</p>
            </div>
            {selectedDayGroups.length > 0
              ? selectedDayGroups.map(group => <PickupListRow key={group.id} group={group} onOpen={() => setSelectedGroupId(group.id)} />)
              : <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">ไม่มีนัดรับในวันนี้</p>}
          </section>

          {undatedGroups.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-amber-200 bg-white">
              <div className="border-b border-amber-100 bg-amber-50 px-4 py-3"><h2 className="text-sm font-bold text-amber-800">ยังไม่กำหนดวันรับ ({undatedGroups.length})</h2></div>
              {undatedGroups.map(group => <PickupListRow key={group.id} group={group} onOpen={() => setSelectedGroupId(group.id)} />)}
            </section>
          )}
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-[var(--border-light)] bg-white">
          {filteredGroups.length > 0
            ? filteredGroups.map(group => <PickupListRow key={group.id} group={group} onOpen={() => setSelectedGroupId(group.id)} />)
            : <p className="px-4 py-16 text-center text-sm text-[var(--text-muted)]">ไม่พบงานวิกตามตัวกรอง</p>}
        </section>
      )}

      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedGroupId('') }}>
          <div role="dialog" aria-modal="true" aria-label={`นัดรับวิก ${selectedGroup.customerName}`} className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border-light)] bg-white px-5 py-4">
              <div className="min-w-0 pr-3">
                <div className="mb-1 flex flex-wrap items-center gap-2"><PickupStatus group={selectedGroup} />{selectedGroup.sourceNo && <span className="text-xs text-[var(--text-muted)]">{selectedGroup.sourceNo}</span>}</div>
                <h2 className="break-words text-xl font-bold text-[var(--text-primary)]">{selectedGroup.customerName}</h2>
                {selectedGroup.customerPhone && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{selectedGroup.customerPhone}</p>}
              </div>
              <button type="button" title="ปิด" onClick={() => setSelectedGroupId('')} className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-base)]"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-5 p-5">
              <section className="space-y-3 border-b border-[var(--border-light)] pb-5">
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--pink-600)]" /><h3 className="text-sm font-bold">วันนัดรับ</h3></div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <DateInputDMY value={pickupDateDraft} onChange={setPickupDateDraft} ariaLabel="แก้ไขวันนัดรับ" className={inputClass} />
                  <button type="button" disabled={!pickupDateDraft || pickupDateDraft === selectedGroup.pickupDateKey || saving} onClick={() => savePickupDate(selectedGroup, pickupDateDraft)} className="shrink-0 rounded-xl bg-[var(--pink-600)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">บันทึกวันรับ</button>
                </div>
                {selectedGroup.pickupDate && <button type="button" disabled={saving} onClick={() => clearPickupDate(selectedGroup)} className="text-xs font-semibold text-red-600 hover:underline">นำวันนัดรับออก</button>}
              </section>

              <section className="grid grid-cols-3 gap-3 border-b border-[var(--border-light)] pb-5 text-center">
                <div><p className="text-[11px] text-[var(--text-muted)]">ยอดรวม</p><p className="mt-1 text-sm font-bold">{formatCurrency(selectedGroup.totalAmount)}</p></div>
                <div><p className="text-[11px] text-[var(--text-muted)]">ชำระแล้ว</p><p className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(selectedGroup.paidAmount)}</p></div>
                <div><p className="text-[11px] text-[var(--text-muted)]">คงเหลือ</p><p className={`mt-1 text-sm font-bold ${selectedGroup.remainingAmount > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatCurrency(selectedGroup.remainingAmount)}</p></div>
              </section>

              <section className="space-y-2 border-b border-[var(--border-light)] pb-5">
                <h3 className="text-sm font-bold">รายการในออเดอร์</h3>
                <div className="divide-y divide-[var(--border-light)]">
                  {selectedGroup.items.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="py-2.5">
                      <div className="flex items-start justify-between gap-3 text-sm"><span className="break-words">{item.name} × {item.quantity}</span><span className="shrink-0 font-semibold">{formatCurrency(item.total)}</span></div>
                      {item.note && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[var(--text-muted)]">หมายเหตุ: {item.note}</p>}
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2"><Images className="h-4 w-4 text-[var(--pink-600)]" /><h3 className="text-sm font-bold">ชิ้นงานและอัลบั้ม ({selectedGroup.orders.length})</h3></div>
                <div className="divide-y divide-[var(--border-light)] rounded-xl border border-[var(--border-light)]">
                  {selectedGroup.orders.map((order, index) => (
                    <div key={order.id} className="p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">ชิ้นที่ {index + 1}: {order.sourceItemName || order.wigType || 'งานวิก'}</p>
                          <p className="mt-1 break-words text-xs text-[var(--text-muted)]">{order.orderNo}{[order.wigColor, order.wigLength, order.bagNumber].filter(Boolean).length ? ` · ${[order.wigColor, order.wigLength, order.bagNumber].filter(Boolean).join(' · ')}` : ''}</p>
                          {order.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">{order.notes}</p>}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {order.customerId && <Link href={`/customers/${order.customerId}?tab=photos${order.workCaseId ? `&caseId=${order.workCaseId}` : ''}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pink-200)] bg-[var(--pink-50)] px-3 py-2 text-xs font-semibold text-[var(--pink-700)]"><Images className="h-3.5 w-3.5" /> เปิดอัลบั้ม</Link>}
                          {order.status !== 'cancelled' && order.status !== 'delivered' && <button type="button" disabled={saving} onClick={() => cancelWorkOrder(order)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"><Ban className="h-3.5 w-3.5" /> ยกเลิกชิ้นงาน</button>}
                        </div>
                      </div>
                      {order.status === 'cancelled' && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">ยกเลิกแล้ว: {order.cancelReason || 'ไม่ระบุเหตุผล'}</p>}
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-2 border-t border-[var(--border-light)] pt-5 sm:grid-cols-2">
                {selectedGroup.customerId && <Link href={`/customers/${selectedGroup.customerId}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-light)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]"><UserRound className="h-4 w-4" /> โปรไฟล์ลูกค้า</Link>}
                {selectedGroup.deposit && selectedGroup.remainingAmount > 0 && <Link href={`/deposits?pay=${selectedGroup.deposit.id}&q=${encodeURIComponent(selectedGroup.deposit.depositNo)}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"><CircleDollarSign className="h-4 w-4" /> รับยอดคงเหลือ</Link>}
                {selectedGroup.deposit && <button type="button" onClick={() => { try { printDepositReceipt(selectedGroup.deposit!, { kind: selectedGroup.remainingAmount <= 0 ? 'final' : 'deposit' }) } catch (error) { setMessage(error instanceof Error ? error.message : 'เปิดใบเสร็จไม่สำเร็จ') } }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-light)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]"><FileText className="h-4 w-4" /> พิมพ์ใบเสร็จ</button>}
                {selectedGroup.state === 'scheduled' && <button type="button" disabled={saving || selectedGroup.remainingAmount > 0} onClick={() => markPickedUp(selectedGroup)} title={selectedGroup.remainingAmount > 0 ? 'กรุณารับยอดคงเหลือก่อน' : 'ยืนยันว่าลูกค้ารับวิกแล้ว'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--pink-600)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> ยืนยันรับวิก</button>}
              </section>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div role="dialog" aria-modal="true" aria-label="เพิ่มชิ้นงานวิก" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-light)] bg-white px-5 py-4"><h2 className="font-bold">เพิ่มชิ้นงานวิก</h2><button type="button" title="ปิด" onClick={() => setShowCreateModal(false)} className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-base)]"><X className="h-4 w-4" /></button></div>
            <form onSubmit={handleCreate} className="space-y-4 p-5">
              <div><label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">ลูกค้า *</label><CustomerSearchInput companyId={companyId} selectedId={selectedCustomerId} selectedName={form.customerName} onSelect={(id, name, customer) => { setSelectedCustomerId(id); setForm(current => ({ ...current, customerName: name, customerPhone: customer?.phone ?? '' })) }} onClear={() => { setSelectedCustomerId(''); setForm(current => ({ ...current, customerName: '', customerPhone: '' })) }} placeholder="ค้นหาและเลือกลูกค้า..." /><p className="mt-1 text-[11px] text-[var(--text-muted)]">ระบบจะสร้างอัลบั้มชิ้นงานในโปรไฟล์ลูกค้าให้อัตโนมัติ</p></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className="mb-1.5 block text-xs font-medium">ประเภทวิก</label><select value={form.wigType} onChange={event => setForm(current => ({ ...current, wigType: event.target.value }))} className={inputClass}><option value="">เลือกประเภท</option>{WIG_TYPE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></div>
                <div><label className="mb-1.5 block text-xs font-medium">สี</label><input value={form.wigColor} onChange={event => setForm(current => ({ ...current, wigColor: event.target.value }))} className={inputClass} /></div>
                <div><label className="mb-1.5 block text-xs font-medium">ความยาว</label><input value={form.wigLength} onChange={event => setForm(current => ({ ...current, wigLength: event.target.value }))} className={inputClass} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className="mb-1.5 block text-xs font-medium">รุ่น</label><input value={form.wigModel} onChange={event => setForm(current => ({ ...current, wigModel: event.target.value }))} className={inputClass} /></div>
                <div><label className="mb-1.5 block text-xs font-medium">ผู้ผลิต</label><input value={form.manufacturer} onChange={event => setForm(current => ({ ...current, manufacturer: event.target.value }))} className={inputClass} /></div>
                <div><label className="mb-1.5 block text-xs font-medium">เลขถุง</label><input value={form.bagNumber} onChange={event => setForm(current => ({ ...current, bagNumber: event.target.value }))} className={inputClass} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className="mb-1.5 block text-xs font-medium">ยอดรวม</label><input type="number" min="0" step="0.01" value={form.totalAmount} onChange={event => setForm(current => ({ ...current, totalAmount: event.target.value }))} className={inputClass} /></div>
                <div><label className="mb-1.5 block text-xs font-medium">รับไว้แล้ว</label><input type="number" min="0" step="0.01" value={form.depositAmount} onChange={event => setForm(current => ({ ...current, depositAmount: event.target.value }))} className={inputClass} /></div>
                <div><label className="mb-1.5 block text-xs font-medium">วันนัดรับ</label><DateInputDMY value={form.expectedDate} onChange={expectedDate => setForm(current => ({ ...current, expectedDate }))} ariaLabel="วันนัดรับ" className={inputClass} /></div>
              </div>
              <div><label className="mb-1.5 block text-xs font-medium">หมายเหตุชิ้นงาน</label><textarea rows={3} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} className={`${inputClass} resize-y`} /></div>
              <div className="flex gap-3 pt-1"><button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 rounded-xl border border-[var(--border-light)] py-2.5 text-sm font-semibold">ยกเลิก</button><button type="submit" disabled={saving || !selectedCustomerId} className="flex-1 rounded-xl bg-[var(--pink-600)] py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'กำลังบันทึก...' : 'เพิ่มชิ้นงาน'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
