'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, Loader2, X } from 'lucide-react'
import { collection, endAt, getDocs, limit, orderBy, query, startAt, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type { PermissionKey } from '@/lib/permissions'
import { findCatalogMainBranch, isCatalogVisibleInBranch } from '@/lib/catalogScope'

type Result = { id: string; title: string; detail: string; href: string }
export function GlobalSearch() {
  const { companyId, branchId, branches, hasPermission } = useAuth()
  const root = useRef<HTMLDivElement>(null)
  const mainBranchId = findCatalogMainBranch(branches, branchId)?.id ?? branchId
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    const value = term.trim()
    let active = true
    setResults([]); setError('')
    if (value.length < 2 || !companyId) { setLoading(false); return }
    setLoading(true)
    const timer = setTimeout(async () => {
      const sources: Array<{ name: string; fields: string[]; permission: PermissionKey; branch: boolean; label: string }> = [
        { name: 'customers', fields: ['firstName', 'lastName', 'nickname', 'phone', 'customerId'], permission: 'page.customers', branch: false, label: 'ลูกค้า' },
        { name: 'products', fields: ['name', 'sku'], permission: 'page.products', branch: false, label: 'สินค้า' },
        { name: 'sales', fields: ['receiptNo'], permission: 'page.documents', branch: true, label: 'ใบเสร็จ' },
        { name: 'deposits', fields: ['depositNo'], permission: 'page.deposits', branch: true, label: 'มัดจำ' },
        { name: 'work_orders', fields: ['orderNo', 'customerName'], permission: 'page.production', branch: true, label: 'งานผลิต' },
      ]
      const jobs = sources.filter(source => hasPermission(source.permission)).flatMap(source => source.fields.map(async field => {
        const prefix = /No$|Id$|sku/.test(field) ? value.toUpperCase() : value
        const snap = await getDocs(query(collection(db, source.name), where('companyId', '==', companyId), ...(source.branch ? [where('branchId', '==', branchId)] : []), orderBy(field), startAt(prefix), endAt(prefix + '\uf8ff'), limit(6)))
        return snap.docs.filter(record => record.data().status !== 'deleted' && (source.name !== 'products' || (record.data().isActive !== false && isCatalogVisibleInBranch(record.data(), branchId, mainBranchId)))).map(record => {
          const data = record.data()
          const title = source.name === 'customers' ? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() : String(data.name ?? data.receiptNo ?? data.depositNo ?? data.orderNo)
          const href = source.name === 'customers' ? `/customers/${record.id}` : source.name === 'products' ? `/products/${record.id}` : source.name === 'sales' ? `/documents?q=${encodeURIComponent(title)}` : source.name === 'deposits' ? `/deposits?q=${encodeURIComponent(title)}` : `/production?q=${encodeURIComponent(title)}`
          return { id: `${source.name}-${record.id}`, title, detail: `${source.label} · ${data.phone ?? data.customerName ?? data.sku ?? ''}`, href }
        })
      }))
      const responses = await Promise.allSettled(jobs)
      if (!active) return
      const found = responses.flatMap(response => response.status === 'fulfilled' ? response.value : [])
      setResults([...new Map(found.map(result => [result.id, result])).values()])
      if (responses.some(response => response.status === 'rejected')) setError('บางหมวดค้นหาไม่สำเร็จ กรุณาลองใหม่')
      setLoading(false)
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [term, companyId, branchId, mainBranchId, hasPermission])
  return <div ref={root} className="relative flex-1 min-w-0 max-w-sm">
    <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
    <input aria-label="ค้นหาทั้งระบบ" value={term} onChange={event => { setTerm(event.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }} placeholder="ชื่อ เบอร์โทร เลขบิล หรือเลขงาน" className="w-full rounded-lg border border-[var(--border-light)] bg-white pl-9 pr-9 py-2 text-sm" />
    {term && <button aria-label="ล้างคำค้นหา" onClick={() => { setTerm(''); setOpen(false) }} className="absolute right-2 top-2 p-1"><X className="h-4 w-4" /></button>}
    {open && term.trim().length >= 2 && <>
      <div className="absolute top-full mt-2 z-40 w-[min(28rem,85vw)] max-h-96 overflow-y-auto rounded-lg border bg-white shadow-lg">
        {loading && <div className="p-4 text-sm flex gap-2"><Loader2 className="h-4 w-4 animate-spin" />กำลังค้นหา</div>}
        {error && <p className="p-3 text-xs text-red-600">{error}</p>}
        {!loading && !results.length && <p className="p-4 text-sm text-[var(--text-muted)]">ไม่พบรายการ</p>}
        {results.map(result => <Link key={result.id} href={result.href} onClick={() => { setOpen(false); setTerm('') }} className="block border-b px-4 py-3 hover:bg-[var(--pink-50)]"><p className="text-sm font-semibold break-words">{result.title}</p><p className="text-xs text-[var(--text-muted)]">{result.detail}</p></Link>)}
      </div>
    </>}
  </div>
}
