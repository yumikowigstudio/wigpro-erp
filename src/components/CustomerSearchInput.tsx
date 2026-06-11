'use client'
import { useState, useEffect, useRef } from 'react'
import { Search, User, X } from 'lucide-react'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'
import { Customer } from '@/types'

interface CustomerSearchInputProps {
  companyId: string
  selectedId?: string
  selectedName?: string
  onSelect: (customerId: string, customerName: string, customer?: Customer) => void
  onClear?: () => void
  placeholder?: string
  className?: string
}

export function CustomerSearchInput({
  companyId,
  selectedId,
  selectedName,
  onSelect,
  onClear,
  placeholder = 'ค้นหาลูกค้า...',
  className = '',
}: CustomerSearchInputProps) {
  const [query_,     setQuery]     = useState('')
  const [customers,  setCustomers] = useState<Customer[]>([])
  const [filtered,   setFiltered]  = useState<Customer[]>([])
  const [open,       setOpen]      = useState(false)
  const [loading,    setLoading]   = useState(false)
  const [loaded,     setLoaded]    = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Load customers once (lazy, on first focus)
  const loadCustomers = async () => {
    if (loaded || loading) return
    setLoading(true)
    try {
      const snap = await getDocs(query(
        collection(db, COLLECTIONS.CUSTOMERS),
        where('companyId', '==', companyId),
        where('status', '==', 'active'),
        orderBy('firstName'),
      ))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))
      setCustomers(list)
      setLoaded(true)
    } catch {
      // silent fail
    } finally {
      setLoading(false)
    }
  }

  // Filter on query change
  useEffect(() => {
    if (!query_.trim()) { setFiltered(customers.slice(0, 20)); return }
    const q = query_.toLowerCase()
    setFiltered(
      customers.filter(c =>
        c.firstName?.toLowerCase().includes(q) ||
        c.lastName?.toLowerCase().includes(q) ||
        c.nickname?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.customerId?.toLowerCase().includes(q)
      ).slice(0, 20)
    )
  }, [query_, customers])

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (c: Customer) => {
    const name = `${c.firstName} ${c.lastName}`.trim()
    onSelect(c.id, name, c)
    setQuery('')
    setOpen(false)
  }

  const handleClear = () => {
    onSelect('', '')
    setQuery('')
    onClear?.()
  }

  // Show selected state
  if (selectedId && selectedName) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-[var(--pink-50)] border border-[var(--pink-200)] rounded-xl ${className}`}>
        <div className="w-6 h-6 rounded-full luxury-gradient flex items-center justify-center shrink-0">
          <User className="w-3 h-3 text-white" />
        </div>
        <span className="flex-1 text-xs font-semibold text-[var(--pink-700)] truncate">{selectedName}</span>
        <button onClick={handleClear} className="text-[var(--text-muted)] hover:text-red-400 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
        <input
          value={query_}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { loadCustomers(); setOpen(true) }}
          placeholder={placeholder}
          className="w-full pl-8 pr-4 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-[var(--pink-300)] border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[var(--border-light)] rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-xs text-[var(--text-muted)] text-center">
              {loading ? 'กำลังโหลด...' : 'ไม่พบลูกค้า'}
            </div>
          ) : (
            filtered.map(c => (
              <button key={c.id} onMouseDown={() => handleSelect(c)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--pink-50)] transition-colors text-left">
                <div className="w-8 h-8 rounded-xl luxury-gradient flex items-center justify-center shrink-0 text-white text-xs font-bold">
                  {c.firstName?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {c.firstName} {c.lastName}
                    {c.nickname && <span className="text-[var(--text-muted)] font-normal"> ({c.nickname})</span>}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{c.phone} · {c.customerId}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
