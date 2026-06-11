'use client'
import { useState, useEffect } from 'react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { FileText, Search, Download, Eye, Printer, Loader2, Receipt } from 'lucide-react'
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'

const docTypeConfig = {
  quotation:       { label: 'ใบเสนอราคา',     color: 'bg-blue-100 text-blue-700'                },
  deposit_receipt: { label: 'ใบมัดจำ',         color: 'bg-amber-100 text-amber-700'              },
  receipt:         { label: 'ใบเสร็จรับเงิน',  color: 'bg-emerald-100 text-emerald-700'          },
  tax_invoice:     { label: 'ใบกำกับภาษี',     color: 'bg-purple-100 text-purple-700'            },
  work_order:      { label: 'ใบสั่งผลิตวิก',   color: 'bg-[#f5ede3] text-[var(--pink-600)]'     },
}

interface DocItem {
  id:           string
  type:         keyof typeof docTypeConfig
  docNo:        string
  customerName: string
  amount:       number
  createdAt:    Date
  sourceId:     string
  sourceType:   'receipt' | 'deposit' | 'work_order'
}

export default function DocumentsPage() {
  const { companyId } = useAuth()
  const [docs,      setDocs]      = useState<DocItem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    if (!companyId) return

    let receipts:    DocItem[] = []
    let deposits:    DocItem[] = []
    let workOrders:  DocItem[] = []
    let loaded = 0
    const done = () => { loaded++; if (loaded === 3) setLoading(false) }

    const merge = () => {
      const all = [...receipts, ...deposits, ...workOrders]
      all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setDocs(all)
    }

    /* ── Receipts (Sales) ── */
    const q1 = query(collection(db, COLLECTIONS.SALES), where('companyId', '==', companyId))
    const u1 = onSnapshot(q1, snap => {
      receipts = snap.docs.map(d => {
        const data = convertTimestamps(d.data())
        return {
          id:           d.id,
          type:         'receipt' as const,
          docNo:        data.receiptNo ?? d.id,
          customerName: data.customerName ?? 'ลูกค้าทั่วไป',
          amount:       data.totalAmount ?? data.total ?? 0,
          createdAt:    data.createdAt instanceof Date ? data.createdAt : new Date(),
          sourceId:     d.id,
          sourceType:   'receipt' as const,
        }
      })
      merge(); done()
    }, () => done())

    /* ── Deposits ── */
    const q2 = query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', companyId))
    const u2 = onSnapshot(q2, snap => {
      deposits = snap.docs.map(d => {
        const data = convertTimestamps(d.data())
        return {
          id:           d.id,
          type:         'deposit_receipt' as const,
          docNo:        data.depositNo ?? d.id,
          customerName: data.customerName ?? '—',
          amount:       data.depositAmount ?? 0,
          createdAt:    data.createdAt instanceof Date ? data.createdAt : new Date(),
          sourceId:     d.id,
          sourceType:   'deposit' as const,
        }
      })
      merge(); done()
    }, () => done())

    /* ── Work Orders ── */
    const q3 = query(collection(db, COLLECTIONS.WORK_ORDERS), where('companyId', '==', companyId))
    const u3 = onSnapshot(q3, snap => {
      workOrders = snap.docs.map(d => {
        const data = convertTimestamps(d.data())
        return {
          id:           d.id,
          type:         'work_order' as const,
          docNo:        data.orderNo ?? d.id,
          customerName: data.customerName ?? '—',
          amount:       data.totalPrice ?? data.price ?? 0,
          createdAt:    data.createdAt instanceof Date ? data.createdAt : new Date(),
          sourceId:     d.id,
          sourceType:   'work_order' as const,
        }
      })
      merge(); done()
    }, () => done())

    return () => { u1(); u2(); u3() }
  }, [companyId])

  const filtered = docs.filter(d => {
    const q = search.toLowerCase()
    return (!q || [d.docNo, d.customerName].some(v => v.toLowerCase().includes(q)))
      && (!filterType || d.type === filterType)
  })

  const handlePrint = (item: DocItem) => {
    // Open in new window for printing (placeholder — can extend later)
    alert(`พิมพ์เอกสาร ${item.docNo}\n\nฟีเจอร์พิมพ์ PDF จะพัฒนาเพิ่มเติม`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">เอกสาร</h1>
          <p className="text-sm text-[var(--text-muted)]">{loading ? '...' : `${filtered.length} ฉบับ`}</p>
        </div>
        <div className="flex gap-2 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl">
            <Receipt className="w-3.5 h-3.5 text-[var(--pink-400)]" />
            <span>ดึงข้อมูลอัตโนมัติจากระบบ</span>
          </div>
        </div>
      </div>

      {/* Type summary chips */}
      {!loading && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterType('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${!filterType ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
            ทั้งหมด ({docs.length})
          </button>
          {(Object.entries(docTypeConfig) as [string, { label: string; color: string }][]).map(([k, v]) => {
            const count = docs.filter(d => d.type === k).length
            if (!count) return null
            return (
              <button key={k} onClick={() => setFilterType(k)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filterType === k ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                {v.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Search & Filter */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเลขเอกสาร ชื่อลูกค้า..."
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]">
          <option value="">ประเภทเอกสารทั้งหมด</option>
          {Object.entries(docTypeConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Documents list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#f472b6]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <FileText className="w-14 h-14 text-[var(--text-muted)]" />
          <p className="text-[var(--text-muted)] text-sm">
            {docs.length === 0
              ? 'ยังไม่มีเอกสาร — เอกสารจะแสดงหลังจากมีการขาย มัดจำ หรือสั่งผลิตวิก'
              : 'ไม่พบเอกสารที่ค้นหา'}
          </p>
          {docs.length === 0 && (
            <div className="flex gap-3 mt-2">
              <Link href="/pos" className="px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-all">
                ไปที่ POS ขาย
              </Link>
              <Link href="/deposits" className="px-4 py-2 border border-[var(--border-light)] bg-white text-[var(--text-secondary)] rounded-xl text-xs font-semibold hover:bg-[var(--bg-base)] transition-all">
                รับมัดจำ
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[var(--border-light)] divide-y divide-[var(--border-light)]">
          {filtered.map(item => {
            const cfg = docTypeConfig[item.type]
            return (
              <div key={`${item.sourceType}-${item.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--bg-subtle)] transition-colors">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-base)] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-[var(--pink-600)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm font-bold text-[var(--pink-600)]">{item.docNo}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {item.customerName} · {formatDate(item.createdAt)}
                  </p>
                </div>
                <p className="font-semibold text-sm text-[var(--text-primary)] hidden sm:block shrink-0">
                  {formatCurrency(item.amount)}
                </p>
                <div className="flex gap-1.5 shrink-0">
                  {item.sourceType === 'receipt' && (
                    <Link href={`/pos`}
                      className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--pink-600)] transition-all" title="ดูใบเสร็จ">
                      <Eye className="w-4 h-4" />
                    </Link>
                  )}
                  {item.sourceType === 'work_order' && (
                    <Link href={`/production`}
                      className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--pink-600)] transition-all" title="ดูใบสั่งผลิต">
                      <Eye className="w-4 h-4" />
                    </Link>
                  )}
                  <button onClick={() => handlePrint(item)}
                    className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-blue-600 transition-all" title="พิมพ์">
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-green-600 transition-all" title="ดาวน์โหลด PDF (เร็วๆ นี้)">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
