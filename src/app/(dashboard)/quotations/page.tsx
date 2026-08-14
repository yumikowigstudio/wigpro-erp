'use client'
import { useState, useEffect } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, Plus, X, Loader2, Trash2, Printer, Search } from 'lucide-react'
import { collection, onSnapshot, query, where, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, addDocument, convertTimestamps, generateBranchDocumentNo } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'

interface QItem { description: string; quantity: number; unitPrice: number }
interface Quotation {
  id: string; companyId: string; branchId: string; quotationNo: string
  branchName?: string; branchCode?: string
  customerName: string; validUntil?: string; notes?: string
  items: QItem[]; subtotal: number; vatAmount: number; total: number
  status: string; createdBy: string; createdAt: Date
}
interface ShopInfo { nameTh: string; taxId?: string; phone?: string; address?: string }

const inputCls = 'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

export default function QuotationsPage() {
  const { companyId, branchId, userId, currentBranch } = useAuth()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [shop, setShop]       = useState<ShopInfo>({ nameTh: 'ร้านของฉัน' })
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [form, setForm] = useState({ customerName: '', validUntil: '', notes: '' })
  const [items, setItems] = useState<QItem[]>([{ description: '', quantity: 1, unitPrice: 0 }])

  useEffect(() => {
    if (!companyId || !branchId) return
    const q = query(collection(db, COLLECTIONS.QUOTATIONS), where('companyId', '==', companyId), where('branchId', '==', branchId))
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) }) as Quotation)
        .filter(d => d.status !== 'deleted')
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setQuotations(list)
      setLoading(false)
    }, () => setLoading(false))

    getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId)).then(d => {
      if (d.exists()) {
        const c = d.data()
        setShop({ nameTh: c.nameTh || 'ร้านของฉัน', taxId: c.taxId, phone: c.phone, address: c.address })
      }
    }).catch(() => {})
    return unsub
  }, [branchId, companyId])

  const subtotal = items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0)
  const vatAmount = subtotal * 0.07
  const total = subtotal + vatAmount

  const setItem = (i: number, k: keyof QItem, v: string) =>
    setItems(items.map((it, idx) => idx === i ? { ...it, [k]: k === 'description' ? v : (parseFloat(v) || 0) } : it))
  const addItem = () => setItems([...items, { description: '', quantity: 1, unitPrice: 0 }])
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))

  const resetForm = () => {
    setForm({ customerName: '', validUntil: '', notes: '' })
    setItems([{ description: '', quantity: 1, unitPrice: 0 }])
  }

  const handleSave = async () => {
    if (!form.customerName.trim() || items.every(it => !it.description.trim())) {
      alert('กรุณากรอกชื่อลูกค้าและรายการอย่างน้อย 1 รายการ'); return
    }
    if (!companyId || companyId === 'demo_company') {
      alert('ระบบกำลังโหลดข้อมูลผู้ใช้ กรุณารอสักครู่แล้วลองใหม่'); return
    }
    setSaving(true)
    const cleanItems = items.filter(it => it.description.trim())
    try {
      const quotationNo = await generateBranchDocumentNo(companyId, branchId, 'quotation')
      await addDocument(COLLECTIONS.QUOTATIONS, {
        companyId, branchId, quotationNo,
        branchName: currentBranch?.name ?? '',
        branchCode: currentBranch?.code ?? '',
        customerName: form.customerName.trim(),
        validUntil: form.validUntil || null,
        notes: form.notes.trim() || null,
        items: cleanItems, subtotal, vatAmount, total,
        status: 'active', createdBy: userId,
      } as never)
      resetForm(); setShowModal(false)
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ลองใหม่'))
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ลบใบเสนอราคานี้?')) return
    setDeleting(id)
    try {
      await updateDoc(doc(db, COLLECTIONS.QUOTATIONS, id), { status: 'deleted', updatedAt: serverTimestamp() })
    } finally { setDeleting(null) }
  }

  const handlePrint = (q: Quotation) => {
    const win = window.open('', '_blank', 'width=720,height=900')
    if (!win) { alert('กรุณาอนุญาต popup เพื่อพิมพ์'); return }
    const rows = q.items.map(it => `<tr>
      <td>${it.description}</td>
      <td style="text-align:center">${it.quantity}</td>
      <td style="text-align:right">${formatCurrency(it.unitPrice)}</td>
      <td style="text-align:right">${formatCurrency(it.quantity * it.unitPrice)}</td></tr>`).join('')
    win.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/>
      <title>ใบเสนอราคา ${q.quotationNo}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Sarabun','Noto Sans Thai',sans-serif;font-size:14px;color:#333;padding:32px;max-width:720px;margin:0 auto}
        .head{display:flex;justify-content:space-between;border-bottom:2px solid #f472b6;padding-bottom:12px;margin-bottom:16px}
        .shop{font-size:20px;font-weight:700;color:#cc2d65}
        .muted{font-size:12px;color:#888;white-space:pre-line}
        .title{font-size:18px;font-weight:700;text-align:right}
        .meta{font-size:12px;color:#666;margin-top:4px;text-align:right}
        table{width:100%;border-collapse:collapse;margin:16px 0}
        th{background:#fce4ee;color:#cc2d65;font-size:12px;padding:8px;text-align:left}
        td{padding:8px;border-bottom:1px solid #eee;font-size:13px}
        .totals{margin-left:auto;width:260px;font-size:13px}
        .totals div{display:flex;justify-content:space-between;padding:4px 0}
        .grand{font-weight:700;font-size:16px;color:#cc2d65;border-top:2px solid #f472b6;margin-top:4px;padding-top:6px}
        .notes{margin-top:16px;font-size:12px;color:#666}
        @media print{body{padding:12px}}
      </style></head><body>
      <div class="head">
        <div><div class="shop">${shop.nameTh}</div>
          ${q.branchName ? `<div class="muted">สาขา ${q.branchName}${q.branchCode ? ` (${q.branchCode})` : ''}</div>` : ''}
          ${shop.address ? `<div class="muted">${shop.address}</div>` : ''}
          ${shop.phone ? `<div class="muted">โทร. ${shop.phone}</div>` : ''}
          ${shop.taxId ? `<div class="muted">เลขผู้เสียภาษี ${shop.taxId}</div>` : ''}
        </div>
        <div><div class="title">ใบเสนอราคา</div>
          <div class="meta">เลขที่ ${q.quotationNo}</div>
          <div class="meta">วันที่ ${formatDate(q.createdAt)}</div>
          ${q.validUntil ? `<div class="meta">ยืนราคาถึง ${q.validUntil}</div>` : ''}
        </div>
      </div>
      <div><strong>ลูกค้า:</strong> ${q.customerName}</div>
      <table><thead><tr><th>รายการ</th><th style="text-align:center">จำนวน</th><th style="text-align:right">ราคา/หน่วย</th><th style="text-align:right">รวม</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="totals">
        <div><span>รวมเป็นเงิน</span><span>${formatCurrency(q.subtotal)}</span></div>
        <div><span>VAT 7%</span><span>${formatCurrency(q.vatAmount)}</span></div>
        <div class="grand"><span>ยอดรวมทั้งสิ้น</span><span>${formatCurrency(q.total)}</span></div>
      </div>
      ${q.notes ? `<div class="notes">หมายเหตุ: ${q.notes}</div>` : ''}
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400)}<\/script>
      </body></html>`)
    win.document.close()
  }

  const filtered = quotations.filter(q =>
    !search || q.quotationNo.toLowerCase().includes(search.toLowerCase()) || q.customerName.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">ใบเสนอราคา</h1>
          <p className="text-sm text-[var(--text-muted)]">สร้างและพิมพ์ใบเสนอราคาให้ลูกค้า</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200 hover:opacity-95 transition-all">
          <Plus className="w-4 h-4" /> สร้างใบเสนอราคา
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเลขที่ / ชื่อลูกค้า..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-7 h-7 text-[var(--pink-300)] mx-auto animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-12 h-12 text-[var(--pink-100)] mx-auto mb-3" />
            <p className="text-[var(--text-muted)] text-sm">ยังไม่มีใบเสนอราคา</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {filtered.map(q => (
              <div key={q.id} className="flex items-center gap-3 p-4 hover:bg-[var(--pink-50)]/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--text-primary)]">{q.quotationNo}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{q.customerName} · {formatDate(q.createdAt)}</p>
                </div>
                <span className="font-bold text-sm text-[var(--pink-500)]">{formatCurrency(q.total)}</span>
                <button onClick={() => handlePrint(q)} title="พิมพ์"
                  className="p-2 rounded-lg hover:bg-[var(--pink-50)] text-[var(--text-muted)] hover:text-[var(--pink-600)] transition-all"><Printer className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(q.id)} disabled={deleting === q.id} title="ลบ"
                  className="p-2 rounded-lg hover:bg-red-50 text-[var(--text-muted)] hover:text-red-500 transition-all">
                  {deleting === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-light)] shrink-0">
              <h3 className="font-bold text-[var(--text-primary)]">สร้างใบเสนอราคา</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">ชื่อลูกค้า *</label>
                <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">ยืนราคาถึงวันที่</label>
                <input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} className={inputCls} />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)] block">รายการ</label>
                {items.map((it, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <input value={it.description} onChange={e => setItem(i, 'description', e.target.value)} placeholder="รายละเอียด"
                      className={inputCls + ' flex-1'} />
                    <input type="number" value={it.quantity || ''} onChange={e => setItem(i, 'quantity', e.target.value)} placeholder="จำนวน"
                      className={inputCls + ' w-16 text-center'} />
                    <input type="number" value={it.unitPrice || ''} onChange={e => setItem(i, 'unitPrice', e.target.value)} placeholder="ราคา"
                      className={inputCls + ' w-20 text-right'} />
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 shrink-0"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                <button onClick={addItem} className="text-xs text-[var(--pink-500)] font-semibold hover:underline">+ เพิ่มรายการ</button>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">หมายเหตุ</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls + ' resize-none'} />
              </div>

              <div className="bg-[var(--bg-base)] rounded-xl p-3 space-y-1 text-sm">
                <div className="flex justify-between text-[var(--text-secondary)]"><span>รวมเป็นเงิน</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-[var(--text-secondary)]"><span>VAT 7%</span><span>{formatCurrency(vatAmount)}</span></div>
                <div className="flex justify-between font-bold text-[var(--pink-600)] pt-1 border-t border-[var(--border-light)]"><span>ยอดรวม</span><span>{formatCurrency(total)}</span></div>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border-light)] flex gap-3 shrink-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
