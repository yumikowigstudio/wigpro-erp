'use client'
import { useState, useEffect } from 'react'
import { formatDate } from '@/lib/utils'
import {
  Plus, ChevronLeft, ChevronRight, Calendar, Clock, User,
  Scissors, Phone, Check, X, Loader2, MessageCircle, Copy, CheckCheck,
} from 'lucide-react'
import {
  collection, onSnapshot, query, where, orderBy,
  doc, updateDoc, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, addDocument, convertTimestamps } from '@/lib/firestore'
import { Appointment } from '@/types'

type AptStatus = 'pending' | 'confirmed' | 'arrived' | 'completed' | 'cancelled'

const statusConfig: Record<AptStatus, { label: string; color: string; dot: string }> = {
  pending:   { label: 'รอยืนยัน',   color: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-400'   },
  confirmed: { label: 'ยืนยันแล้ว', color: 'bg-blue-100 text-blue-800',       dot: 'bg-blue-400'    },
  arrived:   { label: 'มาถึงแล้ว',  color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-400' },
  completed: { label: 'เสร็จสิ้น',  color: 'bg-purple-100 text-purple-700',   dot: 'bg-purple-400'  },
  cancelled: { label: 'ยกเลิก',     color: 'bg-red-100 text-red-700',         dot: 'bg-red-400'     },
}

const serviceOptions = [
  { name: 'ตัดผม',         duration: 30 },
  { name: 'ทำสี',          duration: 90 },
  { name: 'ปรับแต่งวิก',  duration: 45 },
  { name: 'ซ่อมวิก',       duration: 60 },
  { name: 'ปรึกษาสั่งวิก', duration: 30 },
]

/* ─── LINE message templates ─── */
function lineMessage(apt: Appointment, status: AptStatus): string | null {
  const date = apt.date instanceof Date ? apt.date : new Date(apt.date)
  const dateStr = date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const svc  = apt.services?.map(s => s.serviceName).join(', ') ?? ''

  switch (status) {
    case 'confirmed':
      return `✅ ยืนยันนัดหมายแล้วค่ะ\n\nคุณ${apt.customerName}\n📅 วันที่: ${dateStr}\n⏰ เวลา: ${apt.startTime} น.\n✂️ บริการ: ${svc}\n\nหากต้องการเปลี่ยนแปลงกรุณาติดต่อทางร้านล่วงหน้านะคะ 🙏`
    case 'arrived':
      return `👋 ยินดีต้อนรับค่ะ คุณ${apt.customerName}\nกรุณารอสักครู่ เจ้าหน้าที่กำลังจะดูแลคุณในไม่ช้าค่ะ ✨`
    case 'completed':
      return `🙏 ขอบคุณที่ใช้บริการนะคะ คุณ${apt.customerName}\nหวังว่าจะได้พบกันอีกนะคะ ⭐\n\nหากมีข้อสงสัยติดต่อได้เสมอเลยค่ะ`
    default:
      return null
  }
}

/* ─── LINE Message Modal ─── */
function LineModal({ apt, status, onClose }: { apt: Appointment; status: AptStatus; onClose: () => void }) {
  const msg = lineMessage(apt, status)
  const [copied, setCopied] = useState(false)

  if (!msg) return null

  const copy = () => {
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const openLine = () => {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--text-secondary)]/20 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-[var(--shadow-lg)] w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-light)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#06C755]/10 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-[#06C755]" />
            </div>
            <p className="font-bold text-[var(--text-primary)]">ข้อความ LINE</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-base)]">
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Chat bubble preview */}
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--pink-100)] flex items-center justify-center shrink-0 text-sm font-bold text-[var(--pink-500)]">ร</div>
            <div className="bg-[var(--bg-base)] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-line flex-1">
              {msg}
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] text-center">ข้อความตัวอย่าง · แก้ไขได้ก่อนส่ง</p>
          <div className="flex gap-2">
            <button onClick={copy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all">
              {copied ? <CheckCheck className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
            </button>
            <button onClick={openLine}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#06C755] text-white rounded-xl text-sm font-bold hover:bg-[#05b34a] transition-all">
              <MessageCircle className="w-4 h-4" />
              เปิด LINE
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] text-center">* เปิด LINE แล้วส่งถึงลูกค้าโดยตรง<br/>เชื่อมต่อ LINE OA เพื่อส่งอัตโนมัติในอนาคต</p>
        </div>
      </div>
    </div>
  )
}

