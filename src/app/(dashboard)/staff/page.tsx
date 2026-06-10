'use client'
import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { addDocument, COLLECTIONS } from '@/lib/firestore'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, Eye, Edit, Phone, User, Award, TrendingUp, X, Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { Employee } from '@/types'

const roleLabels: Record<string, { label: string; color: string }> = {
  owner: { label: 'Owner', color: 'bg-purple-100 text-purple-700' },
  branch_manager: { label: 'ผู้จัดการสาขา', color: 'bg-blue-100 text-blue-700' },
  sales: { label: 'Sales', color: 'bg-green-100 text-green-700' },
  stylist: { label: 'ช่าง', color: 'bg-amber-100 text-amber-700' },
  staff: { label: 'พนักงาน', color: 'bg-gray-100 text-gray-700' },
  accountant: { label: 'บัญชี', color: 'bg-teal-100 text-teal-700' },
}

const POSITION_OPTIONS = ['owner', 'branch_manager', 'sales', 'stylist', 'staff', 'accountant']

interface StaffForm {
  firstName: string
  lastName: string
  nickname: string
  phone: string
  position: string
  commissionRate: string
  startDate: string
}

const defaultForm: StaffForm = {
  firstName: '',
  lastName: '',
  nickname: '',
  phone: '',
  position: 'staff',
  commissionRate: '',
  startDate: '',
}

export default function StaffPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<StaffForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<StaffForm>>({})

  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.EMPLOYEES),
      where('companyId', '==', 'demo_company'),
      where('status', '!=', 'deleted')
    )
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee))
      setEmployees(docs)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  const filtered = employees.filter((s) => {
    const q = search.toLowerCase()
    return !q || [s.firstName, s.lastName, s.nickname, s.phone].some((v) => v?.toLowerCase().includes(q))
  })

  const validate = () => {
    const e: Partial<StaffForm> = {}
    if (!form.firstName.trim()) e.firstName = 'กรุณากรอกชื่อ'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const code = `EMP-${Date.now()}`
      await addDocument<Employee>(COLLECTIONS.EMPLOYEES, {
        companyId: 'demo_company',
        branchId: 'demo_branch',
        code,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        nickname: form.nickname.trim() || undefined,
        phone: form.phone.trim() || undefined,
        position: form.position,
        commissionRate: form.commissionRate ? Number(form.commissionRate) : undefined,
        startDate: form.startDate ? new Date(form.startDate) : new Date(),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Omit<Employee, 'id'>)
      setShowModal(false)
      setForm(defaultForm)
      setErrors({})
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setForm(defaultForm)
    setErrors({})
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">พนักงาน</h1>
          <p className="text-sm text-[var(--text-muted)]">{filtered.length} คน</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-md hover:opacity-90 transition-all self-start"
        >
          <Plus className="w-4 h-4" /> เพิ่มพนักงาน
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'พนักงานทั้งหมด', value: employees.length, icon: User, color: 'text-blue-600' },
          { label: 'ยอดขายรวมเดือนนี้', value: formatCurrency(0), icon: TrendingUp, color: 'text-[var(--pink-600)]' },
          { label: 'คอมมิชชั่นรวม', value: formatCurrency(0), icon: Award, color: 'text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[var(--border-light)] p-4">
            <div className="flex items-center gap-3">
              <s.icon className={`w-8 h-8 p-1.5 bg-[var(--bg-base)] rounded-lg ${s.color}`} />
              <div>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์โทร..."
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Staff table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#f472b6]" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[var(--border-light)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-light)] bg-[var(--bg-subtle)]">
                  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-5 py-3">พนักงาน</th>
                  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3 hidden sm:table-cell">ตำแหน่ง</th>
                  <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-4 py-3 hidden lg:table-cell">คอมมิชชั่น (%)</th>
                  <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-5 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-[var(--text-muted)] text-sm">
                      ยังไม่มีพนักงานในระบบ
                    </td>
                  </tr>
                ) : filtered.map((staff) => {
                  const roleInfo = roleLabels[staff.position] || { label: staff.position, color: 'bg-gray-100 text-gray-700' }
                  return (
                    <tr key={staff.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#f472b6] to-[#e879a0] flex items-center justify-center text-white font-bold text-sm">
                            {staff.firstName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-[var(--text-primary)]">{staff.firstName} {staff.lastName}</p>
                            {staff.phone && (
                              <p className="text-xs text-[var(--text-muted)] flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> {staff.phone}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleInfo.color}`}>{roleInfo.label}</span>
                        {staff.nickname && <p className="text-xs text-[var(--text-muted)] mt-0.5">{staff.nickname}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                        <p className="font-semibold text-sm text-emerald-600">
                          {staff.commissionRate != null ? `${staff.commissionRate}%` : '-'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/staff/${staff.id}`} className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--pink-600)] transition-all"><Eye className="w-4 h-4" /></Link>
                          <Link href={`/staff/${staff.id}/edit`} className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-blue-600 transition-all"><Edit className="w-4 h-4" /></Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">เพิ่มพนักงานใหม่</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* ชื่อ */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ชื่อ <span className="text-red-500">*</span></label>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="กรอกชื่อ"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
                {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
              </div>

              {/* นามสกุล */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">นามสกุล</label>
                <input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="กรอกนามสกุล"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
              </div>

              {/* ชื่อเล่น */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ชื่อเล่น</label>
                <input
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="กรอกชื่อเล่น"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
              </div>

              {/* เบอร์โทร */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">เบอร์โทร</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0xx-xxx-xxxx"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
              </div>

              {/* ตำแหน่ง */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ตำแหน่ง</label>
                <select
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                >
                  {POSITION_OPTIONS.map((p) => (
                    <option key={p} value={p}>{roleLabels[p]?.label ?? p}</option>
                  ))}
                </select>
              </div>

              {/* อัตราคอมมิชชั่น */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">อัตราคอมมิชชั่น (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.commissionRate}
                  onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
              </div>

              {/* วันเริ่มงาน */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">วันเริ่มงาน</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-base)] text-[var(--text-muted)] rounded-xl text-sm font-semibold hover:bg-[#ede8e0] transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
