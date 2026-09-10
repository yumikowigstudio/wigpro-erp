'use client'
import { CancelFinancialDocument } from '@/components/CancelFinancialDocument'
import { useCallback, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Search, CreditCard, CheckCircle, Clock, XCircle, Loader2, X, AlertTriangle, CalendarDays, UserRound, Banknote, Landmark, QrCode, Save } from 'lucide-react'
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, addDocument, convertTimestamps, generateBranchDocumentNo } from '@/lib/firestore'
import { receiveDepositPayment } from '@/lib/depositPayments'
import { printDepositReceipt } from '@/lib/depositReceipt'
import { depositPaid, depositPayments, depositRemaining, money } from '@/lib/money'
import { Deposit } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { usePermissionAction } from '@/hooks/usePermissionAction'

type DepositStatus = 'pending' | 'deposited' | 'paid_full' | 'cancelled'

const statusConfig: Record<DepositStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'รอมัดจำ',   color: 'bg-amber-100 text-amber-700',    icon: Clock       },
  deposited: { label: 'มัดจำแล้ว', color: 'bg-blue-100 text-blue-700',      icon: CreditCard  },
  paid_full: { label: 'ชำระครบ',   color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  cancelled: { label: 'ยกเลิก',    color: 'bg-red-100 text-red-700',        icon: XCircle     },
}

const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

const PAY_METHODS = [
  { id: 'cash', label: 'เงินสด', icon: Banknote },
  { id: 'transfer', label: 'โอนเงิน', icon: Landmark },
  { id: 'qr', label: 'พร้อมเพย์', icon: QrCode },
  { id: 'credit_card', label: 'บัตร', icon: CreditCard },
]

const DEFAULT_RECEIPT_NOTE_TEMPLATES = [
  'กรุณาเก็บใบเสร็จนี้ไว้เป็นหลักฐาน / Please keep this receipt as proof of purchase.',
  'รับประกันสินค้า 7 วัน ตามเงื่อนไขของร้าน / 7-day warranty under store policy.',
  'สินค้าสั่งผลิตไม่รับคืนหรือเปลี่ยนหลังเริ่มผลิต / Custom-made items are non-refundable after production starts.',
]

const uniqTexts = (values: string[]) => Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))

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

