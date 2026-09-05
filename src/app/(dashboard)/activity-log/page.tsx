'use client'
import { useState } from 'react'
import { usePagedCollection } from '@/hooks/usePagedCollection'
import { LoadMore } from '@/components/LoadMore'
import { formatDateTime } from '@/lib/utils'
import {
  Search, BookOpen, User, ShoppingCart, Edit, Trash2, LogIn, LogOut,
  Loader2, Package, CreditCard, Ban, ArrowLeftRight, Factory,
  ImageIcon, ShieldCheck, DatabaseBackup, RotateCcw, Wrench,
} from 'lucide-react'
import { COLLECTIONS } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'

const actionIcons: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  login:   { icon: LogIn,        color: 'bg-emerald-100 text-emerald-600', label: 'Login'       },
  logout:  { icon: LogOut,       color: 'bg-gray-100 text-gray-600',       label: 'Logout'      },
  create:  { icon: User,         color: 'bg-blue-100 text-blue-600',       label: 'เพิ่มข้อมูล' },
  update:  { icon: Edit,         color: 'bg-amber-100 text-amber-600',     label: 'แก้ไขข้อมูล'},
  delete:  { icon: Trash2,       color: 'bg-red-100 text-red-600',         label: 'ลบข้อมูล'   },
  sale:    { icon: ShoppingCart, color: 'bg-purple-100 text-purple-600',   label: 'ขาย'         },
  deposit: { icon: CreditCard,   color: 'bg-amber-100 text-amber-700',     label: 'มัดจำ'        },
  payment: { icon: ShieldCheck,  color: 'bg-emerald-100 text-emerald-700', label: 'ชำระเงิน'     },
  cancel:  { icon: Ban,          color: 'bg-red-100 text-red-700',         label: 'ยกเลิก'       },
  stock:   { icon: Package,      color: 'bg-teal-100 text-teal-600',       label: 'สต๊อก'       },
  transfer:{ icon: ArrowLeftRight,color: 'bg-sky-100 text-sky-700',        label: 'โอนสินค้า'    },
  production:{ icon: Factory,    color: 'bg-violet-100 text-violet-700',   label: 'งานผลิต'      },
  photo:   { icon: ImageIcon,    color: 'bg-pink-100 text-pink-700',       label: 'รูปภาพ'       },
  backup:  { icon: DatabaseBackup,color: 'bg-indigo-100 text-indigo-700',  label: 'สำรองข้อมูล'  },
  restore: { icon: RotateCcw,    color: 'bg-blue-100 text-blue-700',       label: 'กู้คืนข้อมูล' },
  repair:  { icon: Wrench,       color: 'bg-orange-100 text-orange-700',   label: 'ซ่อมข้อมูล'   },
  system:  { icon: BookOpen,     color: 'bg-gray-100 text-gray-700',       label: 'ระบบ'         },
}

interface ActivityLog {
  id: string
  companyId: string
  userId: string
  userName?: string
  action: string
  module: string
  description: string
  recordId?: string
  recordType?: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

export default function ActivityLogPage() {
  const { companyId } = useAuth()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const page = usePagedCollection<ActivityLog>(COLLECTIONS.ACTIVITY_LOGS, companyId, { from, to })
  const { items: logs, loading } = page
  const [search, setSearch]           = useState('')
  const [filterModule, setFilterModule] = useState('')
  const [filterAction, setFilterAction] = useState('')


  const modules = Array.from(new Set(logs.map(l => l.module).filter(Boolean)))

  const filtered = logs.filter(log => {
    const q = search.toLowerCase()
    const matchSearch = !q || [log.userName, log.description, log.module, log.recordId, log.recordType].some(v => v?.toLowerCase().includes(q))
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
      <div className="flex flex-wrap gap-3 text-sm">
        <label>ตั้งแต่<input aria-label="วันที่เริ่มต้น" type="date" value={from} onChange={event => setFrom(event.target.value)} className="ml-2 rounded-lg border p-2" /></label>
        <label>ถึง<input aria-label="วันที่สิ้นสุด" type="date" value={to} onChange={event => setTo(event.target.value)} className="ml-2 rounded-lg border p-2" /></label>
      </div>
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
                    {log.recordId && <span className="px-2 py-0.5 bg-[var(--bg-base)] rounded-full">{log.recordId}</span>}
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)] shrink-0 mt-0.5">{formatDateTime(log.createdAt)}</p>
              </div>
            )
          })}
        </div>
      )}
      <LoadMore hasMore={page.hasMore} loading={page.loadingMore} onClick={page.loadMore} error={page.error} />
    </div>
  )
}
