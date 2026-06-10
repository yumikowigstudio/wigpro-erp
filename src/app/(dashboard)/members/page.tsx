'use client'
import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Star, Search, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { Customer } from '@/types'

const levelConfig = {
  silver:   { label: 'Silver',   color: 'bg-gray-100 text-gray-700',    gradient: 'from-gray-300 to-gray-400'      },
  gold:     { label: 'Gold',     color: 'bg-amber-100 text-amber-700',   gradient: 'from-amber-400 to-yellow-500'   },
  platinum: { label: 'Platinum', color: 'bg-blue-100 text-blue-700',     gradient: 'from-blue-400 to-indigo-500'    },
  vip:      { label: 'VIP',      color: 'bg-purple-100 text-purple-700', gradient: 'from-purple-500 to-pink-500'    },
}

type LevelKey = keyof typeof levelConfig

export default function MembersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState('')

  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.CUSTOMERS),
      where('status', '!=', 'deleted'),
      orderBy('status'),
      orderBy('totalPurchase', 'desc')
    )
    return onSnapshot(q, snap => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Customer[])
      setLoading(false)
    }, () => setLoading(false))
  }, [])

  const members = customers.filter(c => c.memberLevel)

  const filtered = members.filter(c => {
    const q = search.toLowerCase()
    const name = `${c.firstName} ${c.lastName}`
    const matchSearch = !q || name.toLowerCase().includes(q) || c.phone?.includes(q)
    const matchLevel  = !filterLevel || c.memberLevel === filterLevel
    return matchSearch && matchLevel
  })

  const levelCount = (lv: string) => members.filter(c => c.memberLevel === lv).length

  const getNextLevel = (level: string): { next: LevelKey | null; minPurchase: number | null } => {
    const map: Record<string, { next: LevelKey | null; minPurchase: number | null }> = {
      silver:   { next: 'gold',     minPurchase: 50000  },
      gold:     { next: 'platinum', minPurchase: 150000 },
      platinum: { next: 'vip',      minPurchase: 400000 },
      vip:      { next: null,       minPurchase: null   },
    }
    return map[level] ?? { next: null, minPurchase: null }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">สมาชิกและสะสมแต้ม</h1>
          <p className="text-sm text-[var(--text-muted)]">{loading ? 'กำลังโหลด...' : `${filtered.length} คน`}</p>
        </div>
        <Link href="/customers/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 luxury-gradient text-white rounded-xl text-sm font-semibold shadow-md hover:opacity-90 transition-all self-start">
          + เพิ่มสมาชิก
        </Link>
      </div>

      {/* Level summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(levelConfig) as [LevelKey, typeof levelConfig[LevelKey]][]).map(([level, cfg]) => (
          <div key={level} className={`p-4 rounded-xl bg-gradient-to-br ${cfg.gradient} text-white`}>
            <p className="text-2xl font-bold">{levelCount(level)}</p>
            <p className="text-sm opacity-90">{cfg.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์โทร..."
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none" />
        </div>
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none">
          <option value="">ทุกระดับ</option>
          {(Object.entries(levelConfig) as [LevelKey, typeof levelConfig[LevelKey]][]).map(([k, v]) =>
            <option key={k} value={k}>{v.label}</option>
          )}
        </select>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-[var(--text-muted)]">
          {members.length === 0
            ? 'ยังไม่มีสมาชิก — ระบุระดับสมาชิกในหน้าแก้ไขลูกค้า'
            : 'ไม่พบสมาชิกที่ค้นหา'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(customer => {
            const level = (customer.memberLevel ?? 'silver') as LevelKey
            const cfg = levelConfig[level] ?? levelConfig.silver
            const { next, minPurchase } = getNextLevel(level)
            const totalPurchase = customer.totalPurchase ?? 0
            const progress = minPurchase ? Math.min((totalPurchase / minPurchase) * 100, 100) : 100

            return (
              <Link key={customer.id} href={`/customers/${customer.id}`}
                className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden hover:shadow-md transition-all block">
                <div className={`h-1.5 bg-gradient-to-r ${cfg.gradient}`} />
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white font-bold`}>
                      {customer.firstName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-[var(--text-primary)]">
                        {customer.firstName} {customer.lastName}
                      </p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-amber-600 flex items-center justify-center gap-1">
                        <Star className="w-3.5 h-3.5" /> {(customer.points ?? 0).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">แต้มสะสม</p>
                    </div>
                    <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
                      <p className="text-sm font-bold text-[var(--pink-500)]">{formatCurrency(totalPurchase)}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">ยอดซื้อสะสม</p>
                    </div>
                  </div>

                  {next && minPurchase && (
                    <div>
                      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
                        <span>ความคืบหน้าสู่ {levelConfig[next].label}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 bg-[var(--border-light)] rounded-full">
                        <div className={`h-1.5 bg-gradient-to-r ${cfg.gradient} rounded-full transition-all`}
                          style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        ต้องการอีก {formatCurrency(Math.max(0, minPurchase - totalPurchase))}
                      </p>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
