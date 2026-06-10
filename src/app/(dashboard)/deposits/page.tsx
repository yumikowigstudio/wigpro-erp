'use client'
import { useState, useEffect } from 'react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Search, CreditCard, CheckCircle, Clock, XCircle, Loader2, X } from 'lucide-react'
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, addDocument, convertTimestamps } from '@/lib/firestore'
import { Deposit } from '@/types'

type DepositStatus = 'pending' | 'deposited' | 'paid_full' | 'cancelled'

const statusConfig: Record<DepositStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'รอมัดจำ',   color: 'bg-amber-100 text-amber-700',    icon: Clock       },
  deposited: { label: 'มัดจำแล้ว', color: 'bg-blue-100 text-blue-700',      icon: CreditCard  },
  paid_full: { label: 'ชำระครบ',   color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  cancelled: { label: 'ยกเลิก',    color: 'bg-red-100 text-red-700',        icon: XCircle     },
}

const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

export default function DepositsPage() {
  const [deposits, setDeposits]         = useState<Deposit[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [showPayModal, setShowPayModal] = useState<Deposit | null>(null)
  const [saving, setSaving]             = useState(false)
  const [form, setForm] = useState({ customerName: '', itemName: '', totalAmount: '', depositAmount: '', notes: '' })
  const [payAmount, setPayAmount] = useState('')

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.DEPOSITS), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setDeposits(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Deposit[])
      setLoading(false)
    }, () => setLoading(false))
  }, [])

  const filtered = deposits.filter(d => {
    const q = search.toLowerCase()
    return (!q || [d.depositNo, d.customerName].some(v => v?.toLowerCase().includes(q)))
      && (!filterStatus || d.status === filterStatus)
  })

  const pendingTotal = deposits.filter(d => d.status === 'deposited').reduce((s, d) => s + d.remainingAmount, 0)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const total   = parseFloat(form.totalAmount) || 0
      const deposit = parseFloat(form.depositAmount) || 0
      const now     = new Date()
      const depositNo = `DEP-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getFullYear()).slice(-2)}-${String(deposits.length+1).padStart(3,'0')}`
      await addDocument<Deposit>(COLLECTIONS.DEPOSITS, {
        companyId: 'demo_company', branchId: 'demo_branch',
        depositNo, customerId: '', customerName: form.customerName,
        items: [{ name: form.itemName, quantity: 1, unitPrice: total, total }],
        totalAmount: total, depositAmount: deposit, paidAmount: deposit,
        remainingAmount: total - deposit,
        status: deposit >= total ? 'paid_full' : deposit > 0 ? 'deposited' : 'pending',
        notes: form.notes || undefined,
        createdBy: 'demo_user', createdAt: now, updatedAt: now,
      })
      setShowModal(false)
      setForm({ customerName: '', itemName: '', totalAmount: '', depositAmount: '', notes: '' })
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const handlePay = async () => {
    if (!showPayModal) return; setSaving(true)
    try {
      const amount = parseFloat(payAmount) || 0
      const newPaid = showPayModal.paidAmount + amount
      const newRemaining = Math.max(showPayModal.totalAmount - newPaid, 0)
      await updateDoc(doc(db, COLLECTIONS.DEPOSITS, showPayModal.id), {
        paidAmount: newPaid, remainingAmount: newRemaining,
        status: newRemaining <= 0 ? 'paid_full' : 'deposited',
        updatedAt: serverTimestamp(),
      })
      setShowPayModal(null); setPayAmount('')
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">มัดจำ</h1>
          <p className="text-sm text-[var(--text-muted)]">{filtered.length} รายการ · ยอดค้างชำระ {formatCurrency(pendingTotal)}</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-semibold shadow-md shadow-pink-200 hover:opacity-95 active:scale-[0.98] transition-all self-start">
          <Plus className="w-4 h-4" /> รับมัดจำใหม่
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['pending','deposited','paid_full','cancelled'] as DepositStatus[]).map(s => {
          const count = deposits.filter(d => d.status === s).length
          const cfg   = statusConfig[s]
          return (
            <div key={s} className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
              <p className="text-2xl font-bold text-[var(--text-primary)] mt-2">{count}</p>
            </div>
          )
        })}
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเลขมัดจำ ชื่อลูกค้า..."
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none">
          <option value="">สถานะทั้งหมด</option>
          {Object.entries(statusConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        {loading ? (
          <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-light)] bg-[var(--bg-base)]">
                  {['เลขมัดจำ','ลูกค้า','รายการ','ยอดเต็ม','มัดจำ','คงเหลือ','สถานะ',''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center text-sm text-[var(--text-muted)]">
                    ไม่พบข้อมูล
                    <button onClick={() => setShowModal(true)} className="block mx-auto mt-2 text-[var(--pink-500)] font-medium hover:underline">+ สร้างรายการแรก</button>
                  </td></tr>
                ) : filtered.map(dep => {
                  const cfg = statusConfig[dep.status as DepositStatus]
                  const itemName = dep.items?.[0]?.name ?? ''
                  return (
                    <tr key={dep.id} className="hover:bg-[var(--pink-50)]/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-mono text-sm font-bold text-[var(--pink-500)]">{dep.depositNo}</p>
                        <p className="text-xs text-[var(--text-muted)]">{formatDate(dep.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3.5"><p className="font-medium text-sm">{dep.customerName}</p></td>
                      <td className="px-4 py-3.5 hidden md:table-cell"><p className="text-sm text-[var(--text-secondary)]">{itemName}</p></td>
                      <td className="px-4 py-3.5 text-right"><p className="font-semibold text-sm">{formatCurrency(dep.totalAmount)}</p></td>
                      <td className="px-4 py-3.5 text-right"><p className="font-semibold text-sm text-blue-600">{formatCurrency(dep.depositAmount)}</p></td>
                      <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                        <p className={`font-semibold text-sm ${dep.remainingAmount > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                          {dep.remainingAmount > 0 ? formatCurrency(dep.remainingAmount) : '✓ ครบ'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        {cfg && <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {dep.status === 'deposited' && dep.remainingAmount > 0 && (
                          <button onClick={() => { setShowPayModal(dep); setPayAmount(String(dep.remainingAmount)) }}
                            className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-all whitespace-nowrap">
                            รับชำระ
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h2 className="font-bold text-[var(--text-primary)]">รับมัดจำใหม่</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-[var(--bg-base)] transition-all"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อลูกค้า *</label>
                <input value={form.customerName} onChange={e => setForm(f=>({...f,customerName:e.target.value}))} required className={inputClass} placeholder="ชื่อ-นามสกุล" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">รายการสินค้า/บริการ</label>
                <input value={form.itemName} onChange={e => setForm(f=>({...f,itemName:e.target.value}))} className={inputClass} placeholder="เช่น วิกผมยาว สีน้ำตาล" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ยอดรวม (บาท) *</label>
                  <input type="number" value={form.totalAmount} onChange={e => setForm(f=>({...f,totalAmount:e.target.value}))} required className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">รับมัดจำ (บาท)</label>
                  <input type="number" value={form.depositAmount} onChange={e => setForm(f=>({...f,depositAmount:e.target.value}))} className={inputClass} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">หมายเหตุ</label>
                <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} rows={2} className={inputClass+' resize-none'} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">ยกเลิก</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40">
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h2 className="font-bold text-[var(--text-primary)]">รับชำระเงิน</h2>
              <button onClick={() => setShowPayModal(null)} className="p-2 rounded-xl hover:bg-[var(--bg-base)] transition-all"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[var(--bg-base)] rounded-xl p-3 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">ลูกค้า</span><span className="font-medium">{showPayModal.customerName}</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">คงเหลือ</span><span className="font-bold text-red-500">{formatCurrency(showPayModal.remainingAmount)}</span></div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">จำนวนเงินที่รับ (บาท)</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className={inputClass} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowPayModal(null)} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">ยกเลิก</button>
                <button onClick={handlePay} disabled={saving} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-40">
                  {saving ? 'กำลังบันทึก...' : 'ยืนยันรับเงิน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
