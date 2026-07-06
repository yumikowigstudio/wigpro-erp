'use client'
import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Undo2, Search, Loader2, Package, CheckCircle2 } from 'lucide-react'
import { collection, query, where, getDocs, doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, addDocument } from '@/lib/firestore'
import { Sale, SaleItem } from '@/types'
import { useAuth } from '@/hooks/useAuth'

interface Row extends SaleItem { returnQty: number }

const methods = [
  { id: 'cash', label: 'เงินสด' }, { id: 'transfer', label: 'โอนเงิน' },
  { id: 'qr', label: 'QR' }, { id: 'credit_card', label: 'บัตร' },
]

export default function ReturnsPage() {
  const { companyId, branchId, userId } = useAuth()
  const [receiptNo, setReceiptNo] = useState('')
  const [searching, setSearching] = useState(false)
  const [sale, setSale]   = useState<Sale | null>(null)
  const [rows, setRows]   = useState<Row[]>([])
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState<{ returnNo: string; total: number } | null>(null)

  const handleSearch = async () => {
    if (!receiptNo.trim() || !companyId) return
    setSearching(true); setSale(null); setDone(null)
    try {
      const snap = await getDocs(query(
        collection(db, COLLECTIONS.SALES),
        where('companyId', '==', companyId),
        where('receiptNo', '==', receiptNo.trim()),
      ))
      if (snap.empty) { alert('ไม่พบใบเสร็จเลขที่นี้'); return }
      const d = snap.docs[0]
      const data = { id: d.id, ...d.data() } as Sale
      setSale(data)
      setRows((data.items ?? []).map(it => ({ ...it, returnQty: 0 })))
    } catch (err) {
      alert('ค้นหาไม่สำเร็จ: ' + (err instanceof Error ? err.message : ''))
    } finally { setSearching(false) }
  }

  const setQty = (i: number, v: number) =>
    setRows(rows.map((r, idx) => idx === i ? { ...r, returnQty: Math.max(0, Math.min(v, r.quantity)) } : r))

  const refundSubtotal = rows.reduce((s, r) => s + r.returnQty * r.unitPrice, 0)
  const refundVat   = refundSubtotal * 0.07
  const refundTotal = refundSubtotal + refundVat
  const anyReturn   = rows.some(r => r.returnQty > 0)

  const handleConfirm = async () => {
    if (!anyReturn || !sale) return
    if (!companyId || companyId === 'demo_company') { alert('ระบบกำลังโหลดข้อมูล กรุณารอสักครู่'); return }
    if (!confirm(`ยืนยันการคืนสินค้า คืนเงิน ${formatCurrency(refundTotal)}?`)) return
    setSaving(true)
    const returnedItems = rows.filter(r => r.returnQty > 0)
    const returnNo = `RTN-${new Date().toISOString().slice(2,10).replace(/-/g,'')}${String(Date.now()).slice(-4)}`
    try {
      await addDocument(COLLECTIONS.RETURNS, {
        companyId, branchId, returnNo,
        originalSaleId: sale.id, originalReceiptNo: sale.receiptNo,
        customerId: sale.customerId ?? null, customerName: sale.customerName ?? null,
        items: returnedItems.map(r => ({ productId: r.productId ?? null, name: r.name, quantity: r.returnQty, unitPrice: r.unitPrice, total: r.returnQty * r.unitPrice })),
        refundSubtotal, refundVat, refundTotal, method,
        reason: reason.trim() || null, createdBy: userId,
      } as never)

      // คืนสต๊อกสินค้า (เฉพาะ product ที่มี productId) + บันทึกการเคลื่อนไหว
      for (const r of returnedItems) {
        if (r.type !== 'product' || !r.productId) continue
        await updateDoc(doc(db, COLLECTIONS.PRODUCTS, r.productId), {
          stockQty: increment(r.returnQty), updatedAt: serverTimestamp(),
        }).catch(() => {})
        addDocument(COLLECTIONS.STOCK_MOVEMENTS, {
          companyId, branchId, productId: r.productId, productName: r.name,
          type: 'in', quantity: r.returnQty, referenceType: 'return', referenceNo: returnNo,
          notes: `คืนจากบิล ${sale.receiptNo}`,
        } as never).catch(() => {})
      }

      setDone({ returnNo, total: refundTotal })
    } catch (err) {
      alert('บันทึกการคืนไม่สำเร็จ: ' + (err instanceof Error ? err.message : ''))
    } finally { setSaving(false) }
  }

  const reset = () => { setReceiptNo(''); setSale(null); setRows([]); setReason(''); setDone(null) }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">คืน / เปลี่ยนสินค้า</h1>
        <p className="text-sm text-[var(--text-muted)]">ค้นหาใบเสร็จ เลือกสินค้าที่จะคืน ระบบจะคืนสต๊อกให้อัตโนมัติ</p>
      </div>

      {done ? (
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-8 text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
          <p className="font-bold text-lg text-[var(--text-primary)]">คืนสินค้าสำเร็จ</p>
          <p className="text-sm text-[var(--text-muted)]">เลขที่ {done.returnNo} · คืนเงิน {formatCurrency(done.total)}</p>
          <button onClick={reset} className="px-5 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold">คืนรายการใหม่</button>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input value={receiptNo} onChange={e => setReceiptNo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="เลขที่ใบเสร็จ เช่น RCP-..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />
            </div>
            <button onClick={handleSearch} disabled={searching}
              className="px-5 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center gap-2">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} ค้นหา
            </button>
          </div>

          {sale && (
            <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border-light)] bg-[var(--bg-base)]">
                <p className="text-sm font-semibold">ใบเสร็จ {sale.receiptNo}</p>
                <p className="text-xs text-[var(--text-muted)]">{sale.customerName || 'ลูกค้าทั่วไป'} · ยอดรวม {formatCurrency(sale.totalAmount)}</p>
              </div>
              <div className="divide-y divide-[var(--border-light)]">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-4">
                    <div className="w-9 h-9 rounded-xl bg-[var(--pink-50)] flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-[var(--pink-400)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">ขายไป {r.quantity} · {formatCurrency(r.unitPrice)}/ชิ้น{r.type === 'service' ? ' · บริการ (ไม่คืนสต๊อก)' : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-[var(--text-muted)]">คืน</span>
                      <input type="number" min={0} max={r.quantity} value={r.returnQty || ''}
                        onChange={e => setQty(i, parseInt(e.target.value) || 0)}
                        className="w-14 px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-5 space-y-3 border-t border-[var(--border-light)]">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">วิธีคืนเงิน</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {methods.map(m => (
                      <button key={m.id} onClick={() => setMethod(m.id)}
                        className={`py-2 rounded-lg text-xs font-semibold transition-all ${method === m.id ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white' : 'bg-[var(--bg-base)] border border-[var(--border-light)] text-[var(--text-secondary)]'}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="เหตุผลการคืน (ไม่บังคับ)"
                  className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />

                <div className="bg-[var(--bg-base)] rounded-xl p-3 space-y-1 text-sm">
                  <div className="flex justify-between text-[var(--text-secondary)]"><span>ยอดคืนก่อน VAT</span><span>{formatCurrency(refundSubtotal)}</span></div>
                  <div className="flex justify-between text-[var(--text-secondary)]"><span>VAT 7%</span><span>{formatCurrency(refundVat)}</span></div>
                  <div className="flex justify-between font-bold text-[var(--pink-600)] pt-1 border-t border-[var(--border-light)]"><span>คืนเงินรวม</span><span>{formatCurrency(refundTotal)}</span></div>
                </div>

                <button onClick={handleConfirm} disabled={!anyReturn || saving}
                  className="w-full py-3 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-bold shadow-md shadow-pink-200 disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</> : <><Undo2 className="w-4 h-4" />ยืนยันคืนสินค้า · {formatCurrency(refundTotal)}</>}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
