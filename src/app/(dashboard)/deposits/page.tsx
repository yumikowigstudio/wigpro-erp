'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Search, CreditCard, CheckCircle, Clock, XCircle, Loader2, X, AlertTriangle, CalendarDays, UserRound } from 'lucide-react'
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, addDocument, convertTimestamps } from '@/lib/firestore'
import { Deposit } from '@/types'
import { useAuth } from '@/hooks/useAuth'

type DepositStatus = 'pending' | 'deposited' | 'paid_full' | 'cancelled'

const statusConfig: Record<DepositStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'รอมัดจำ',   color: 'bg-amber-100 text-amber-700',    icon: Clock       },
  deposited: { label: 'มัดจำแล้ว', color: 'bg-blue-100 text-blue-700',      icon: CreditCard  },
  paid_full: { label: 'ชำระครบ',   color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  cancelled: { label: 'ยกเลิก',    color: 'bg-red-100 text-red-700',        icon: XCircle     },
}

const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

const PAY_METHODS = [
  { id: 'cash', label: 'เงินสด', icon: '💵' },
  { id: 'transfer', label: 'โอนเงิน', icon: '🏦' },
  { id: 'promptpay', label: 'พร้อมเพย์', icon: '📱' },
  { id: 'card', label: 'บัตร', icon: '💳' },
]

const parsePickupDate = (value?: string) => {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

const isOutstandingDeposit = (deposit: Deposit) =>
  !['paid_full', 'cancelled'].includes(deposit.status ?? '') && (deposit.remainingAmount ?? 0) > 0

const isOverdueDeposit = (deposit: Deposit) => {
  const date = parsePickupDate(deposit.pickupDate)
  if (!date || !isOutstandingDeposit(deposit)) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date < today
}

const isDueSoonDeposit = (deposit: Deposit) => {
  const date = parsePickupDate(deposit.pickupDate)
  if (!date || !isOutstandingDeposit(deposit)) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)
  return date >= today && date <= nextWeek
}

