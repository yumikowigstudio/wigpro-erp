'use client'
import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Download, Check, Loader2 } from 'lucide-react'
import { collection, onSnapshot, query, where, Timestamp, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { Employee, Sale } from '@/types'

export default function CommissionsPage() {
  const [view, setView] = useState<'summary' | 'detail'>('summary')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState<string | null>(null)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )

  useEffect(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const start = new Date(year, month - 1, 1)
    const end   = new Date(year, month, 1)

    const empQ  = query(collection(db, COLLECTIONS.EMPLOYEES), where('status', '==', 'active'))
    const saleQ = query(
      collection(db, COLLECTIONS.SALES),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<',  Timestamp.fromDate(end))
    )

    let e = false, s = false
    const check = () => { if (e && s) setLoading(false) }

    const u1 = onSnapshot(empQ, snap => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Employee[])
      e = true; check()
    }, () => { e = true; check() })

    const u2 = onSnapshot(saleQ, snap => {
      setSales(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[])
      s = true; check()
    }, () => { s = true; check() })

    return () => { u1(); u2() }
  }, [selectedMonth])

  const summaryData = employees.map(emp => {
    const empSales = sales.filter(s =>
      s.createdBy === emp.userId || s.createdBy === emp.id ||
      s.createdBy === `${emp.firstName} ${emp.lastName}`
    )
    const totalSales = empSales.reduce((a, s) => a + s.totalAmount, 0)
    const rate = emp.commissionRate ?? 5
    const commission = Math.round(totalSales * rate / 100)
    return { emp, totalSales, rate, commission }
  })

  const totalCommission = summaryData.reduce((a, r) => a + r.commission, 0)

  const handleApprove = async (empId: string) => {
    setPayingId(empId)
    try {
      await updateDoc(doc(db, COLLECTIONS.EMPLOYEES, empId), {
        [`commissionPaid_${selectedMonth}`]: true,
        updatedAt: serverTimestamp(),
      })
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setPayingId(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">ระบบคอมมิชชั่น</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {loading ? 'กำลังโหลด...' : `ยอดรวมเดือนนี้: ${formatCurrency(totalCommission)}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="month" value={selectedMonth}
            onChange={e => { setSelectedMonth(e.target.value); setLoading(true) }}
            className="px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none"
          />
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm hover:bg-[var(--bg-base)] transition-all">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-[var(--bg-base)] rounded-xl w-fit">
        {(['summary', 'detail'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === v ? 'bg-white text-[var(--pink-600)] shadow-sm' : 'text-[var(--text-muted)]'}`}>
            {v === 'summary' ? 'สรุปรายพนักงาน' : 'รายละเอียดยอดขาย'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto animate-spin" /></div>
      ) : view === 'summary' ? (
        summaryData.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--text-muted)]">
            ไม่มีพนักงาน — เพิ่มพนักงานได้ที่หน้า{' '}
            <a href="/staff" className="text-[var(--pink-500)] hover:underline">พนักงาน</a>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaryData.map(({ emp, totalSales, rate, commission }) => (
              <div key={emp.id} className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full luxury-gradient flex items-center justify-center text-white font-bold">
                    {emp.firstName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{emp.firstName} {emp.lastName}</p>
                    <p className="text-xs text-[var(--text-muted)]">{emp.position} · คอม {rate}%</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">ยอดขาย</span>
                    <span className="font-semibold">{formatCurrency(totalSales)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">คอมมิชชั่น ({rate}%)</span>
                    <span className="font-bold text-[var(--pink-500)]">{formatCurrency(commission)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleApprove(emp.id)}
                  disabled={payingId === emp.id}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-100 transition-all disabled:opacity-40">
                  {payingId === emp.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Check className="w-4 h-4" />}
                  อนุมัติจ่าย
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-light)] bg-[var(--bg-base)]">
                  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-5 py-3">ใบเสร็จ</th>
                  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">ผู้บันทึก</th>
                  <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-4 py-3">ยอดขาย</th>
                  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">วันที่</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {sales.length === 0 ? (
                  <tr><td colSpan={4} className="py-12 text-center text-sm text-[var(--text-muted)]">ไม่มีรายการขายเดือนนี้</td></tr>
                ) : sales.map(s => (
                  <tr key={s.id} className="hover:bg-[var(--pink-50)]/30">
                    <td className="px-5 py-3 text-sm font-medium">{s.receiptNo}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{s.createdBy}</td>
                    <td className="px-4 py-3 text-right font-bold text-sm text-[var(--pink-500)]">{formatCurrency(s.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-muted)]">
                      {new Date(s.createdAt).toLocaleDateString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
