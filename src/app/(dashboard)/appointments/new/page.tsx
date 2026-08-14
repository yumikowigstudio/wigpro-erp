'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { addDocument, COLLECTIONS } from '@/lib/firestore'
import { toast } from 'sonner'
import { ArrowLeft, User, Scissors, Clock, StickyNote, CalendarCheck } from 'lucide-react'
import Link from 'next/link'

const serviceOptions = [
  'ตัดผม', 'ทำสี', 'ปรับแต่งวิก', 'ซ่อมวิก', 'ปรึกษา', 'สั่งผลิตวิก', 'อื่นๆ',
]

export default function NewAppointmentPage() {
  const { user, currentBranch } = useAuth()
  const { isConnected, syncAppointment } = useGoogleCalendar()
  const router = useRouter()

  const [form, setForm] = useState({
    customerName:  '',
    customerPhone: '',
    service:       '',
    stylistName:   '',
    stylistEmail:  '',
    date:          new Date().toISOString().split('T')[0],
    startTime:     '10:00',
    endTime:       '11:00',
    notes:         '',
    syncCalendar:  isConnected,
  })
  const [saving, setSaving] = useState(false)

  const set = (key: string, value: string | boolean) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !currentBranch) return

    setSaving(true)
    try {
      // บันทึกลง Firestore
      const appointmentData = {
        companyId:     user.companyId,
        branchId:      currentBranch.id,
        customerName:  form.customerName,
        customerPhone: form.customerPhone,
        services: [{
          serviceName: form.service,
          price:       0,
          duration:    60,
          staffId:     '',
        }],
        date:          new Date(form.date),
        startTime:     form.startTime,
        endTime:       form.endTime,
        duration:      60,
        status:        'pending',
        notes:         form.notes,
        createdBy:     user.id,
        lineNotified:  false,
        googleEventId: '',
      }

      const appointmentId = await addDocument(COLLECTIONS.APPOINTMENTS, appointmentData)

      // Sync Google Calendar ถ้าเลือกไว้
      if (form.syncCalendar && isConnected) {
        await syncAppointment(appointmentId, {
          customerName:  form.customerName,
          customerPhone: form.customerPhone,
          services:      form.service,
          stylistName:   form.stylistName || 'ยังไม่ได้กำหนด',
          stylistEmail:  form.stylistEmail || undefined,
          date:          form.date,
          startTime:     form.startTime,
          endTime:       form.endTime,
          branchName:    currentBranch.name,
          notes:         form.notes,
        })
      }

      toast.success('สร้างนัดหมายแล้ว ✅')
      router.push('/appointments')
    } catch (err) {
      console.error(err)
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link href="/appointments" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--pink-500)] transition-colors">
        <ArrowLeft className="w-4 h-4" /> กลับ
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">นัดหมายใหม่</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">สร้างนัดหมายและ Sync Google Calendar อัตโนมัติ</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Customer info */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] p-5 shadow-[var(--shadow-card)] space-y-4">
          <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <User className="w-4 h-4 text-[var(--pink-400)]" /> ข้อมูลลูกค้า
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ชื่อลูกค้า *</label>
              <input required value={form.customerName} onChange={e => set('customerName', e.target.value)}
                placeholder="เช่น คุณสมใจ รักดี"
                className="w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เบอร์โทร *</label>
              <input required value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)}
                placeholder="082-345-6789"
                className="w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            </div>
          </div>
        </div>

        {/* Service & Stylist */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] p-5 shadow-[var(--shadow-card)] space-y-4">
          <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Scissors className="w-4 h-4 text-[var(--pink-400)]" /> บริการ
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ประเภทบริการ *</label>
              <select required value={form.service} onChange={e => set('service', e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all">
                <option value="">เลือกบริการ...</option>
                {serviceOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ช่างที่รับผิดชอบ</label>
              <input value={form.stylistName} onChange={e => set('stylistName', e.target.value)}
                placeholder="เช่น น้องนิ"
                className="w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                Email ช่าง
                <span className="ml-1 font-normal text-[var(--text-muted)]">(ส่ง Google Calendar invite)</span>
              </label>
              <input type="email" value={form.stylistEmail} onChange={e => set('stylistEmail', e.target.value)}
                placeholder="stylist@gmail.com"
                className="w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            </div>
          </div>
        </div>

        {/* Date & Time */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] p-5 shadow-[var(--shadow-card)] space-y-4">
          <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--pink-400)]" /> วันและเวลา
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">วันที่ *</label>
              <input required type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เวลาเริ่ม *</label>
              <input required type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เวลาสิ้นสุด *</label>
              <input required type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] p-5 shadow-[var(--shadow-card)]">
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5 text-[var(--pink-400)]" /> หมายเหตุ
          </label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={3} placeholder="หมายเหตุเพิ่มเติม..."
            className="w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all resize-none" />
        </div>

        {/* Google Calendar toggle */}
        <div className={`rounded-2xl border p-4 flex items-center justify-between ${
          isConnected
            ? 'bg-blue-50 border-blue-100'
            : 'bg-[var(--bg-base)] border-[var(--border-light)]'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isConnected ? 'bg-blue-500' : 'bg-[var(--text-muted)]'}`}>
              <CalendarCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Sync Google Calendar</p>
              <p className="text-xs text-[var(--text-muted)]">
                {isConnected ? 'เพิ่มนัดหมายใน Google Calendar อัตโนมัติ' : 'ยังไม่ได้เชื่อมต่อ Google Calendar'}
              </p>
            </div>
          </div>
          {isConnected ? (
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={form.syncCalendar} onChange={e => set('syncCalendar', e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500" />
            </label>
          ) : (
            <Link href="/settings?tab=google" className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors">
              เชื่อมต่อ
            </Link>
          )}
        </div>

        {/* Submit */}
        <button type="submit" disabled={saving}
          className="w-full py-3.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] hover:opacity-95 text-white font-bold rounded-2xl shadow-lg shadow-pink-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'กำลังบันทึก...' : '✅ บันทึกนัดหมาย'}
        </button>
      </form>
    </div>
  )
}