function getWeekDays(base: Date) {
  const days = []
  const start = new Date(base)
  start.setDate(start.getDate() - start.getDay() + 1)
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

interface NewAptForm {
  customerName: string; customerPhone: string; service: string
  stylist: string; date: string; startTime: string; notes: string
}

export default function AppointmentsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [view, setView]                 = useState<'day' | 'week'>('day')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [saving, setSaving]             = useState(false)
  const [lineModal, setLineModal]       = useState<{ apt: Appointment; status: AptStatus } | null>(null)
  const [form, setForm] = useState<NewAptForm>({
    customerName: '', customerPhone: '', service: 'ตัดผม',
    stylist: '', date: new Date().toISOString().split('T')[0],
    startTime: '10:00', notes: '',
  })

  const weekDays = getWeekDays(selectedDate)
  const thaiDays = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.APPOINTMENTS),
      where('status', 'in', ['pending', 'confirmed', 'arrived', 'completed']),
      orderBy('date', 'asc'),
      orderBy('startTime', 'asc'),
    )
    return onSnapshot(q, snap => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Appointment[])
      setLoading(false)
    }, () => setLoading(false))
  }, [])

  const todayApts = appointments.filter(a => {
    const d = a.date instanceof Date ? a.date : new Date(a.date)
    return d.toDateString() === selectedDate.toDateString()
  })

  const weekApts = (day: Date) => appointments.filter(a => {
    const d = a.date instanceof Date ? a.date : new Date(a.date)
    return d.toDateString() === day.toDateString()
  })

  /* Update status + write LINE notification record */
  const updateStatus = async (apt: Appointment, status: AptStatus) => {
    await updateDoc(doc(db, COLLECTIONS.APPOINTMENTS, apt.id), {
      status, updatedAt: serverTimestamp(),
    })

    // บันทึก notification ลง Firestore
    const msg = lineMessage(apt, status)
    if (msg) {
      await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
        companyId:    'demo_company',
        branchId:     'demo_branch',
        userId:       'demo_user',
        type:         'line_notification',
        title:        `LINE → ${apt.customerName}`,
        message:      msg,
        appointmentId: apt.id,
        status:       'pending_send',
        channel:      'line',
        isRead:       false,
        createdAt:    serverTimestamp(),
      })

      // เปิด modal แสดงข้อความ
      setLineModal({ apt: { ...apt, status }, status })
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customerName || !form.customerPhone) return
    setSaving(true)
    try {
      const svc = serviceOptions.find(s => s.name === form.service) ?? { name: form.service, duration: 60 }
      const [h, m] = form.startTime.split(':').map(Number)
      const endDate = new Date(0, 0, 0, h, m + svc.duration)
      const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
      await addDocument<Appointment>(COLLECTIONS.APPOINTMENTS, {
        companyId: 'demo_company', branchId: 'demo_branch',
        customerId: '',
        customerName: form.customerName, customerPhone: form.customerPhone,
        services: [{ serviceId: '', serviceName: svc.name, price: 0, duration: svc.duration }],
        date: new Date(form.date), startTime: form.startTime, endTime,
        duration: svc.duration, status: 'pending',
        notes: form.notes || undefined, lineNotified: false, createdBy: 'demo_user',
        createdAt: new Date(), updatedAt: new Date(),
      })
      setShowModal(false)
      setForm({ customerName: '', customerPhone: '', service: 'ตัดผม', stylist: '', date: new Date().toISOString().split('T')[0], startTime: '10:00', notes: '' })
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const inputClass = 'w-full px-3.5 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

  /* ─── Appointment Card ─── */
  const AptCard = ({ apt }: { apt: Appointment }) => {
    const cfg     = statusConfig[apt.status as AptStatus]
    const svcName = apt.services?.map(s => s.serviceName).join(', ') ?? ''
    const hasLine = ['confirmed', 'arrived', 'completed'].includes(apt.status)

    return (
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 hover:border-[var(--pink-200)] transition-all">
        <div className="flex items-start gap-4">
          <div className="text-center shrink-0 w-14">
            <p className="font-bold text-[var(--pink-500)] text-base">{apt.startTime}</p>
            <p className="text-xs text-[var(--text-muted)]">{apt.endTime}</p>
          </div>
          <div className="w-px self-stretch bg-[var(--border-light)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="font-semibold text-[var(--text-primary)] text-sm">{apt.customerName}</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{apt.customerPhone}</span>
              <span className="flex items-center gap-1"><Scissors className="w-3 h-3" />{svcName}</span>
            </div>
            {apt.notes && <p className="text-xs text-[var(--text-muted)] mt-1 italic">{apt.notes}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
            {/* LINE button */}
            {hasLine && (
              <button onClick={() => setLineModal({ apt, status: apt.status as AptStatus })}
                className="p-2 rounded-lg bg-[#06C755]/10 text-[#06C755] hover:bg-[#06C755]/20 transition-all" title="ดูข้อความ LINE">
                <MessageCircle className="w-3.5 h-3.5" />
              </button>
            )}
            {apt.status === 'pending' && (
              <button onClick={() => updateStatus(apt, 'confirmed')}
                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all" title="ยืนยัน">
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            {apt.status === 'confirmed' && (
              <button onClick={() => updateStatus(apt, 'arrived')}
                className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all" title="มาถึงแล้ว">
                <User className="w-3.5 h-3.5" />
              </button>
            )}
            {apt.status === 'arrived' && (
              <button onClick={() => updateStatus(apt, 'completed')}
                className="p-2 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-all" title="เสร็จสิ้น">
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => updateStatus(apt, 'cancelled')}
              className="p-2 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-all" title="ยกเลิก">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">นัดหมาย</h1>
          <p className="text-sm text-[var(--text-muted)]">{formatDate(selectedDate)}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 p-1 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)]">
            {(['day', 'week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === v ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}>
                {v === 'day' ? 'รายวัน' : 'รายสัปดาห์'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200 hover:opacity-95 transition-all">
            <Plus className="w-4 h-4" /> นัดหมายใหม่
          </button>
        </div>
      </div>

      {/* ─── DAY VIEW ─── */}
      {view === 'day' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Calendar widget */}
          <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { const d = new Date(selectedDate); d.setMonth(d.getMonth() - 1); setSelectedDate(d) }}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] transition-all">
                <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                {selectedDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
              </h3>
              <button onClick={() => { const d = new Date(selectedDate); d.setMonth(d.getMonth() + 1); setSelectedDate(d) }}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] transition-all">
                <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
            </div>
            <div className="grid grid-cols-7 mb-2">
              {thaiDays.map(d => <div key={d} className="text-center text-[10px] font-semibold text-[var(--text-muted)] py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: 35 }).map((_, i) => {
                const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i - new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay() + 2)
                const isToday    = d.toDateString() === new Date().toDateString()
                const isSelected = d.toDateString() === selectedDate.toDateString()
                const isCurMth   = d.getMonth() === selectedDate.getMonth()
                const hasApt     = appointments.some(a => { const ad = a.date instanceof Date ? a.date : new Date(a.date); return ad.toDateString() === d.toDateString() })
                return (
                  <button key={i} onClick={() => setSelectedDate(d)}
                    className={`relative h-8 rounded-lg text-xs font-medium transition-all ${
                      isSelected ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm' :
                      isToday    ? 'bg-[var(--pink-50)] text-[var(--pink-600)] font-bold' :
                      isCurMth   ? 'hover:bg-[var(--pink-50)] text-[var(--text-primary)]' : 'text-[var(--text-light)]'
                    }`}>
                    {d.getDate()}
                    {hasApt && !isSelected && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[var(--pink-400)] rounded-full" />}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--border-light)] space-y-2">
              {(['pending', 'confirmed', 'arrived'] as AptStatus[]).map(s => {
                const count = todayApts.filter(a => a.status === s).length
                const cfg = statusConfig[s]
                return (
                  <div key={s} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className="text-[var(--text-muted)]">{cfg.label}</span>
                    </div>
                    <span className="font-semibold text-[var(--text-primary)]">{count}</span>
                  </div>
                )
              })}
            </div>

            {/* LINE hint */}
            <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
              <div className="flex items-center gap-2 p-2.5 bg-[#06C755]/5 rounded-xl border border-[#06C755]/20">
                <MessageCircle className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
                <p className="text-[10px] text-[var(--text-secondary)] leading-snug">
                  กดปุ่ม <span className="font-semibold text-[#06C755]">LINE</span> บนการ์ดนัดเพื่อส่งข้อความแจ้งลูกค้า
                </p>
              </div>
            </div>
          </div>

          {/* Appointment list */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="font-semibold text-[var(--text-primary)]">
              คิว{selectedDate.toDateString() === new Date().toDateString() ? 'วันนี้' : formatDate(selectedDate)} · {loading ? '...' : todayApts.length} นัด
            </h3>
            {loading ? (
              <div className="bg-white rounded-2xl border border-[var(--border-light)] py-16 text-center">
                <Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto mb-3 animate-spin" />
                <p className="text-[var(--text-muted)] text-sm">กำลังโหลด...</p>
              </div>
            ) : todayApts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[var(--border-light)] py-16 text-center">
                <Calendar className="w-12 h-12 text-[var(--pink-100)] mx-auto mb-3" />
                <p className="text-[var(--text-muted)] text-sm">ไม่มีนัดหมายในวันนี้</p>
                <button onClick={() => setShowModal(true)} className="mt-3 text-sm text-[var(--pink-500)] font-medium hover:underline flex items-center gap-1 mx-auto">
                  <Plus className="w-4 h-4" /> เพิ่มนัดหมาย
                </button>
              </div>
            ) : todayApts.map(apt => <AptCard key={apt.id} apt={apt} />)}
          </div>
        </div>
      )}

      {/* ─── WEEK VIEW ─── */}
      {view === 'week' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 7); setSelectedDate(d) }}
              className="p-2 rounded-xl border border-[var(--border-light)] hover:bg-[var(--pink-50)] transition-all">
              <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {weekDays[0].toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} — {weekDays[6].toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 7); setSelectedDate(d) }}
              className="p-2 rounded-xl border border-[var(--border-light)] hover:bg-[var(--pink-50)] transition-all">
              <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day, i) => {
              const apts     = weekApts(day)
              const isToday  = day.toDateString() === new Date().toDateString()
              const isSel    = day.toDateString() === selectedDate.toDateString()
              return (
                <div key={i} className={`min-h-[120px] rounded-2xl border p-2 cursor-pointer transition-all ${
                  isSel    ? 'border-[var(--pink-300)] bg-[var(--pink-50)]' :
                  isToday  ? 'border-[var(--pink-200)] bg-[var(--pink-50)]/40' :
                  'border-[var(--border-light)] bg-white hover:border-[var(--pink-200)]'
                }`} onClick={() => { setSelectedDate(day); setView('day') }}>
                  <div className="text-center mb-2">
                    <p className="text-[10px] text-[var(--text-muted)]">{thaiDays[i]}</p>
                    <p className={`text-sm font-bold ${isToday ? 'text-[var(--pink-500)]' : 'text-[var(--text-primary)]'}`}>{day.getDate()}</p>
                  </div>
                  <div className="space-y-0.5">
                    {apts.slice(0, 3).map(a => (
                      <div key={a.id} className={`text-[9px] px-1.5 py-0.5 rounded-lg font-medium truncate ${statusConfig[a.status as AptStatus]?.color ?? 'bg-[var(--bg-base)] text-[var(--text-muted)]'}`}>
                        {a.startTime} {a.customerName}
                      </div>
                    ))}
                    {apts.length > 3 && <p className="text-[9px] text-[var(--text-muted)] text-center">+{apts.length - 3} อื่นๆ</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Add Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--text-secondary)]/20 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-[var(--shadow-lg)] w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)] sticky top-0 bg-white rounded-t-3xl">
              <h2 className="font-bold text-[var(--text-primary)]">เพิ่มนัดหมาย</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-[var(--bg-base)]">
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อลูกค้า *</label>
                  <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                    placeholder="ชื่อ-นามสกุล" required className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">เบอร์โทร *</label>
                  <input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                    placeholder="08X-XXX-XXXX" type="tel" required className={inputClass} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">บริการ</label>
                <select value={form.service} onChange={e => setForm(f => ({ ...f, service: e.target.value }))} className={inputClass}>
                  {serviceOptions.map(s => <option key={s.name} value={s.name}>{s.name} ({s.duration} นาที)</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ช่างผม</label>
                <input value={form.stylist} onChange={e => setForm(f => ({ ...f, stylist: e.target.value }))}
                  placeholder="ชื่อช่าง (ถ้ามี)" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">วันที่</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">เวลา</label>
                  <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} required className={inputClass} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">หมายเหตุ</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="ข้อควรรู้พิเศษ..." rows={2} className={`${inputClass} resize-none`} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">
                  ยกเลิก
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold shadow-md shadow-pink-200 disabled:opacity-40">
                  {saving ? 'กำลังบันทึก...' : 'บันทึกนัดหมาย'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LINE Message Modal */}
      {lineModal && (
        <LineModal
          apt={lineModal.apt}
          status={lineModal.status}
          onClose={() => setLineModal(null)}
        />
      )}
    </div>
  )
}