function PayModal({ deposit, payAmount, setPayAmount, payMethod, setPayMethod, saving, onClose, onConfirm }:
  { deposit: Deposit; payAmount: string; setPayAmount: (v:string)=>void; payMethod: string; setPayMethod: (v:string)=>void; saving: boolean; onClose: ()=>void; onConfirm: ()=>void }) {
  const method = payMethod
  const setMethod = setPayMethod
  const paid = parseFloat(payAmount) || 0
  const change = Math.max(paid - deposit.remainingAmount, 0)
  const isEnough = paid >= deposit.remainingAmount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg">รับชำระส่วนที่เหลือ</h2>
              <p className="text-emerald-100 text-sm mt-0.5">{deposit.depositNo} · {deposit.customerName}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Deposit details */}
          <div className="bg-[var(--bg-base)] rounded-2xl p-4 space-y-2.5 text-sm">
            {deposit.items?.[0]?.name && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">รายการ</span>
                <span className="font-medium text-right max-w-[180px]">{deposit.items[0].name}</span>
              </div>
            )}
            {deposit.notes && (
              <div className="flex justify-between gap-3">
                <span className="text-[var(--text-muted)] shrink-0">สเปค/หมายเหตุ</span>
                <span className="text-right text-xs text-[var(--text-secondary)]">{deposit.notes}</span>
              </div>
            )}
            {deposit.pickupDate && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">วันนัดรับ</span>
                <span className="font-medium text-emerald-600">{deposit.pickupDate}</span>
              </div>
            )}
            <hr className="border-[var(--border-light)]" />
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">ยอดรวม</span>
              <span>{formatCurrency(deposit.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">มัดจำที่รับไว้</span>
              <span className="text-blue-600">{formatCurrency(deposit.depositAmount)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span className="text-red-500">ยอดที่ต้องชำระ</span>
              <span className="text-red-500 text-base">{formatCurrency(deposit.remainingAmount)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">ช่องทางชำระ</label>
            <div className="grid grid-cols-4 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                  className={`py-2.5 rounded-xl text-xs font-medium border transition-all flex flex-col items-center gap-1
                    ${method === m.id ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-secondary)]'}`}>
                  <span className="text-lg">{m.icon}</span>{m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">รับเงิน (บาท)</label>
            <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
              className={inputClass + ' text-xl font-bold text-center'} placeholder="0" />
            <div className="flex gap-2 mt-2">
              {[deposit.remainingAmount, deposit.remainingAmount + 100, deposit.remainingAmount + 500].map(v => (
                <button key={v} type="button" onClick={() => setPayAmount(String(v))}
                  className="flex-1 py-1.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-lg text-xs font-medium hover:bg-emerald-50 hover:border-emerald-300 transition-all">
                  {formatCurrency(v)}
                </button>
              ))}
            </div>
          </div>

          {/* Change summary */}
          {paid > 0 && (
            <div className={`rounded-xl p-3 text-sm ${isEnough ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              {isEnough ? (
                <div className="space-y-1">
                  <div className="flex justify-between font-bold text-emerald-700">
                    <span>✅ รับเงิน</span><span>{formatCurrency(paid)}</span>
                  </div>
                  {change > 0 && <div className="flex justify-between text-emerald-600">
                    <span>💵 เงินทอน</span><span className="font-bold">{formatCurrency(change)}</span>
                  </div>}
                </div>
              ) : (
                <div className="flex justify-between font-medium text-red-600">
                  <span>⚠️ รับไม่ครบ ขาดอีก</span><span>{formatCurrency(deposit.remainingAmount - paid)}</span>
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">
              ยกเลิก
            </button>
            <button onClick={onConfirm} disabled={saving || paid <= 0}
              className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-all">
              {saving ? 'กำลังบันทึก...' : '✅ ยืนยันรับเงิน'}
            </button>
          </div>
          {isEnough && paid > 0 && (
            <p className="text-center text-xs text-[var(--text-muted)]">🖨️ ระบบจะพิมพ์ใบเสร็จอัตโนมัติเมื่อชำระครบ</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DepositsPage() {
  const searchParams = useSearchParams()
  const { companyId, branchId, userId, currentBranch } = useAuth()
  const [deposits, setDeposits]         = useState<Deposit[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [showPayModal, setShowPayModal] = useState<Deposit | null>(null)
  const [saving, setSaving]             = useState(false)
  const [form, setForm] = useState({ customerName: '', itemName: '', totalAmount: '', depositAmount: '', notes: '' })
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')

  useEffect(() => {
    const requestedStatus = searchParams?.get('status')
    if (requestedStatus) setFilterStatus(requestedStatus)
  }, [searchParams])

  useEffect(() => {
    if (!companyId) return
    // No orderBy to avoid composite index — sort client-side
    const q = query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Deposit[]
      list.sort((a, b) => {
        const da = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as unknown as string)
        const db_ = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt as unknown as string)
        return db_.getTime() - da.getTime()
      })
      setDeposits(list)
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  const matchesStatus = (deposit: Deposit) => {
    if (!filterStatus) return true
    if (filterStatus === 'outstanding') return isOutstandingDeposit(deposit)
    if (filterStatus === 'overdue') return isOverdueDeposit(deposit)
    return deposit.status === filterStatus
  }

  const filtered = deposits.filter(d => {
    const q = search.toLowerCase()
    return (!q || [d.depositNo, d.customerName].some(v => v?.toLowerCase().includes(q)))
      && matchesStatus(d)
  })

  const outstandingDeposits = deposits.filter(isOutstandingDeposit)
  const overdueDeposits = deposits.filter(isOverdueDeposit)
  const dueSoonDeposits = deposits.filter(isDueSoonDeposit)
  const pendingTotal = outstandingDeposits.reduce((s, d) => s + (d.remainingAmount ?? 0), 0)
  const overdueTotal = overdueDeposits.reduce((s, d) => s + (d.remainingAmount ?? 0), 0)
  const dueSoonTotal = dueSoonDeposits.reduce((s, d) => s + (d.remainingAmount ?? 0), 0)
  const followupDeposits = [
    ...overdueDeposits,
    ...dueSoonDeposits.filter(dep => !overdueDeposits.some(overdue => overdue.id === dep.id)),
  ].slice(0, 5)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const total   = parseFloat(form.totalAmount) || 0
      const deposit = parseFloat(form.depositAmount) || 0
      const now     = new Date()
      const depositNo = `DEP-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getFullYear()).slice(-2)}-${String(deposits.length+1).padStart(3,'0')}`
      await addDocument<Deposit>(COLLECTIONS.DEPOSITS, {
        companyId, branchId,
        branchName: currentBranch?.name ?? '',
        branchCode: currentBranch?.code ?? '',
        depositNo, customerId: '', customerName: form.customerName,
        items: [{ name: form.itemName, quantity: 1, unitPrice: total, total }],
        totalAmount: total, depositAmount: deposit, paidAmount: deposit,
        remainingAmount: total - deposit,
        status: deposit >= total ? 'paid_full' : deposit > 0 ? 'deposited' : 'pending',
        notes: form.notes || undefined,
        createdBy: userId, createdAt: now, updatedAt: now,
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
      const isFullyPaid = newRemaining <= 0
      await updateDoc(doc(db, COLLECTIONS.DEPOSITS, showPayModal.id), {
        paidAmount: newPaid, remainingAmount: newRemaining,
        status: isFullyPaid ? 'paid_full' : 'deposited',
        payMethod, pickupConfirmedAt: isFullyPaid ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      })
      if (isFullyPaid) printPickupReceipt(showPayModal, amount, payMethod || 'cash')
      setShowPayModal(null); setPayAmount(''); setPayMethod('cash')
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const printPickupReceipt = (dep: Deposit, paid: number, method: string) => {
    const methodLabel: Record<string,string> = { cash:'เงินสด', transfer:'โอนเงิน', card:'บัตรเครดิต/เดบิต', promptpay:'พร้อมเพย์' }
    const change = Math.max(paid - dep.remainingAmount, 0)
    const receiptInfo = dep.receiptInfo
    const branchName = receiptInfo?.branchName || dep.branchName || ''
    const branchCode = receiptInfo?.branchCode || dep.branchCode || ''
    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบเสร็จรับเงิน</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Sarabun',sans-serif;font-size:13px;color:#111;padding:24px;max-width:320px;margin:0 auto}
      .center{text-align:center}.bold{font-weight:700}.muted{color:#666;font-size:11px}.shop{margin-bottom:10px}.shop-name{font-size:16px;font-weight:700}.shop-sub{font-size:11px;color:#666;white-space:pre-line}.logo{height:44px;max-width:120px;object-fit:contain;margin:0 auto 6px;display:block}
      .divider{border:none;border-top:1px dashed #ccc;margin:10px 0}
      .row{display:flex;justify-content:space-between;padding:3px 0}
      .badge{display:inline-block;background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
      .highlight{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;margin:8px 0}
      .total-row{font-size:15px;font-weight:700}
      @media print{body{padding:8px}}
    </style></head><body>
    ${receiptInfo ? `<div class="center shop">
      ${receiptInfo.logoUrl ? `<img class="logo" src="${receiptInfo.logoUrl}" alt="logo"/>` : ''}
      ${receiptInfo.nameTh ? `<div class="shop-name">${receiptInfo.nameTh}</div>` : ''}
      ${branchName ? `<div class="shop-sub">สาขา ${branchName}${branchCode ? ` (${branchCode})` : ''}</div>` : ''}
      ${receiptInfo.address ? `<div class="shop-sub">${receiptInfo.address}</div>` : ''}
      ${receiptInfo.phone ? `<div class="shop-sub">โทร. ${receiptInfo.phone}</div>` : ''}
      ${receiptInfo.email ? `<div class="shop-sub">${receiptInfo.email}</div>` : ''}
      ${receiptInfo.taxId ? `<div class="shop-sub">เลขผู้เสียภาษี ${receiptInfo.taxId}</div>` : ''}
    </div>` : branchName ? `<div class="center shop"><div class="shop-sub">สาขา ${branchName}${branchCode ? ` (${branchCode})` : ''}</div></div>` : ''}
    <div class="center" style="margin-bottom:12px">
      <div style="font-size:18px;font-weight:700;color:#059669">✅ ใบเสร็จรับวิก</div>
      <div class="muted">รับวิกและชำระเงินครบแล้ว</div>
      <div class="badge" style="margin-top:6px">ชำระครบ</div>
    </div>
    <hr class="divider">
    <div class="row"><span class="muted">เลขที่</span><span class="bold">${dep.depositNo}</span></div>
    <div class="row"><span class="muted">วันที่รับ</span><span>${new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'})}</span></div>
    <div class="row"><span class="muted">ลูกค้า</span><span class="bold">${dep.customerName}</span></div>
    ${dep.items?.[0]?.name ? `<div class="row"><span class="muted">รายการ</span><span>${dep.items[0].name}</span></div>` : ''}
    ${dep.notes ? `<div class="row"><span class="muted">สเปค</span><span style="font-size:11px;max-width:180px;text-align:right">${dep.notes}</span></div>` : ''}
    <hr class="divider">
    <div class="row"><span class="muted">ยอดรวม</span><span>${dep.totalAmount.toLocaleString('th-TH',{minimumFractionDigits:2})} ฿</span></div>
    <div class="row"><span class="muted">มัดจำที่รับไว้</span><span>${dep.depositAmount.toLocaleString('th-TH',{minimumFractionDigits:2})} ฿</span></div>
    <div class="highlight">
      <div class="row total-row"><span>💰 รับชำระวันนี้</span><span>${paid.toLocaleString('th-TH',{minimumFractionDigits:2})} ฿</span></div>
    </div>
    ${change > 0 ? `<div class="row"><span class="muted">เงินทอน</span><span class="bold" style="color:#059669">${change.toLocaleString('th-TH',{minimumFractionDigits:2})} ฿</span></div>` : ''}
    <div class="row"><span class="muted">ช่องทาง</span><span>${methodLabel[method]||method}</span></div>
    <hr class="divider">
    <div class="center muted" style="margin-top:8px">${receiptInfo?.receiptFooter || 'ขอบคุณที่ใช้บริการค่ะ 🙏'}</div>
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script>
    </body></html>`)
    win.document.close()
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

      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">รายงานมัดจำค้างชำระ</p>
            <p className="text-xs text-[var(--text-muted)]">ใช้ดูยอดที่ต้องตาม ลูกค้าใกล้นัดรับ และรายการที่ควรเก็บเงินเพิ่ม</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <button type="button" onClick={() => setFilterStatus('outstanding')} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left hover:bg-amber-100 transition-all">
              <p className="text-[10px] font-semibold text-amber-700">ค้างทั้งหมด</p>
              <p className="text-sm font-bold text-amber-800">{formatCurrency(pendingTotal)}</p>
            </button>
            <button type="button" onClick={() => setFilterStatus('overdue')} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left hover:bg-red-100 transition-all">
              <p className="text-[10px] font-semibold text-red-700">เกินกำหนด</p>
              <p className="text-sm font-bold text-red-700">{overdueDeposits.length} ใบ</p>
              <p className="text-[10px] text-red-600">{formatCurrency(overdueTotal)}</p>
            </button>
            <button type="button" onClick={() => setFilterStatus('outstanding')} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left hover:bg-blue-100 transition-all">
              <p className="text-[10px] font-semibold text-blue-700">ใกล้ถึงนัด</p>
              <p className="text-sm font-bold text-blue-700">{formatCurrency(dueSoonTotal)}</p>
            </button>
          </div>
        </div>

        {followupDeposits.length > 0 ? (
          <div className="divide-y divide-[var(--border-light)] rounded-2xl border border-[var(--border-light)] overflow-hidden">
            {followupDeposits.map(dep => {
              const overdue = isOverdueDeposit(dep)
              return (
                <div key={dep.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3 bg-[var(--bg-base)]">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${overdue ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                    {overdue ? <AlertTriangle className="w-4 h-4" /> : <CalendarDays className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{dep.customerName} · {dep.depositNo}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      ค้าง {formatCurrency(dep.remainingAmount ?? 0)}
                      {dep.pickupDate ? ` · นัดรับ ${dep.pickupDate}` : ' · ยังไม่ระบุวันนัดรับ'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {dep.customerId && (
                      <Link href={`/customers/${dep.customerId}?tab=timeline`} className="px-2.5 py-1 rounded-lg bg-white border border-[var(--border-light)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--pink-50)] flex items-center gap-1">
                        <UserRound className="w-3 h-3" /> ลูกค้า
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => { setShowPayModal(dep); setPayAmount(String(dep.remainingAmount ?? 0)) }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      รับชำระ
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            ยังไม่มีมัดจำค้างที่ต้องติดตามในช่วงนี้
          </div>
        )}
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
          <option value="outstanding">ค้างชำระทั้งหมด</option>
          <option value="overdue">เกินกำหนดรับ/ชำระ</option>
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
                        <div className="flex items-center gap-1.5">
                          {dep.status === 'deposited' && dep.remainingAmount > 0 && (
                            <button onClick={() => { setShowPayModal(dep); setPayAmount(String(dep.remainingAmount)) }}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-all whitespace-nowrap">
                              รับชำระ
                            </button>
                          )}
                          {(dep.status === 'pending' || dep.status === 'deposited') && (
                            <button
                              onClick={() => {
                                if (!confirm(`ยืนยันยกเลิกมัดจำ ${dep.depositNo}?`)) return
                                updateDoc(doc(db, COLLECTIONS.DEPOSITS, dep.id), {
                                  status: 'cancelled', updatedAt: serverTimestamp(),
                                }).catch(console.error)
                              }}
                              className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-all whitespace-nowrap">
                              ยกเลิก
                            </button>
                          )}
                        </div>
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
        <PayModal
          deposit={showPayModal}
          payAmount={payAmount}
          setPayAmount={setPayAmount}
          payMethod={payMethod}
          setPayMethod={setPayMethod}
          saving={saving}
          onClose={() => { setShowPayModal(null); setPayAmount(''); setPayMethod('cash') }}
          onConfirm={handlePay}
        />
      )}
    </div>
  )
}
