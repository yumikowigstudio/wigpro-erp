'use client'
import { useState, useEffect } from 'react'
import { formatDateTime } from '@/lib/utils'
import { Search, BookOpen, User, ShoppingCart, Edit, Trash2, LogIn, LogOut, Loader2, Package } from 'lucide-react'
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'

const actionIcons: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  login:   { icon: LogIn,        color: 'bg-emerald-100 text-emerald-600', label: 'Login'       },
  logout:  { icon: LogOut,       color: 'bg-gray-100 text-gray-600',       label: 'Logout'      },
  create:  { icon: User,         color: 'bg-blue-100 text-blue-600',       label: 'เพิ่มข้อมูล' },
  update:  { icon: Edit,         color: 'bg-amber-100 text-amber-600',     label: 'แก้ไขข้อมูล'},
  delete:  { icon: Trash2,       color: 'bg-red-100 text-red-600',         label: 'ลบข้อมูล'   },
  sale:    { icon: ShoppingCart, color: 'bg-purple-100 text-purple-600',   label: 'ขาย'         },
  stock:   { icon: Package,      color: 'bg-teal-100 text-teal-600',       label: 'สต๊อก'       },
}

interface ActivityLog {
  id: string
  companyId: string
  userId: string
  userName?: string
  action: string
  module: string
  description: string
  createdAt: Date
}

export default function ActivityLogPage() {
  const { companyId } = useAuth()
  const [logs, setLogs]               = useState<ActivityLog[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filterModule, setFilterModule] = useState('')
  const [filterAction, setFilterAction] = useState('')

  useEffect(() => {
    if (!companyId || companyId === 'demo_company') { setLoading(false); return }
    const q = query(
      collection(db, COLLECTIONS.ACTIVITY_LOGS),
      where('companyId', '==', companyId),
      limit(200)
    )
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => {
        const data = d.data()
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt ?? Date.now())
        return { id: d.id, ...data, createdAt } as ActivityLog
      })
      // Sort newest-first client-side (avoids composite index)
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setLogs(list)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [companyId])

  const modules = Array.from(new Set(logs.map(l => l.module).filter(Boolean)))

  const filtered = logs.filter(log => {
    const q = search.toLowerCase()
    const matchSearch = !q || [log.userName, log.description, log.module].some(v => v?.toLowerCase().includes(q))
    return matchSearch
      && (!filterModule || log.module === filterModule)
      && (!filterAction || log.action === filterAction)
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--pink-50)] flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-[var(--pink-600)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">บันทึกกิจกรรม</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {loading ? 'กำลังโหลด...' : `${filtered.length} รายการ`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหากิจกรรม ผู้ใช้งาน..."
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />
        </div>
        <select value={filterModule} onChange={e => setFilterModule(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none">
          <option value="">ทุก Module</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none">
          <option value="">ทุกการกระทำ</option>
          {Object.entries(actionIcons).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-[var(--border-light)]">
          <Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto mb-3 animate-spin" />
          <p className="text-[var(--text-muted)] text-sm">กำลังโหลด...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-[var(--border-light)]">
          <BookOpen className="w-12 h-12 text-[var(--pink-100)] mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">
            {companyId === 'demo_company' ? 'กรุณา login ด้วยบัญชีจริง' : 'ยังไม่มีบันทึกกิจกรรม'}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            กิจกรรมจะถูกบันทึกอัตโนมัติเมื่อมีการใช้งานระบบ
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[var(--border-light)] divide-y divide-[var(--border-light)]">
          {filtered.map(log => {
            const info = actionIcons[log.action] ?? { icon: BookOpen, color: 'bg-gray-100 text-gray-600', label: log.action }
            return (
              <div key={log.id} className="flex items-start gap-4 px-5 py-4 hover:bg-[var(--bg-base)] transition-colors">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${info.color}`}>
                  <info.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)]">{log.description}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-[var(--text-muted)]">
                    {log.userName && <span className="font-medium text-[var(--text-secondary)]">{log.userName}</span>}
                    {log.userName && <span>·</span>}
                    <span className="px-2 py-0.5 bg-[var(--bg-base)] rounded-full">{log.module}</span>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)] shrink-0 mt-0.5">{formatDateTime(log.createdAt)}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
