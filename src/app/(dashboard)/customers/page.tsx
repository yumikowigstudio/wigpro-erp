'use client'
import { useState, useEffect } from 'react'
import { Customer } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Search, Plus, Download, Eye, Edit, Phone, MessageCircle, Star, Users, UserPlus, TrendingUp, Calendar, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'

const caseLabels: Record<string, { label: string; color: string }> = {
  chemo:       { label: 'คีโม',         color: 'bg-pink-50 text-pink-600 border border-pink-100'    },
  thin_hair:   { label: 'ผมบาง',        color: 'bg-orange-50 text-orange-600 border border-orange-100' },
  allergy:     { label: 'แพ้ภูมิ',      color: 'bg-yellow-50 text-yellow-700 border border-yellow-100' },
  bald:        { label: 'ศีรษะล้าน',    color: 'bg-blue-50 text-blue-600 border border-blue-100'    },
  post_surgery:{ label: 'หลังผ่าตัด',   color: 'bg-purple-50 text-purple-600 border border-purple-100' },
  other:       { label: 'อื่นๆ',         color: 'bg-gray-50 text-gray-500 border border-gray-100'    },
}

const memberColors: Record<string, string> = {
  silver:   'bg-gray-100 text-gray-600',
  gold:     'bg-amber-50 text-amber-600 border border-amber-200',
  platinum: 'bg-blue-50 text-blue-600 border border-blue-200',
  vip:      'bg-purple-50 text-purple-600 border border-purple-200',
}

