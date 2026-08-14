'use client'
import { useState, useEffect } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { TrendingUp, TrendingDown, DollarSign, Download, Plus, X, Loader2, Trash2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { collection, onSnapshot, query, where, Timestamp, doc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, addDocument, convertTimestamps } from '@/lib/firestore'
import { isCountableDeposit, isCountableSale } from '@/lib/sales'
import { Expense, Sale, Deposit } from '@/types'
import { useAuth } from '@/hooks/useAuth'

const expenseCategories = ['ค่าเช่า','ค่าไฟ/น้ำ','ค่าจ้างพนักงาน','วัตถุดิบ','ค่าขนส่ง','การตลาด','อุปกรณ์สำนักงาน','อื่นๆ']

const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

interface Transaction { id: string; type: 'income' | 'expense'; desc: string; amount: number; date: Date; category: string; deletable: boolean }

export default function AccountingPage() {
  const { companyId, branchId, userId } = useAuth()
  const [expenses, setExpenses]     = useState<Expense[]>([])
  const [sales, setSales]           = useState<Sale[]>([])
  const [deposits, setDeposits]     = useState<Deposit[]>([])
  const [loading, setLoading]       = useState(true)
  const [period, setPeriod]         = useState('month')
  const [showModal, setShowModal]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [form, setForm] = useState({ category: expenseCategories[0], description: '', amount: '', date: new Date().toISOString().split('T')[0] })

  useEffect(() => {
    if (!companyId) return
    const now   = new Date()
    const start = period === 'day'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : period === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), 0, 1)
    const ts = Timestamp.fromDate(start)

    // No orderBy — sort client-side to avoid composite index requirement
    const expQ  = query(collection(db, COLLECTIONS.EXPENSES),  where('companyId', '==', companyId), where('createdAt', '>=', ts))
    const saleQ = query(collection(db, COLLECTIONS.SALES),     where('companyId', '==', companyId), where('createdAt', '>=', ts))
    const depQ  = query(collection(db, COLLECTIONS.DEPOSITS),  where('companyId', '==', companyId), where('createdAt', '>=', ts))

    let expDone = false, saleDone = false, depDone = false
    const check = () => { if (expDone && saleDone && depDone) setLoading(false) }

    const u1 = onSnapshot(expQ, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Expense[]
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setExpenses(list)
      expDone = true; check()
    }, () => { expDone = true; check() })

    const u2 = onSnapshot(saleQ, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[]
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setSales(list)
      saleDone = true; check()
    }, () => { saleDone = true; check() })

    const u3 = onSnapshot(depQ, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Deposit[]
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setDeposits(list)
      depDone = true; check()
    }, () => { depDone = true; check() })

    return () => { u1(); u2(); u3() }
  }, [period, companyId])

  const countableSales = sales.filter(isCountableSale)
  const countableDeposits = deposits.filter(isCountableDeposit)
  const salesIncome   = countableSales.reduce((s, r) => s + r.totalAmount, 0)
  const depositIncome = countableDeposits.reduce((s, d) => s + d.paidAmount, 0)
  const totalIncome   = salesIncome + depositIncome
  const totalExpense  = expenses.reduce((s, r) => s + r.amount, 0)
  const netProfit     = totalIncome - totalExpense

  // Build monthly chart (last 6 months)
  const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  const now = new Date()
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const m = (now.getMonth() - 5 + i + 12) % 12
    const y = now.getFullYear() - (now.getMonth() - 5 + i < 0 ? 1 : 0)
    const sIncome = countableSales.filter(s => { const d = new Date(s.createdAt); return d.getMonth()===m && d.getFullYear()===y }).reduce((a,s)=>a+s.totalAmount, 0)
    const dIncome = countableDeposits.filter(d => { const dt = new Date(d.createdAt); return dt.getMonth()===m && dt.getFullYear()===y }).reduce((a,d)=>a+d.paidAmount, 0)
    const income  = sIncome + dIncome
    const expense = expenses.filter(e => { const d = new Date(e.createdAt); return d.getMonth()===m && d.getFullYear()===y }).reduce((a,e)=>a+e.amount, 0)
    return { name: monthNames[m], income, expense }
  })

  // Recent transactions merged
  const transactions: Transaction[] = [
    ...countableSales.slice(0,10).map(s => ({ id:'s'+s.id, type:'income' as const, desc: `ขาย #${s.receiptNo}${s.customerName ? ' - '+s.customerName : ''}`, amount: s.totalAmount, date: new Date(s.createdAt), category: 'ยอดขาย', deletable: false })),
    ...countableDeposits.slice(0,10).map(d => ({ id:'d'+d.id, type:'income' as const, desc: `มัดจำ #${d.depositNo} - ${d.customerName}`, amount: d.paidAmount, date: new Date(d.createdAt), category: 'มัดจำ', deletable: false })),
    ...expenses.slice(0,20).map(e => ({ id:'e'+e.id, type:'expense' as const, desc: e.description, amount: e.amount, date: new Date(e.createdAt), category: e.category, deletable: true })),
  ].sort((a,b) => b.date.getTime() - a.date.getTime()).slice(0, 20)

  const handleAdd = async (evt: React.FormEvent) => {
    evt.preventDefault(); setSaving(true)
    try {
      await addDocument<Expense>(COLLECTIONS.EXPENSES, {
        companyId, branchId,
        category: form.category, description: form.description,
        amount: parseFloat(form.amount) || 0,
        date: new Date(form.date), recordedBy: userId,
        status: 'active', createdAt: new Date(), updatedAt: new Date(),
      })
      setShowModal(false)
      setForm({ category: expenseCategories[0], description: '', amount: '', date: new Date().toISOString().split('T')[0] })
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const handleDelete = async (expenseId: string) => {
    if (!confirm('ลบรายจ่ายนี้?')) return
    setDeleting(expenseId)
    try {
      await deleteDoc(doc(db, COLLECTIONS.EXPENSES, expenseId))
    } catch (err) { console.error(err); alert('ลบไม่สำเร็จ') }
    finally { setDeleting(null) }
  }

  const handleExport = () => {
    const rows = [
      ['ประเภท','วันที่','หมวดหมู่','รายละเอียด','จำนวน (บาท)'],
      ...transactions.map(tx => [
        tx.type === 'income' ? 'รายรับ' : 'รายจ่าย',
        formatDate(tx.date),
        tx.category,
        tx.desc,
        tx.amount.toFixed(2),
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `accounting-${period}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">บัญชีการเงิน</h1>
          <p className="text-sm text-[var(--text-muted)]">รายรับ-รายจ่ายและกำไรขาดทุน</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none">
            <option value="day">วันนี้</option>
            <option value="month">เดือนนี้</option>
            <option value="year">ปีนี้</option>
          </select>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm hover:bg-[var(--bg-base)] transition-all">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200 hover:opacity-95 active:scale-[0.98] transition-all">
            <Plus className="w-4 h-4" /> บันทึกรายจ่าย
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label:'รายรับรวม',  value: totalIncome,  icon: TrendingUp,   color:'text-emerald-600', bg:'bg-emerald-100' },
          { label:'รายจ่ายรวม', value: totalExpense, icon: TrendingDown, color:'text-red-600',     bg:'bg-red-100'     },
          { label:'กำไรสุทธิ',  value: netProfit,    icon: DollarSign,   color: netProfit >= 0 ? 'text-[var(--pink-500)]' : 'text-red-600', bg:'bg-[var(--pink-50)]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className="text-sm text-[var(--text-muted)]">{s.label}</p>
            </div>
            {loading ? <div className="h-8 w-32 bg-[var(--bg-base)] rounded animate-pulse" /> : (
              <p className={`text-2xl font-bold ${s.color}`}>{formatCurrency(s.value)}</p>
            )}
          </div>
        ))}
      </div>

      {/* Income breakdown */}
      {totalIncome > 0 && (
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4">
          <p className="text-xs font-semibold text-[var(--text-muted)] mb-3">แหล่งรายรับ</p>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-[var(--text-muted)]">ยอดขายปกติ</p>
              <p className="font-bold text-sm text-emerald-600">{formatCurrency(salesIncome)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">รับมัดจำ</p>
              <p className="font-bold text-sm text-blue-600">{formatCurrency(depositIncome)}</p>
            </div>
            <div className="ml-auto">
              <p className="text-xs text-[var(--text-muted)]">อัตรากำไร</p>
              <p className={`font-bold text-sm ${netProfit >= 0 ? 'text-[var(--pink-500)]' : 'text-red-600'}`}>
                {totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : '0'}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4">รายรับ vs รายจ่าย (6 เดือน)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f5e8f3" />
            <XAxis dataKey="name" tick={{ fontSize:12, fill:'#a88aac' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:12, fill:'#a88aac' }} axisLine={false} tickLine={false} tickFormatter={v=>`${v/1000}K`} />
            <Tooltip formatter={v=>[formatCurrency(Number(v)),'']} contentStyle={{ borderRadius:'12px', border:'none', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }} />
            <Bar dataKey="income"  name="รายรับ"  fill="#f472b6" radius={[4,4,0,0]} />
            <Bar dataKey="expense" name="รายจ่าย" fill="#e8e0d5" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-light)]">
          <h3 className="font-semibold text-[var(--text-primary)]">รายการล่าสุด</h3>
        </div>
        {loading ? (
          <div className="py-12 text-center"><Loader2 className="w-7 h-7 text-[var(--pink-300)] mx-auto animate-spin" /></div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-muted)]">ยังไม่มีรายการ</div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--pink-50)]/30 transition-colors">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${tx.type==='income' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {tx.type==='income' ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{tx.desc}</p>
                  <p className="text-xs text-[var(--text-muted)]">{formatDate(tx.date)} · {tx.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className={`font-bold text-sm ${tx.type==='income' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {tx.type==='income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                  {tx.deletable && (
                    <button onClick={() => handleDelete(tx.id.slice(1))} disabled={deleting === tx.id.slice(1)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 transition-all">
                      {deleting === tx.id.slice(1) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h2 className="font-bold text-[var(--text-primary)]">บันทึกรายจ่าย</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">หมวดหมู่</label>
                <select value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))} className={inputClass}>
                  {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">รายละเอียด *</label>
                <input value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} required className={inputClass} placeholder="เช่น ค่าเช่าสถานที่เดือนมิ.ย." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">จำนวน (บาท) *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))} required className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">วันที่</label>
                  <input type="date" value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))} className={inputClass} />
                </div>
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
    </div>
  )
}
