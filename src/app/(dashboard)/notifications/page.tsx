'use client'
import { useOperationalAlerts } from '@/components/OperationalAlertsProvider'
import { useState } from 'react'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import {
  AlertTriangle, ArrowLeftRight, Bell, Calendar, CheckCircle2, CreditCard, Factory,
  KeyRound, Loader2, Package, ShieldCheck, Wallet,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

type AlertKind = 'payment' | 'deposit' | 'appointment' | 'stock' | 'transfer' | 'production' | 'permission' | 'system'

const alertConfig: Record<AlertKind, { icon: React.ElementType; color: string; label: string }> = {
  payment:    { icon: CreditCard,    color: 'bg-emerald-100 text-emerald-700', label: 'ชำระเงิน' },
  deposit:    { icon: Wallet,        color: 'bg-amber-100 text-amber-700',      label: 'มัดจำ' },
  appointment:{ icon: Calendar,      color: 'bg-blue-100 text-blue-700',       label: 'นัดหมาย' },
  stock:      { icon: Package,       color: 'bg-amber-100 text-amber-700',     label: 'สต๊อก' },
  transfer:   { icon: ArrowLeftRight, color: 'bg-cyan-100 text-cyan-700',       label: 'โอนสต๊อก' },
  production: { icon: Factory,       color: 'bg-purple-100 text-purple-700',   label: 'งานผลิต' },
  permission: { icon: KeyRound,      color: 'bg-pink-100 text-pink-700',       label: 'สิทธิ์' },
  system:     { icon: Bell,          color: 'bg-gray-100 text-gray-700',       label: 'ระบบ' },
}

export default function NotificationsPage() {
  const { currentBranch } = useAuth()
  const { alerts, loading, error, markRead, readIds } = useOperationalAlerts()
  const [filter, setFilter] = useState<AlertKind | 'all'>('all')

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.kind === filter)
  const highCount = alerts.filter(a => a.priority === 'high').length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">ศูนย์แจ้งเตือน</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {currentBranch?.name ? `สาขา ${currentBranch.name} · ` : ''}{loading ? 'กำลังโหลด...' : `${alerts.length} เรื่องที่ควรติดตาม`}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-light)] bg-white px-4 py-2">
          {highCount > 0 ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{loading ? 'กำลังตรวจสอบ' : error ? 'ข้อมูลไม่ครบ' : highCount > 0 ? `${highCount} เรื่องด่วน` : 'สถานะปกติ'}</span>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {(['all', 'payment', 'deposit', 'appointment', 'stock', 'transfer', 'production'] as Array<AlertKind | 'all'>).map(kind => (
          <button key={kind} onClick={() => setFilter(kind)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              filter === kind
                ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent'
                : 'bg-white text-[var(--text-secondary)] border-[var(--border-light)] hover:bg-[var(--pink-50)]'
            }`}>
            {kind === 'all' ? `ทั้งหมด (${alerts.length})` : `${alertConfig[kind].label} (${alerts.filter(a => a.kind === kind).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto mb-3 animate-spin" />
          <p className="text-[var(--text-muted)] text-sm">กำลังโหลดข้อมูลล่าสุด...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-[var(--border-light)]">
          <ShieldCheck className="w-12 h-12 text-emerald-200 mx-auto mb-3" />
          <p className="font-semibold text-[var(--text-primary)]">ไม่มีเรื่องที่ต้องติดตามในหมวดนี้</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">ระบบจะดึงจากบิล คิว สต๊อก งานผลิต และคำขอสิทธิ์อัตโนมัติ</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const cfg = alertConfig[item.kind]
            return (
              <Link key={item.id} href={item.href} onClick={() => markRead(item.id)}
                className={`flex items-start gap-4 p-4 rounded-2xl border bg-white hover:bg-[var(--pink-50)]/50 transition-all ${
                  item.priority === 'high' ? 'border-amber-200 shadow-sm' : 'border-[var(--border-light)]'
                }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.color}`}>
                  <cfg.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                    {!readIds.includes(item.id) && <span className="text-xs font-semibold text-pink-600">ใหม่</span>}
                    {item.priority === 'high' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">ด่วน</span>}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.message}</p>
                  <p className="text-xs text-[var(--text-light)] mt-1">{formatDateTime(item.createdAt)}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