export default function CustomersPage() {
  const { companyId } = useAuth()
  const [customers, setCustomers]   = useState<Customer[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterCase, setFilterCase] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [newThisMonth, setNewThisMonth] = useState(0)
  const [todayApts, setTodayApts]   = useState(0)

  /* Export CSV */
  const exportCSV = () => {
    const headers = ['รหัสลูกค้า','ชื่อ','นามสกุล','ชื่อเล่น','เบอร์โทร','LINE ID','ระดับสมาชิก','แต้มสะสม','ยอดซื้อสะสม','ประเภทเคส']
    const rows = filtered.map(c => [
      c.customerId ?? '',
      c.firstName,
      c.lastName,
      c.nickname ?? '',
      c.phone,
      c.lineId ?? '',
      c.memberLevel ?? 'silver',
      c.points ?? 0,
      c.totalPurchase ?? 0,
      (c.caseTypes ?? []).join('|'),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `customers_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (!companyId) return
    // Filter by companyId — no orderBy to avoid composite index; sort client-side
    const q = query(
      collection(db, COLLECTIONS.CUSTOMERS),
      where('companyId', '==', companyId),
    )
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Customer[]
      // Sort newest first client-side
      all.sort((a, b) => {
        const da = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as unknown as string)
        const db_ = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt as unknown as string)
        return db_.getTime() - da.getTime()
      })
      setCustomers(all.filter(c => c.status !== 'deleted'))

      // New customers this month
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      setNewThisMonth(all.filter(c => {
        const d = c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt as unknown as string)
        return d >= monthStart
      }).length)

      setLoading(false)
    }, () => setLoading(false))

    // Today's appointments count
    const today = new Date(); today.setHours(0,0,0,0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const aptQ = query(
      collection(db, COLLECTIONS.APPOINTMENTS),
      where('date', '>=', Timestamp.fromDate(today)),
      where('date', '<', Timestamp.fromDate(tomorrow))
    )
    const unsubApt = onSnapshot(aptQ, snap => setTodayApts(snap.size), () => {})

    return () => { unsub(); unsubApt() }
  }, [companyId])

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || [c.firstName, c.lastName, c.phone, c.lineId, c.customerId].some(v => v?.toLowerCase().includes(q))
    return matchSearch && (!filterCase || c.caseTypes.includes(filterCase)) && (!filterLevel || c.memberLevel === filterLevel)
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">ลูกค้า (CRM)</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{filtered.length} รายการ</p>
        </div>
        <Link href="/customers/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-semibold shadow-md shadow-pink-200 hover:shadow-pink-300 hover:opacity-95 active:scale-[0.98] transition-all self-start">
          <Plus className="w-4 h-4" /> เพิ่มลูกค้าใหม่
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'ลูกค้าทั้งหมด',   value: customers.length, icon: Users,      color:'text-[var(--pink-500)]',  bg:'bg-[var(--pink-50)]'  },
          { label:'ลูกค้าใหม่เดือนนี้', value: newThisMonth,   icon: UserPlus,   color:'text-emerald-500',        bg:'bg-emerald-50'        },
          { label:'VIP / Platinum',  value: customers.filter(c => c.memberLevel === 'vip' || c.memberLevel === 'platinum').length, icon: TrendingUp, color:'text-purple-500', bg:'bg-purple-50' },
          { label:'นัดหมายวันนี้',   value: todayApts,        icon: Calendar,   color:'text-blue-500',           bg:'bg-blue-50'           },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-[var(--border-light)] p-4 shadow-[var(--shadow-card)]">
            <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
            </div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search & filter */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4 shadow-[var(--shadow-card)] flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ เบอร์โทร LINE ID รหัสลูกค้า..."
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
        </div>
        <select value={filterCase} onChange={e => setFilterCase(e.target.value)}
          className="px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all">
          <option value="">ประเภทเคส</option>
          {Object.entries(caseLabels).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}
          className="px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all">
          <option value="">ระดับสมาชิก</option>
          <option value="silver">Silver</option>
          <option value="gold">Gold</option>
          <option value="platinum">Platinum</option>
          <option value="vip">VIP</option>
        </select>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--pink-50)] hover:border-[var(--pink-200)] transition-all">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-light)] bg-[var(--bg-base)]">
                {['ลูกค้า', 'เบอร์โทร / LINE', 'ประเภทเคส', 'ระดับ / แต้ม', 'ยอดซื้อสะสม', ''].map(h => (
                  <th key={h} className={`text-left text-xs font-semibold text-[var(--text-muted)] px-5 py-3.5 ${h===''?'text-right':''} ${['ประเภทเคส','ระดับ / แต้ม'].includes(h)?'hidden md:table-cell':''} ${h==='ยอดซื้อสะสม'?'hidden lg:table-cell':''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-[var(--pink-50)]/40 transition-colors">
                  {/* Customer */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#f9a8d4] to-[#f472b6] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm shadow-pink-200">
                        {c.firstName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-[var(--text-primary)]">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-[var(--text-muted)]">{c.customerId}</p>
                      </div>
                    </div>
                  </td>
                  {/* Phone / LINE */}
                  <td className="px-5 py-4 hidden sm:table-cell">
                    <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]"><Phone className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {c.phone}</div>
                    {c.lineId && <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-0.5"><MessageCircle className="w-3.5 h-3.5 text-emerald-400" /> {c.lineId}</div>}
                  </td>
                  {/* Case types */}
                  <td className="px-5 py-4 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {c.caseTypes.map(ct => {
                        const info = caseLabels[ct] ?? { label: ct, color: 'bg-gray-50 text-gray-500' }
                        return <span key={ct} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${info.color}`}>{info.label}</span>
                      })}
                    </div>
                  </td>
                  {/* Member */}
                  <td className="px-5 py-4 hidden md:table-cell">
                    {c.memberLevel && (
                      <div>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${memberColors[c.memberLevel]}`}>
                          {c.memberLevel === 'silver' ? 'Silver' : c.memberLevel === 'gold' ? 'Gold' : c.memberLevel === 'platinum' ? 'Platinum' : 'VIP'}
                        </span>
                        <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400" /> {c.points?.toLocaleString()} แต้ม
                        </p>
                      </div>
                    )}
                  </td>
                  {/* Total */}
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <p className="font-bold text-sm text-[var(--pink-500)]">{formatCurrency(c.totalPurchase ?? 0)}</p>
                    <p className="text-xs text-[var(--text-muted)]">สมาชิกตั้งแต่ {formatDate(c.createdAt)}</p>
                  </td>
                  {/* Actions */}
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/customers/${c.id}`}
                        className="p-2 rounded-xl hover:bg-[var(--pink-100)] text-[var(--text-muted)] hover:text-[var(--pink-500)] transition-all" title="ดูข้อมูล">
                        <Eye className="w-4 h-4" />
                      </Link>
                      <Link href={`/customers/${c.id}/edit`}
                        className="p-2 rounded-xl hover:bg-blue-50 text-[var(--text-muted)] hover:text-blue-500 transition-all" title="แก้ไข">
                        <Edit className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loading && (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto mb-3 animate-spin" />
              <p className="text-[var(--text-muted)] text-sm">กำลังโหลด...</p>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-20 text-center">
              <Users className="w-12 h-12 text-[var(--pink-100)] mx-auto mb-3" />
              <p className="text-[var(--text-muted)] text-sm">ไม่พบข้อมูลลูกค้า</p>
              <Link href="/customers/new" className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--pink-500)] font-medium hover:underline">
                <Plus className="w-4 h-4" /> เพิ่มลูกค้าแรก
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