function PayModal({ deposit, payAmount, setPayAmount, payMethod, setPayMethod, receiptItems, setReceiptItems, receiptNote, setReceiptNote, receiptNoteTemplates, templateSaving, onSaveTemplate, saving, onClose, onConfirm }:
  { deposit: Deposit; payAmount: string; setPayAmount: (v:string)=>void; payMethod: string; setPayMethod: (v:string)=>void; receiptItems: Deposit['items']; setReceiptItems: (items: Deposit['items'])=>void; receiptNote: string; setReceiptNote: (v:string)=>void; receiptNoteTemplates: string[]; templateSaving: boolean; onSaveTemplate: ()=>void; saving: boolean; onClose: ()=>void; onConfirm: ()=>void }) {
  const method = payMethod
  const setMethod = setPayMethod
  const paid = parseFloat(payAmount) || 0
  const change = Math.max(paid - deposit.remainingAmount, 0)
  const isEnough = paid >= deposit.remainingAmount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={`รับชำระส่วนที่เหลือ ${deposit.depositNo}`} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
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

        <div className="min-h-0 space-y-4 overflow-y-auto p-5 pb-0">
          {/* Deposit details */}
          <div className="bg-[var(--bg-base)] rounded-2xl p-4 space-y-2.5 text-sm">
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">รายการสินค้าและบริการ</p>
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-xl border border-[var(--border-light)] bg-white p-3">
                {receiptItems.map((item, index) => (
                  <div key={`${item.productId || item.serviceId || item.name}-${index}`} className="border-b border-dashed border-[var(--border-light)] pb-2 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <span className="min-w-0 font-medium text-[var(--text-primary)]">{item.name} × {item.quantity}</span>
                      <span className="shrink-0 font-semibold">{formatCurrency(item.total)}</span>
                    </div>
                    {item.workGroupName && <p className="mt-1 text-[11px] text-[var(--text-muted)]">ชิ้นงาน: {item.workGroupName}</p>}
                    <textarea
                      aria-label={`หมายเหตุรายการ ${item.name}`}
                      value={item.note ?? ''}
                      onChange={event => setReceiptItems(receiptItems.map((current, currentIndex) => currentIndex === index ? { ...current, note: event.target.value } : current))}
                      rows={1}
                      className="mt-2 w-full resize-y rounded-lg border border-[var(--border-light)] bg-[var(--bg-base)] px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                      placeholder="หมายเหตุของรายการนี้"
                    />
                  </div>
                ))}
              </div>
            </div>
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
              <span className="text-blue-600">{formatCurrency(depositPaid(deposit))}</span>
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
                  <m.icon className="h-4 w-4" />{m.label}
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
                    <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4" />รับเงิน</span><span>{formatCurrency(paid)}</span>
                  </div>
                  {change > 0 && <div className="flex justify-between text-emerald-600">
                    <span className="flex items-center gap-1.5"><Banknote className="h-4 w-4" />เงินทอน</span><span className="font-bold">{formatCurrency(change)}</span>
                  </div>}
                </div>
              ) : (
                <div className="flex justify-between font-medium text-red-600">
                  <span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />รับไม่ครบ ขาดอีก</span><span>{formatCurrency(deposit.remainingAmount - paid)}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">หมายเหตุท้ายใบเสร็จ / Receipt note</label>
            <select
              aria-label="ข้อความหมายเหตุที่บันทึกไว้"
              value={receiptNoteTemplates.includes(receiptNote.trim()) ? receiptNote.trim() : ''}
              onChange={event => setReceiptNote(event.target.value)}
              className={inputClass}
            >
              <option value="">เลือกข้อความที่บันทึกไว้</option>
              {receiptNoteTemplates.map(template => <option key={template} value={template}>{template}</option>)}
            </select>
            <textarea
              aria-label="หมายเหตุท้ายใบเสร็จ"
              value={receiptNote}
              onChange={event => setReceiptNote(event.target.value)}
              rows={3}
              className={`${inputClass} resize-y whitespace-pre-wrap`}
              placeholder="เช่น เงื่อนไขรับประกัน หรือข้อความแจ้งลูกค้า"
            />
            <button
              type="button"
              onClick={onSaveTemplate}
              disabled={!receiptNote.trim() || templateSaving}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--pink-600)] disabled:opacity-40"
            >
              {templateSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              บันทึกข้อความนี้เป็นตัวเลือก
            </button>
          </div>

          <div className="sticky bottom-0 -mx-5 border-t border-[var(--border-light)] bg-white px-5 py-4 shadow-[0_-8px_18px_rgba(0,0,0,0.04)]">
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">
                ยกเลิก
              </button>
              <button onClick={onConfirm} disabled={saving || paid <= 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังบันทึก...</> : <><CheckCircle className="h-4 w-4" />ยืนยันรับเงิน</>}
              </button>
            </div>
            {paid > 0 && <p className="mt-2 text-center text-xs text-[var(--text-muted)]">ระบบจะเปิดใบรับเงินหลังบันทึกสำเร็จ</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DepositsPage() {
  const paymentAttempt = useRef('')
  const paymentBusy = useRef(false)
  const autoOpenedPayment = useRef('')
  const searchParams = useSearchParams()
  const { companyId, branchId, userId, userName, currentBranch } = useAuth()
  const { ensurePermission } = usePermissionAction()
  const [deposits, setDeposits]         = useState<Deposit[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [showPayModal, setShowPayModal] = useState<Deposit | null>(null)
  const [saving, setSaving]             = useState(false)
  const [message]           = useState('')
  const [form, setForm] = useState({ customerName: '', itemName: '', totalAmount: '', depositAmount: '', notes: '' })
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payReceiptItems, setPayReceiptItems] = useState<Deposit['items']>([])
  const [payReceiptNote, setPayReceiptNote] = useState('')
  const [receiptNoteTemplates, setReceiptNoteTemplates] = useState(DEFAULT_RECEIPT_NOTE_TEMPLATES)
  const [templateSaving, setTemplateSaving] = useState(false)

  useEffect(() => {
    setSearch(searchParams.get('q') ?? '')
    const requestedStatus = searchParams?.get('status')
    if (requestedStatus) setFilterStatus(requestedStatus)
  }, [searchParams])

  useEffect(() => {
    if (!companyId) return
    // No orderBy to avoid composite index — sort client-side
    const q = query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => {
        const record = { id: d.id, ...convertTimestamps(d.data()) } as Deposit
        return { ...record, remainingAmount: depositRemaining(record) }
      })
      list.sort((a, b) => {
        const da = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as unknown as string)
        const db_ = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt as unknown as string)
        return db_.getTime() - da.getTime()
      })
      setDeposits(list)
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId)).then(snapshot => {
      const saved = snapshot.exists() && Array.isArray(snapshot.data().receiptNoteTemplates)
        ? snapshot.data().receiptNoteTemplates.map((value: unknown) => String(value))
        : []
      setReceiptNoteTemplates(uniqTexts([...DEFAULT_RECEIPT_NOTE_TEMPLATES, ...saved]))
    }).catch(console.error)
  }, [companyId])

  const openPayModal = useCallback((deposit: Deposit) => {
    paymentAttempt.current = ''
    setShowPayModal(deposit)
    setPayAmount(String(deposit.remainingAmount ?? 0))
    setPayMethod('cash')
    setPayReceiptItems((deposit.items ?? []).map(item => ({ ...item })))
    setPayReceiptNote(deposit.receiptNote ?? '')
  }, [])

  useEffect(() => {
    const payId = searchParams.get('pay') ?? ''
    if (!payId || autoOpenedPayment.current === payId || deposits.length === 0) return
    const deposit = deposits.find(item => item.id === payId)
    if (!deposit || deposit.status === 'cancelled' || deposit.closedBySaleId || deposit.remainingAmount <= 0) return
    autoOpenedPayment.current = payId
    openPayModal(deposit)
  }, [deposits, openPayModal, searchParams])

  const saveReceiptNoteTemplate = async () => {
    const text = payReceiptNote.trim()
    if (!text || !companyId || templateSaving) return
    const nextTemplates = uniqTexts([...receiptNoteTemplates, text])
    setTemplateSaving(true)
    try {
      await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId), {
        receiptNoteTemplates: nextTemplates,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setReceiptNoteTemplates(nextTemplates)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'บันทึกตัวเลือกหมายเหตุไม่สำเร็จ')
    } finally {
      setTemplateSaving(false)
    }
  }

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
      if (total <= 0 || deposit < 0 || deposit > total) throw new Error('ยอดมัดจำต้องอยู่ระหว่าง 0 ถึงยอดรวม')
      const depositNo = await generateBranchDocumentNo(companyId, branchId, 'deposit')
      await addDocument<Deposit>(COLLECTIONS.DEPOSITS, {
        companyId, branchId,
        branchName: currentBranch?.name ?? '',
        branchCode: currentBranch?.code ?? '',
        depositNo, customerId: '', customerName: form.customerName,
        items: [{ name: form.itemName, quantity: 1, unitPrice: total, total }],
        totalAmount: total, depositAmount: deposit, paidAmount: deposit,
        paymentHistory: deposit > 0 ? [{ id: 'initial', amount: deposit, method: 'cash', receivedAt: now, receivedBy: userId, receivedByName: userName, confirmed: true }] : [],
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
    if (!showPayModal || paymentBusy.current) return
    if (!await ensurePermission('action.sales.confirmPayment', 'รับชำระมัดจำ')) return
    setSaving(true); paymentBusy.current = true
    try {
      const amount = parseFloat(payAmount) || 0
      const received = payMethod === 'cash' ? Math.min(amount, showPayModal.remainingAmount) : amount
      paymentAttempt.current ||= crypto.randomUUID()
      const paymentId = paymentAttempt.current
      const updated = await receiveDepositPayment(showPayModal, { id: paymentId, amount: money(received), method: payMethod, receivedAt: new Date(), receivedBy: userId, receivedByName: userName, receiptItems: payReceiptItems.map(item => ({ ...item, note: item.note?.trim() || undefined })), receiptNote: payReceiptNote.trim(), confirmed: true })
      try { printDepositReceipt(updated, { tendered: amount, paymentId }) } catch (error) { alert(error instanceof Error ? error.message : 'พิมพ์ไม่สำเร็จ สามารถพิมพ์ใหม่จากรายการมัดจำ') }
      paymentAttempt.current = ''
      setShowPayModal(null); setPayAmount(''); setPayMethod('cash'); setPayReceiptItems([]); setPayReceiptNote('')
    } catch (err) { alert(err instanceof Error ? err.message : 'รับชำระไม่สำเร็จ') }
    finally { setSaving(false); paymentBusy.current = false }
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

      {message && (
        <div className="rounded-2xl border border-[var(--border-light)] bg-white px-4 py-3 text-sm text-[var(--text-secondary)] shadow-sm">
          {message}
        </div>
      )}

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
                      onClick={() => openPayModal(dep)}
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
                      <td className="px-4 py-3.5 text-right"><p className="font-semibold text-sm text-blue-600">{formatCurrency(depositPaid(dep))}</p>
                        <details className="mt-1 text-left text-xs"><summary className="cursor-pointer text-[var(--text-muted)]">ประวัติรับเงิน</summary>
                          <div className="mt-2 space-y-2 min-w-48">{depositPayments(dep).map(payment => <div key={payment.id} className="border-b pb-2">
                            <p>{payment.receivedAt ? formatDate(payment.receivedAt) : 'ข้อมูลเดิม ไม่ระบุวันที่'} · {formatCurrency(payment.amount)}</p>
                            <p>{payment.method} · {payment.receivedByName || '-'} · {payment.confirmed ? 'ยืนยันแล้ว' : 'รอยืนยัน'}</p>
                            {payment.confirmed && <button type="button" onClick={() => { try { printDepositReceipt(dep, { paymentId: payment.id }) } catch (error) { alert(error instanceof Error ? error.message : 'พิมพ์ไม่สำเร็จ') } }} className="mt-1 text-[var(--pink-600)] underline">พิมพ์รายการนี้</button>}
                            {!payment.confirmed && dep.status !== 'cancelled' && !dep.closedBySaleId && <button disabled={saving} onClick={async () => {
                              if (!await ensurePermission('action.sales.confirmPayment', 'ยืนยันรับเงินมัดจำ')) return
                              if (!window.confirm(`ยืนยันตรวจสอบและรับเงิน ${formatCurrency(payment.amount)} แล้ว?`)) return
                              setSaving(true)
                              try { await receiveDepositPayment(dep, { ...payment, confirmed: true, receivedAt: new Date(), receivedBy: userId, receivedByName: userName }) }
                              catch (error) { alert(error instanceof Error ? error.message : 'ยืนยันไม่สำเร็จ') }
                              finally { setSaving(false) }
                            }} className="mt-1 text-emerald-700 underline disabled:opacity-50">ยืนยันรับเงิน</button>}
                          </div>)}</div>
                        </details>
                      </td>
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
                          {dep.status !== 'cancelled' && !dep.closedBySaleId && dep.remainingAmount > 0 && (
                            <button onClick={() => openPayModal(dep)}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-all whitespace-nowrap">
                              รับชำระ
                            </button>
                          )}
                          {dep.customerId && !dep.closedBySaleId && dep.status !== 'cancelled' && <Link href={`/pos?depositId=${dep.id}`} className="px-2 py-1 text-xs text-blue-700 underline whitespace-nowrap">เปิดบิลปิดมัดจำ</Link>}
                          <CancelFinancialDocument target={{ kind: 'deposit', record: dep }} />
                          <button type="button" className="px-2 py-1 text-xs text-[var(--pink-600)] underline whitespace-nowrap" onClick={() => { try { printDepositReceipt(dep) } catch (error) { alert(error instanceof Error ? error.message : 'พิมพ์ไม่สำเร็จ') } }}>พิมพ์ใบมัดจำ</button>
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
          receiptItems={payReceiptItems}
          setReceiptItems={setPayReceiptItems}
          receiptNote={payReceiptNote}
          setReceiptNote={setPayReceiptNote}
          receiptNoteTemplates={receiptNoteTemplates}
          templateSaving={templateSaving}
          onSaveTemplate={saveReceiptNoteTemplate}
          saving={saving}
          onClose={() => { paymentAttempt.current = ''; setShowPayModal(null); setPayAmount(''); setPayMethod('cash'); setPayReceiptItems([]); setPayReceiptNote('') }}
          onConfirm={handlePay}
        />
      )}
    </div>
  )
}
