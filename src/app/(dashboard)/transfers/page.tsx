'use client'
import { useState, useEffect } from 'react'
import { formatDate } from '@/lib/utils'
import { ArrowLeftRight, Plus, X, Loader2, Package, Copy, Download } from 'lucide-react'
import { collection, onSnapshot, query, where, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { getBranchStock, adjustBranchStock, invId } from '@/lib/stock'
import { useAuth } from '@/hooks/useAuth'

interface Branch { id: string; name: string; code?: string }
interface Prod { id: string; name: string; sku?: string; stockQty?: number; costPrice?: number }
interface Inv { productId: string; branchId: string; quantity: number }
interface TItem { productId: string; name: string; quantity: number }
interface TOrder { id: string; orderNo: string; fromBranchId: string; toBranchId: string; items: TItem[]; createdAt?: Date }

const sel = 'px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]'

export default function TransfersPage() {
  const { companyId, userId } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [products, setProducts] = useState<Prod[]>([])
  const [inv, setInv] = useState<Record<string, number>>({})   // key `${pid}_${bid}` -> qty
  const [orders, setOrders] = useState<TOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<{ productId: string; quantity: string }[]>([{ productId: '', quantity: '' }])

  useEffect(() => {
    if (!companyId) return
    const u1 = onSnapshot(query(collection(db, COLLECTIONS.BRANCHES), where('companyId', '==', companyId)),
      s => setBranches(s.docs.map(d => ({ id: d.id, ...d.data() } as Branch))))
    const u2 = onSnapshot(query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', companyId)),
      s => { setProducts(s.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) } as Prod)).filter(p => (p as unknown as { status?: string }).status !== 'deleted')); setLoading(false) })
    const u3 = onSnapshot(query(collection(db, COLLECTIONS.INVENTORY), where('companyId', '==', companyId)),
      s => { const m: Record<string, number> = {}; s.docs.forEach(d => { const x = d.data() as Inv; m[invId(x.productId, x.branchId)] = x.quantity ?? 0 }); setInv(m) })
    const u4 = onSnapshot(query(collection(db, COLLECTIONS.TRANSFER_ORDERS), where('companyId', '==', companyId)),
      s => setOrders(s.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) } as TOrder)).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))))
    return () => { u1(); u2(); u3(); u4() }
  }, [companyId])

  const branchName = (id: string) => branches.find(b => b.id === id)?.name ?? id
  const avail = (pid: string, bid: string) => inv[invId(pid, bid)] ?? 0

  // Seed: สร้างสต๊อกในคลัง (inventory) จาก product.stockQty เข้าสาขาที่เลือก
  const seedBranch = async (bid: string) => {
    if (!bid || !companyId) return
    setBusy('seed')
    try {
      for (const p of products) {
        await adjustBranchStock({ companyId, productId: p.id, productName: p.name, branchId: bid,
          delta: p.stockQty ?? 0, type: 'in', costPrice: p.costPrice, referenceType: 'seed', performedBy: userId })
      }
      setMsg({ t: 'ok', m: `นำสต๊อกสินค้าเข้าคลัง "${branchName(bid)}" แล้ว` })
    } catch (e) { setMsg({ t: 'err', m: 'seed ไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') }) }
    finally { setBusy('') }
  }

  // Clone: สร้างสินค้าทั้งหมดเข้าสาขาใหม่ด้วยจำนวน 0
  const cloneToBranch = async (bid: string) => {
    if (!bid || !companyId) return
    if (!confirm(`โคลนรายการสินค้าทั้งหมดเข้าสาขา "${branchName(bid)}" (จำนวน 0)?`)) return
    setBusy('clone')
    try {
      for (const p of products) {
        if (inv[invId(p.id, bid)] === undefined) {
          await adjustBranchStock({ companyId, productId: p.id, productName: p.name, branchId: bid,
            delta: 0, type: 'adjust', costPrice: p.costPrice, referenceType: 'clone', performedBy: userId })
        }
      }
      setMsg({ t: 'ok', m: `โคลนสินค้าเข้าสาขา "${branchName(bid)}" แล้ว (จำนวน 0)` })
    } catch (e) { setMsg({ t: 'err', m: 'โคลนไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') }) }
    finally { setBusy('') }
  }

  const setRow = (i: number, k: 'productId' | 'quantity', v: string) =>
    setRows(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows([...rows, { productId: '', quantity: '' }])
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i))

  const submitTransfer = async () => {
    if (!from || !to || from === to) { setMsg({ t: 'err', m: 'เลือกสาขาต้นทาง/ปลายทางให้ต่างกัน' }); return }
    const items = rows.filter(r => r.productId && Number(r.quantity) > 0)
    if (items.length === 0) { setMsg({ t: 'err', m: 'เพิ่มรายการอย่างน้อย 1 รายการ' }); return }
    // ตรวจสต๊อกต้นทางพอไหม
    for (const r of items) {
      const cur = await getBranchStock(r.productId, from)
      if (Number(r.quantity) > cur) {
        setMsg({ t: 'err', m: `${products.find(p => p.id === r.productId)?.name}: สต๊อกต้นทางเหลือ ${cur} ไม่พอโอน ${r.quantity}` }); return
      }
    }
    setBusy('transfer')
    try {
      const orderNo = `TF-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}${String(Date.now()).slice(-4)}`
      for (const r of items) {
        const p = products.find(x => x.id === r.productId)!
        const qty = Number(r.quantity)
        await adjustBranchStock({ companyId, productId: p.id, productName: p.name, branchId: from, delta: -qty, type: 'transfer_out', costPrice: p.costPrice, referenceType: 'transfer', referenceNo: orderNo, performedBy: userId })
        await adjustBranchStock({ companyId, productId: p.id, productName: p.name, branchId: to, delta: qty, type: 'transfer_in', costPrice: p.costPrice, referenceType: 'transfer', referenceNo: orderNo, performedBy: userId })
      }
      await addDoc(collection(db, COLLECTIONS.TRANSFER_ORDERS), {
        companyId, orderNo, fromBranchId: from, toBranchId: to,
        items: items.map(r => ({ productId: r.productId, name: products.find(p => p.id === r.productId)?.name ?? '', quantity: Number(r.quantity) })),
        status: 'received', requestedBy: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      setMsg({ t: 'ok', m: `โอนสำเร็จ (${orderNo})` })
      setRows([{ productId: '', quantity: '' }]); setShowModal(false)
    } catch (e) { setMsg({ t: 'err', m: 'โอนไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') }) }
    finally { setBusy('') }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-[var(--pink-500)]" /> โอนสินค้าระหว่างสาขา
          </h1>
          <p className="text-sm text-[var(--text-muted)]">โอนสต๊อกจากคลัง/สาขาหนึ่งไปอีกสาขา · สต๊อกแยกต่อสาขา</p>
        </div>
        <button onClick={() => { setMsg(null); setShowModal(true) }} disabled={branches.length < 2}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200 hover:opacity-95 disabled:opacity-40 transition-all">
          <Plus className="w-4 h-4" /> สร้างใบโอน
        </button>
      </div>

      {branches.length < 2 && (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700">
          ต้องมีอย่างน้อย 2 สาขาถึงจะโอนได้ · เพิ่มสาขาที่ ตั้งค่า → สาขา
        </div>
      )}

      {msg && (
        <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${msg.t === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>{msg.m}</div>
      )}

      {/* เครื่องมือคลัง */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 space-y-3">
        <p className="text-sm font-semibold text-[var(--text-primary)]">เครื่องมือคลัง</p>
        <div className="flex flex-wrap gap-2 items-center">
          {branches.map(b => (
            <div key={b.id} className="flex items-center gap-1.5 border border-[var(--border-light)] rounded-xl px-2 py-1.5">
              <span className="text-xs font-medium">{b.name}</span>
              <button onClick={() => seedBranch(b.id)} disabled={!!busy} title="นำสต๊อกสินค้าปัจจุบันเข้าคลังสาขานี้"
                className="text-[11px] px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-semibold disabled:opacity-40 flex items-center gap-1">
                <Download className="w-3 h-3" /> Seed
              </button>
              <button onClick={() => cloneToBranch(b.id)} disabled={!!busy} title="โคลนรายการสินค้าเข้าสาขานี้ (จำนวน 0)"
                className="text-[11px] px-2 py-1 bg-blue-50 text-blue-700 rounded-lg font-semibold disabled:opacity-40 flex items-center gap-1">
                <Copy className="w-3 h-3" /> Clone
              </button>
            </div>
          ))}
          {busy && <Loader2 className="w-4 h-4 animate-spin text-[var(--pink-400)]" />}
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">Seed = นำสต๊อกสินค้าปัจจุบันเข้าคลังสาขานั้น (ทำครั้งแรก) · Clone = สร้างรายการสินค้าเข้าสาขาใหม่จำนวน 0</p>
      </div>

      {/* สต๊อกต่อสาขา (ตาราง) */}
      {products.length > 0 && branches.length > 0 && (
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--border-light)]">
              <th className="text-left text-xs font-semibold text-[var(--text-muted)] p-3">สินค้า</th>
              {branches.map(b => <th key={b.id} className="text-right text-xs font-semibold text-[var(--text-muted)] p-3">{b.name}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {products.slice(0, 50).map(p => (
                <tr key={p.id} className="hover:bg-[var(--pink-50)]/30">
                  <td className="p-3 font-medium truncate max-w-[200px]">{p.name}</td>
                  {branches.map(b => <td key={b.id} className="p-3 text-right">{avail(p.id, b.id)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ประวัติใบโอน */}
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">ประวัติการโอน</p>
        {loading ? <Loader2 className="w-6 h-6 animate-spin text-[var(--pink-300)]" /> : orders.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-6 text-center bg-white rounded-2xl border border-[var(--border-light)]">ยังไม่มีการโอน</p>
        ) : (
          <div className="space-y-2">
            {orders.map(o => (
              <div key={o.id} className="bg-white rounded-xl border border-[var(--border-light)] p-3 flex items-center gap-3">
                <Package className="w-4 h-4 text-[var(--pink-400)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{o.orderNo}</p>
                  <p className="text-xs text-[var(--text-muted)]">{branchName(o.fromBranchId)} → {branchName(o.toBranchId)} · {o.items?.length ?? 0} รายการ{o.createdAt ? ` · ${formatDate(o.createdAt)}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal สร้างใบโอน */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-light)]">
              <h3 className="font-bold text-[var(--text-primary)]">สร้างใบโอนสินค้า</h3>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">จากสาขา</label>
                  <select value={from} onChange={e => setFrom(e.target.value)} className={sel + ' w-full'}>
                    <option value="">เลือก...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">ไปสาขา</label>
                  <select value={to} onChange={e => setTo(e.target.value)} className={sel + ' w-full'}>
                    <option value="">เลือก...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]">รายการ</label>
                {rows.map((r, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <select value={r.productId} onChange={e => setRow(i, 'productId', e.target.value)} className={sel + ' flex-1'}>
                      <option value="">เลือกสินค้า</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}{from ? ` (มี ${avail(p.id, from)})` : ''}</option>)}
                    </select>
                    <input type="number" min="1" value={r.quantity} onChange={e => setRow(i, 'quantity', e.target.value)} placeholder="จำนวน" className={sel + ' w-20 text-center'} />
                    {rows.length > 1 && <button onClick={() => removeRow(i)} className="text-red-400"><X className="w-4 h-4" /></button>}
                  </div>
                ))}
                <button onClick={addRow} className="text-xs text-[var(--pink-500)] font-semibold">+ เพิ่มรายการ</button>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border-light)] flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">ยกเลิก</button>
              <button onClick={submitTransfer} disabled={busy === 'transfer'} className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                {busy === 'transfer' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />} ยืนยันโอน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
