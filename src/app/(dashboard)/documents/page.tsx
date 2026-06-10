'use client'
import { useState } from 'react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { FileText, Plus, Search, Download, Eye, Printer } from 'lucide-react'

const docTypeConfig = {
  quotation: { label: 'ใบเสนอราคา', color: 'bg-blue-100 text-blue-700' },
  deposit_receipt: { label: 'ใบมัดจำ', color: 'bg-amber-100 text-amber-700' },
  receipt: { label: 'ใบเสร็จรับเงิน', color: 'bg-emerald-100 text-emerald-700' },
  tax_invoice: { label: 'ใบกำกับภาษี', color: 'bg-purple-100 text-purple-700' },
  work_order: { label: 'ใบสั่งผลิตวิก', color: 'bg-[#f5ede3] text-[var(--pink-600)]' },
}

const mockDocuments = [
  { id: '1', type: 'receipt', docNo: 'RCP-012406040012', customerName: 'คุณสมใจ รักดี', amount: 45000, createdAt: new Date('2024-06-04') },
  { id: '2', type: 'deposit_receipt', docNo: 'DEP-2406-001', customerName: 'คุณสมใจ รักดี', amount: 15000, createdAt: new Date('2024-05-15') },
  { id: '3', type: 'work_order', docNo: '0105240001', customerName: 'คุณสมใจ รักดี', amount: 45000, createdAt: new Date('2024-05-15') },
  { id: '4', type: 'tax_invoice', docNo: 'TAX-2406-001', customerName: 'คุณมาลี สวยงาม', amount: 28000, createdAt: new Date('2024-06-01') },
]

export default function DocumentsPage() {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')

  const filtered = mockDocuments.filter((d) => {
    const q = search.toLowerCase()
    const matchSearch = !q || [d.docNo, d.customerName].some((v) => v.toLowerCase().includes(q))
    const matchType = !filterType || d.type === filterType
    return matchSearch && matchType
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">เอกสาร</h1>
          <p className="text-sm text-[var(--text-muted)]">{filtered.length} ฉบับ</p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 luxury-gradient text-white rounded-xl text-sm font-semibold shadow-md hover:opacity-90 transition-all self-start">
          <Plus className="w-4 h-4" /> สร้างเอกสาร
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเลขเอกสาร ชื่อลูกค้า..." className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none">
          <option value="">ประเภทเอกสารทั้งหมด</option>
          {Object.entries(docTypeConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Documents */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] divide-y divide-[var(--border-light)]">
        {filtered.map((doc) => {
          const cfg = docTypeConfig[doc.type as keyof typeof docTypeConfig]
          return (
            <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--bg-subtle)] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-base)] flex items-center justify-center">
                <FileText className="w-5 h-5 text-[var(--pink-600)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-bold text-[var(--pink-600)]">{doc.docNo}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{doc.customerName} · {formatDate(doc.createdAt)}</p>
              </div>
              <p className="font-semibold text-sm text-[var(--text-primary)] hidden sm:block">{formatCurrency(doc.amount)}</p>
              <div className="flex gap-1.5">
                <button className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--pink-600)] transition-all" title="ดู"><Eye className="w-4 h-4" /></button>
                <button className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-blue-600 transition-all" title="พิมพ์"><Printer className="w-4 h-4" /></button>
                <button className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-green-600 transition-all" title="ดาวน์โหลด PDF"><Download className="w-4 h-4" /></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
